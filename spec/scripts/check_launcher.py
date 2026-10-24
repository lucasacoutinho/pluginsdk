import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from check_replay import SPEC, execute


VECTORS = SPEC / "vectors/launcher.ndjson"
SAFE_OTHER = "$" + "{SAFE_OTHER}"
FIXTURE_SOURCE = """#!/usr/bin/python3
import json
import os
import sys

report_names = [name for name in os.environ.get("PROBE_REPORT_ENV", "").split(",") if name]
internal_names = [name for name in os.environ.get("PROBE_INTERNAL_NAMES", "").split(",") if name]
transfer_names = [name for name in os.environ.get("PROBE_TRANSFER_NAMES", "").split(",") if name]
print(json.dumps({
    "argv": sys.argv[1:],
    "cwd": os.getcwd(),
    "env": {name: os.environ.get(name) for name in report_names},
    "captureNamesPresent": [name for name in internal_names if name in os.environ],
    "transferNamesPresent": [name for name in transfer_names if name in os.environ],
}, ensure_ascii=False))
"""


def read_vectors():
    return [json.loads(line) for line in VECTORS.read_text(encoding="utf-8").split("\n") if line]


def compare_vectors(cases):
    request_text = "".join(
        json.dumps(case["request"], ensure_ascii=False, separators=(",", ":")) + "\n"
        for case in cases
    )
    result = execute(request_text)
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(cases):
        raise RuntimeError("launcher oracle response count differs")
    outputs = {}
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(
                f"{case['name']}: expected {case['expected']}, received {response}"
            )
        outputs[case["name"]] = response["output"]
    print(f"{len(cases)} independent launcher vectors match Lean")
    return outputs


def check_wire_inputs(cases):
    sample = copy.deepcopy(cases[2]["request"])
    malformed = []

    changed = copy.deepcopy(sample)
    changed["input"]["plan"]["command"]["unexpected"] = True
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["input"]["host"] = "unknown_host"
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["input"]["plan"]["args"][0]["type"] = "unknown_word"
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["input"]["plan"]["args"][1]["value"] = "a" + chr(0) + "b"
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["input"]["path"] = ".psdk/mcp/" + "$" + "{EXPANSION}.sh"
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["input"]["unexpected"] = True
    malformed.append(changed)

    changed = copy.deepcopy(sample)
    changed["schema"] = 2
    malformed.append(changed)

    for request in malformed:
        result = execute(json.dumps(request, ensure_ascii=False) + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed launcher request was accepted: {request}")
    print(f"{len(malformed)} malformed launcher requests rejected")


def simulated_claude_captures(native, sources):
    if native is None:
        raise RuntimeError("runtime capture scenarios require a native Claude declaration")
    captured = {}
    raw_pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
    check_pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*):-PSDK_ABSENT\}")
    for key, expression in native["env"].items():
        raw_match = raw_pattern.fullmatch(expression)
        check_match = check_pattern.fullmatch(expression)
        if raw_match is not None:
            source = raw_match.group(1)
            captured[key] = sources.get(source, "$" + "{" + source + "}")
        elif check_match is not None:
            source = check_match.group(1)
            captured[key] = sources.get(source, "PSDK_ABSENT")
        else:
            raise RuntimeError(f"unexpected native capture expression: {expression}")
    return captured


def write_fixture(path, executable=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(FIXTURE_SOURCE, encoding="utf-8")
    if executable:
        path.chmod(0o755)


def install_launcher(root, script):
    launcher = root / ".psdk" / "mcp" / "0.sh"
    launcher.parent.mkdir(parents=True, exist_ok=True)
    launcher.write_text(script, encoding="utf-8")
    launcher.chmod(0o755)
    return launcher


def new_package(parent, label):
    caller = parent / (label + "-caller'\n" + SAFE_OTHER + " Ω")
    root = caller / ("package'\n" + SAFE_OTHER + " λ")
    caller.mkdir(parents=True)
    root.mkdir()
    return caller, root


def run_shell(launcher, root, caller, native, sources, report_env=(), transfer_names=()):
    internal_names = list(native["env"]) if native is not None else []
    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": str(caller),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "SAFE_OTHER": "must-stay-literal",
        "PROBE_INTERNAL_NAMES": ",".join(internal_names),
        "PROBE_TRANSFER_NAMES": ",".join(transfer_names),
        "PROBE_REPORT_ENV": ",".join(report_env),
    }
    env.update(sources)
    env.update(simulated_claude_captures(native, sources))
    return subprocess.run(
        ["/bin/sh", str(launcher), str(root)],
        cwd=caller,
        env=env,
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=5,
    )


def assert_fixture_result(result, expected, label):
    if result.returncode != 0 or result.stderr:
        raise RuntimeError(f"{label}: launcher failed: {result.returncode} {result.stderr!r}")
    try:
        actual = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{label}: fixture output was not one JSON record: {result.stdout!r}") from error
    if actual != expected:
        raise RuntimeError(f"{label}: expected fixture result {expected}, received {actual}")


