import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/catalog.ndjson"


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=30
    )


def replay():
    cases = [json.loads(line) for line in VECTORS.read_text().splitlines() if line.strip()]
    required = {
        "first_plugin_release", "second_application_contract",
        "identical_registration_replays", "changed_source_commit",
        "changed_native_packages", "changed_mcp_contract",
        "same_names_other_organization", "new_identity_same_display_version",
        "missing_organization_cannot_alias", "missing_release_cannot_alias",
        "no_substitution_for_claude_code_v1", "plugin_cannot_be_selected_as_mcp",
        "conflicting_records_forward", "conflicting_records_reverse",
        "conflicting_records_reject_replay_forward", "identical_duplicates_resolve",
    }
    if not required <= {case["name"] for case in cases}:
        raise RuntimeError("required catalog counterexamples are missing")
    properties = {prop for case in cases for prop in case["properties"]}
    if properties != {f"C{number}" for number in range(1, 7)}:
        raise RuntimeError(f"catalog vector property coverage differs: {properties}")
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("catalog oracle response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")
    print(f"{len(cases)} independent catalog vectors match the current oracle")
    return cases


def entries(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from entries(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from entries(child, (*path, index))


def at(value, path):
    for key in path:
        value = value[key]
    return value


def replace(base, path, value):
    result = copy.deepcopy(base)
    at(result, path[:-1])[path[-1]] = value
    return result


def check_wire_inputs(cases):
    samples = [cases[0]["request"]]
    samples.extend(case["request"] for case in cases if case["name"] in {
        "second_application_contract", "resolve_claude", "resolve_existing_mcp_contract"
    })
    invalid = set()
    for base in samples:
        for path, value in entries(base):
            if isinstance(value, dict):
                extra = copy.deepcopy(base)
                at(extra, path)["unexpected"] = True
                invalid.add(json.dumps(extra))
                if path and path[-1] == "packages":
                    invalid.add(json.dumps(replace(base, path, {})))
                    continue
                for key in value:
                    missing = copy.deepcopy(base)
                    del at(missing, path)[key]
                    invalid.add(json.dumps(missing))
            elif isinstance(value, str):
                invalid.add(json.dumps(replace(base, path, "")))
                invalid.add(json.dumps(replace(base, path, False)))
                if path[-1] in {"digest", "contract", "commit"} or (
                    len(path) > 1 and path[-2] == "packages"
                ):
                    for malformed in ["A" * len(value), "g" * len(value), value[:-1]]:
                        invalid.add(json.dumps(replace(base, path, malformed)))
                if path[-1] == "path":
                    for escape in ["..", "./plugin", "../plugin", "/plugin", "C:/plugin", "a/../b", "a\\b", "a\x00b"]:
                        invalid.add(json.dumps(replace(base, path, escape)))
            elif isinstance(value, list):
                invalid.add(json.dumps(replace(base, path, {})))
            elif isinstance(value, int):
                for malformed in [0, 2, 0.5, "1", None, True]:
                    invalid.add(json.dumps(replace(base, path, malformed)))
        encoded = json.dumps(base, separators=(",", ":"))
        invalid.update([
            "{", encoded + " {}",
            encoded.replace('"schema":1', '"schema":1,"schema":1'),
            encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
        ])
    for text in sorted(invalid):
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed catalog wire input was not rejected: {text}")
    print(f"{len(invalid)} malformed catalog requests rejected")


if __name__ == "__main__":
    check_wire_inputs(replay())
