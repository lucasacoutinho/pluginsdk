import copy
import json
from pathlib import Path
import subprocess
import tempfile

from check_replay import SPEC, execute


def read_vectors():
    return [json.loads(line) for line in (SPEC / "vectors/mcp.ndjson").read_text(encoding="utf-8").split("\n") if line]


def compare(cases):
    result = execute("".join(json.dumps(case["request"], ensure_ascii=False) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(cases):
        raise RuntimeError("MCP response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")


def check_malformed(cases):
    sample = cases[3]["request"]
    malformed = []
    for path, value in [
        (("schema",), 2),
        (("input", "format"), "agent_plugins_v3"),
        (("input", "unexpected"), True),
        (("input", "remote", "remote", "unexpected"), True),
        (("input", "remote", "remote", "headers", "bad name"), "value"),
        (("input", "local", "alpha", "command", "unexpected"), True),
        (("input", "local", "alpha", "command", "type"), "unknown_word"),
        (("input", "local", "alpha", "args"), [{"type": "literal", "value": "a\0b"}]),
        (("input", "local", "alpha", "cwd"), {"type": "file", "path": "../escape"}),
        (("input", "local", "alpha", "environment"), [{"name": "BAD-NAME", "value": {"type": "root"}}]),
    ]:
        changed = copy.deepcopy(sample)
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        malformed.append(changed)
    overlap = copy.deepcopy(sample)
    overlap["input"]["local"]["remote"] = overlap["input"]["local"].pop("alpha")
    malformed.append(overlap)
    empty = copy.deepcopy(sample)
    empty["input"]["local"][""] = empty["input"]["local"].pop("alpha")
    malformed.append(empty)
    for request in malformed:
        result = execute(json.dumps(request, ensure_ascii=False) + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed MCP request was accepted: {request}")
    print(f"{len(malformed)} malformed MCP requests rejected")


def check_cwd_root():
    for suffix in ["", "\n\n"]:
        with tempfile.TemporaryDirectory(prefix="pluginsdk-cwd-root-") as temporary:
            root = Path(temporary) / ("package '$(touch PWNED)' `tick` \"double\" 雪" + suffix)
            (root / "bin").mkdir(parents=True)
            (root / "work space").mkdir()
            (root / "data").mkdir()
            data = "data/file '雪\n"
            (root / data).write_text("captured bytes", encoding="utf-8")
            app = root / "bin/probe.py"
            app.write_text("""#!/usr/bin/python3
import json
import os
from pathlib import Path
import sys
print(json.dumps({
    "argv": sys.argv[1:], "cwd": os.getcwd(),
    "data": Path(sys.argv[1]).read_text(encoding="utf-8"),
    "env": {name: os.environ.get(name) for name in ["OPTIND", "EMPTY", "IFS", "PWD"]},
    "transfers": sorted(name for name in os.environ if name.startswith("SPSDK_")),
}))
""", encoding="utf-8")
            app.chmod(0o700)
            literals = ["", "literal ${UNSET} $(touch PWNED) `tick`", "line\n雪\u2028"]
            environment = {"OPTIND": "chosen-value", "EMPTY": "", "IFS": "literal IFS", "PWD": "requested PWD"}
            request = {"schema": 1, "type": "render_mcp", "input": {
                "format": "codex_plugin_v1", "remote": {}, "local": {"app": {
                    "command": {"type": "file", "path": "bin/probe.py"},
                    "args": [{"type": "file", "path": data}] + [{"type": "literal", "value": value} for value in literals],
                    "environment": [{"name": name, "value": {"type": "literal", "value": value}} for name, value in environment.items()],
                    "cwd": {"type": "file", "path": "work space"},
                }},
            }}
            rendered = execute(json.dumps(request, ensure_ascii=False) + "\n")
            if rendered.returncode != 0:
                raise RuntimeError(rendered.stderr)
            output = json.loads(rendered.stdout)["output"]
            if output["type"] != "rendered":
                raise RuntimeError(f"cwd-root plan rejected: {output}")
            for file in output["files"]:
                path = root / file["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(file["content"], encoding="utf-8")
                path.chmod(0o700 if file["executable"] else 0o600)
            native = output["document"]["mcpServers"]["app"]
            expected_native = {"command": "/bin/sh", "args": [".psdk/mcp/0.sh"], "env": {}, "cwd": "."}
            if native != expected_native:
                raise RuntimeError(f"noncanonical native cwd-root record: {native}")
            actual = subprocess.run([native["command"], *native["args"]], cwd=root / native["cwd"],
                env={"PATH": "/usr/bin:/bin", "PWD": "unrelated $(touch PWNED)", "LC_ALL": "C.UTF-8"},
                text=True, encoding="utf-8", capture_output=True, timeout=5)
            expected = {"argv": [str(root / data), *literals], "cwd": str(root / "work space"),
                "data": "captured bytes", "env": environment, "transfers": []}
            if actual.returncode != 0 or actual.stderr or json.loads(actual.stdout) != expected:
                raise RuntimeError(f"cwd-root execution changed process meaning: {actual.returncode} {actual.stdout} {actual.stderr}")
            if any(Path(temporary).rglob("PWNED")):
                raise RuntimeError("cwd-root launcher evaluated a path or literal argument")
    print("2 actual Codex cwd-root launchers preserve trailing root newlines, file arguments, cwd and literal environment")


def main():
    cases = read_vectors()
    compare(cases)
    print(f"{len(cases)} authored MCP composition vectors match Lean")
    reordered = copy.deepcopy(cases)
    for case in reordered:
        value = case["request"]["input"]
        for key in ["remote", "local"]:
            value[key] = dict(reversed(list(value[key].items())))
        for remote in value["remote"].values():
            remote["headers"] = dict(reversed(list(remote["headers"].items())))
    compare(reordered)
    print(f"{len(reordered)} record/header enumeration cases preserve the expected result")
    check_malformed(cases)
    check_cwd_root()


if __name__ == "__main__":
    main()
