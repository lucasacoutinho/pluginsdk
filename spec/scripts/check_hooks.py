import base64
import copy
import json
from pathlib import Path
import subprocess
import tempfile

from check_replay import SPEC, execute


def read_vectors():
    return [json.loads(line) for line in (SPEC / "vectors/hooks.ndjson").read_text(encoding="utf-8").split("\n") if line]


def compare(cases):
    result = execute("".join(json.dumps(case["request"], ensure_ascii=False) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(cases):
        raise RuntimeError("hook response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")


def check_wire(cases):
    sample = next(case for case in cases if case["name"] == "claude_session_start")
    malformed = []
    for path, value in [
        (("schema",), 2),
        (("unexpected",), True),
        (("input", "host"), "muse"),
        (("input", "unexpected"), True),
        (("input", "hooks"), []),
        (("input", "hooks"), None),
        (("input", "hooks", "context", "event"), "PreToolUse"),
        (("input", "hooks", "context", "unexpected"), True),
        (("input", "hooks", "context", "timeout"), 0),
        (("input", "hooks", "context", "timeout"), 601),
        (("input", "hooks", "context", "timeout"), -1),
        (("input", "hooks", "context", "timeout"), 1.5),
        (("input", "hooks", "context", "timeout"), "30"),
        (("input", "hooks", "context", "timeout"), None),
        (("input", "hooks", "context", "timeout"), False),
        (("input", "hooks", "context", "plan", "command", "type"), "unknown_word"),
        (("input", "hooks", "context", "plan", "command", "unexpected"), True),
        (("input", "hooks", "context", "plan", "command", "value"), "a\0b"),
        (("input", "hooks", "context", "plan", "cwd"), {"type": "file", "path": "../escape"}),
        (("input", "hooks", "context", "plan", "environment"), [{"name": "BAD-NAME", "value": {"type": "root"}}]),
    ]:
        changed = copy.deepcopy(sample["request"])
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        malformed.append(json.dumps(changed))
    for name in ["", "\ud800"]:
        changed = copy.deepcopy(sample["request"])
        changed["input"]["hooks"][name] = changed["input"]["hooks"].pop("context")
        malformed.append(json.dumps(changed))
    missing = copy.deepcopy(sample["request"])
    del missing["input"]["hooks"]["context"]["timeout"]
    malformed.append(json.dumps(missing))
    compact = json.dumps(sample["request"], separators=(",", ":"))
    malformed.extend(compact.replace('"timeout":30', '"timeout":' + value) for value in ["1e999", "1e-999", "-0"])
    for request in malformed:
        result = execute(request + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed hook request was accepted: {request}")
    print(f"{len(malformed)} malformed hook requests rejected")
    for representation in ["30.0", "3e1", "30.00000000000000001"]:
        result = execute(compact.replace('"timeout":30', '"timeout":' + representation) + "\n")
        if result.returncode != 0 or json.loads(result.stdout) != sample["expected"]:
            raise RuntimeError(f"equivalent integer timeout rejected: {representation}: {result.stderr}")
    print("3 equivalent JSON number representations preserve the integer timeout")


FIXTURE = """#!/usr/bin/python3
import base64
import json
import os
import sys

print(json.dumps({
    "argv": sys.argv[1:],
    "cwd": os.getcwd(),
    "stdin": base64.b64encode(sys.stdin.buffer.read()).decode("ascii"),
    "env": {name: os.environ.get(name) for name in ["OPTIND", "EMPTY", "IFS", "ROOT_COPY", "FILE_COPY"]},
    "transferNames": sorted(name for name in os.environ if name.startswith("SPSDK_")),
}))
"""


def check_shell():
    for host in ["claude_code", "codex"]:
        with tempfile.TemporaryDirectory(prefix="pluginsdk-hooks-") as temporary:
            caller = Path(temporary) / "caller"
            root = Path(temporary) / "package '$(touch PWNED)' `tick` \"double\" 雪"
            caller.mkdir()
            (root / "bin").mkdir(parents=True)
            (root / "work space").mkdir()
            app = root / "bin" / "probe.py"
            app.write_text(FIXTURE, encoding="utf-8")
            app.chmod(0o700)
            file_path = "data/path ' $(touch PWNED) `tick` 雪"
            (root / "data").mkdir()
            (root / file_path).write_text("support", encoding="utf-8")
            literals = ["", "literal $(touch PWNED) `tick` ' \" ${UNSET}", "line\n雪\u2028"]
            request = {"schema": 1, "type": "render_hooks", "input": {"host": host, "hooks": {"probe": {
                "event": "SessionStart", "timeout": 5, "plan": {
                    "command": {"type": "file", "path": "bin/probe.py"},
                    "args": [{"type": "file", "path": file_path}] + [{"type": "literal", "value": value} for value in literals],
                    "environment": [
                        {"name": "OPTIND", "value": {"type": "literal", "value": "chosen-value"}},
                        {"name": "EMPTY", "value": {"type": "literal", "value": ""}},
                        {"name": "IFS", "value": {"type": "literal", "value": "literal IFS"}},
                        {"name": "ROOT_COPY", "value": {"type": "root"}},
                        {"name": "FILE_COPY", "value": {"type": "file", "path": file_path}},
                    ],
                    "cwd": {"type": "file", "path": "work space"},
                },
            }}}}
            result = execute(json.dumps(request, ensure_ascii=False) + "\n")
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            output = json.loads(result.stdout)["output"]
            if output["type"] != "rendered":
                raise RuntimeError(f"literal process rejected: {output}")
            for file in output["files"]:
                path = root / file["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(file["content"], encoding="utf-8")
                path.chmod(0o700 if file["executable"] else 0o600)
            command = output["document"]["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            if "${" in command:
                raise RuntimeError("native command contains braced substitution")
            source = json.dumps({"hook_event_name": "SessionStart", "source": "startup", "cwd": str(caller)}, ensure_ascii=False) + "\n"
            environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "HOME": str(caller),
                "CLAUDE_PLUGIN_ROOT": str(root), "PLUGIN_ROOT": str(root)}
            actual = subprocess.run(["/bin/sh", "-c", command], cwd=caller, env=environment, input=source,
                text=True, encoding="utf-8", capture_output=True, timeout=5)
            expected = {
                "argv": [str(root / file_path), *literals],
                "cwd": str(root / "work space"),
                "stdin": base64.b64encode(source.encode("utf-8")).decode("ascii"),
                "env": {"OPTIND": "chosen-value", "EMPTY": "", "IFS": "literal IFS", "ROOT_COPY": str(root), "FILE_COPY": str(root / file_path)},
                "transferNames": [],
            }
            if actual.returncode != 0 or actual.stderr or json.loads(actual.stdout) != expected:
                raise RuntimeError(f"{host}: native command changed the process: {actual.returncode} {actual.stdout} {actual.stderr}")
            if any(Path(temporary).rglob("PWNED")):
                raise RuntimeError("native command evaluated fixture path or literal bytes")
    print("2 actual native-command shell controls preserve argv, cwd, environment and stdin without path evaluation")


def main():
    cases = read_vectors()
    compare(cases)
    print(f"{len(cases)} authored hook vectors match Lean")
    reordered = copy.deepcopy(cases)
    for case in reordered:
        case["request"]["input"]["hooks"] = dict(reversed(list(case["request"]["input"]["hooks"].items())))
    compare(reordered)
    print(f"{len(reordered)} declaration enumeration cases preserve the expected result")
    check_wire(cases)
    check_shell()


if __name__ == "__main__":
    main()