def check_runtime(outputs):
    if not Path("/usr/bin/python3").is_file():
        raise RuntimeError("the qualified /usr/bin/python3 fixture interpreter is unavailable")
    if shutil.which("python3", path="/usr/bin:/bin") is None:
        raise RuntimeError("python3 is unavailable on the controlled runtime PATH")

    with tempfile.TemporaryDirectory(prefix="pluginsdk-launcher-") as directory:
        parent = Path(directory)

        caller, root = new_package(parent, "packaged")
        complex_output = outputs["packaged_paths_and_literal_environment"]
        launcher = install_launcher(root, complex_output["script"])
        command_path = root / ("bin/mcp'\nλ" + SAFE_OTHER)
        write_fixture(command_path, executable=True)
        file_argument = "data/a'\nλ" + SAFE_OTHER + ".mjs"
        (root / file_argument).parent.mkdir(parents=True, exist_ok=True)
        (root / file_argument).write_text("packaged data\n", encoding="utf-8")
        work_path = root / "work dir'\nλ"
        work_path.mkdir()
        expected = {
            "argv": [str(root / file_argument), SAFE_OTHER, ""],
            "cwd": str(work_path),
            "env": {"TEXT": "literal " + SAFE_OTHER + "\n'雪"},
            "captureNamesPresent": [],
            "transferNamesPresent": [],
        }
        assert_fixture_result(
            run_shell(
                launcher, root, caller, complex_output["native"], {}, ["TEXT"],
                ["SPSDK_____A_TEXT"],
            ),
            expected,
            "packaged path and literal quoting",
        )

        caller, root = new_package(parent, "many")
        many_output = outputs["eleven_arguments_use_braced_parameters"]
        launcher = install_launcher(root, many_output["script"])
        write_fixture(root / "fixture.py")
        expected = {
            "argv": [f"arg-{index:02d}" for index in range(10)],
            "cwd": str(root),
            "env": {},
            "captureNamesPresent": [],
            "transferNamesPresent": [],
        }
        assert_fixture_result(
            run_shell(launcher, root, caller, many_output["native"], {}),
            expected,
            "eleven positional arguments",
        )

        caller, root = new_package(parent, "rename")
        rename_output = outputs["claude_snapshot_before_renamed_override"]
        launcher = install_launcher(root, rename_output["script"])
        write_fixture(root / "fixture.py")
        source = "captured-before-override"
        expected = {
            "argv": [source, SAFE_OTHER, ""],
            "cwd": str(root),
            "env": {"A": "replacement", "B": source},
            "captureNamesPresent": [],
            "transferNamesPresent": [],
        }
        assert_fixture_result(
            run_shell(
                launcher, root, caller, rename_output["native"],
                {"A": source}, ["A", "B"],
                ["SPSDK__A_A", "SPSDK__A_B"],
            ),
            expected,
            "capture snapshot before renamed environment override",
        )

        caller, root = new_package(parent, "captures")
        capture_output = outputs["claude_ifs_self_placeholder_empty_and_sentinel_captures"]
        launcher = install_launcher(root, capture_output["script"])
        write_fixture(root / "fixture.py")
        sources = {
            "IFS": "safe-ifs",
            "Q": "$" + "{Q}",
            "R": "PSDK_ABSENT",
            "Z": "",
        }
        expected = {
            "argv": ["safe-ifs", "$" + "{Q}", "PSDK_ABSENT", ""],
            "cwd": str(root),
            "env": {},
            "captureNamesPresent": [],
            "transferNamesPresent": [],
        }
        assert_fixture_result(
            run_shell(launcher, root, caller, capture_output["native"], sources),
            expected,
            "IFS, self-placeholder, empty, sentinel, and capture removal",
        )

        missing_sources = {key: value for key, value in sources.items() if key != "Q"}
        missing = run_shell(
            launcher, root, caller, capture_output["native"], missing_sources
        )
        if missing.returncode != 1 or missing.stdout or "Missing environment variable: Q" not in missing.stderr:
            raise RuntimeError(
                "missing capture did not fail before fixture execution: "
                f"status={missing.returncode}, stdout={missing.stdout!r}, stderr={missing.stderr!r}"
            )

        caller, root = new_package(parent, "special-env")
        special_output = outputs["special_environment_names_and_unicode_separator"]
        launcher = install_launcher(root, special_output["script"])
        write_fixture(root / "fixture.py")
        special_env = {
            "OPTIND": "chosen-value",
            "_": "underscore ' Ω ${SAFE_OTHER}",
            "PWD": "pwd-value",
            "IFS": "ifs value",
            "PPID": "ppid-value",
            "SHLVL": "shlvl-value",
            "MARK": "SAFE_SOURCE_MARKER_9281",
            "EMPTY": "",
        }
        special_transfers = [
            "SPSDK_______A_OPTIND", "SPSDK_______A__", "SPSDK_______A_PWD",
            "SPSDK_______A_IFS", "SPSDK_______A_PPID", "SPSDK_______A_SHLVL",
            "SPSDK_______A_MARK",
            "SPSDK_______A_EMPTY",
        ]
        expected = {
            "argv": ["arg\u2028separator"],
            "cwd": str(root),
            "env": special_env,
            "captureNamesPresent": [],
            "transferNamesPresent": [],
        }
        assert_fixture_result(
            run_shell(
                launcher, root, caller, special_output["native"], {},
                list(special_env), special_transfers,
            ),
            expected,
            "special environment names, safe transfer, and U+2028 argument",
        )
        env_start = special_output["script"].index("exec /usr/bin/env ")
        if "SAFE_SOURCE_MARKER_9281" in special_output["script"][env_start:]:
            raise RuntimeError("safe source marker appeared in generated env utility argv")

    print("6 focused /bin/sh launcher runtime scenarios passed")


if __name__ == "__main__":
    cases = read_vectors()
    outputs = compare_vectors(cases)
    check_wire_inputs(cases)
    check_runtime(outputs)
