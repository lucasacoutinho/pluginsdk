import copy
import itertools
import json

from check_replay import SPEC, execute


VECTORS = SPEC / "vectors/process.ndjson"


def compare(cases):
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(cases):
        raise RuntimeError("process oracle response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")


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


def check_wire_inputs(cases):
    invalid = set()
    for base in cases:
        for path, value in entries(base["request"]):
            if not isinstance(value, dict):
                continue
            extra = copy.deepcopy(base["request"])
            at(extra, path)["unexpected"] = True
            invalid.add(json.dumps(extra))
            for key in value:
                missing = copy.deepcopy(base["request"])
                del at(missing, path)[key]
                invalid.add(json.dumps(missing))
    sample = cases[0]["request"]
    malformed_fields = [
        (("schema",), 2), (("schema",), 1.5), (("input", "host"), "cursor"),
        (("input", "definition", "args"), None),
        (("input", "definition", "environment"), {}),
    ]
    malformed_fields += [(("input", "definition", "command", "name"), name) for name in [
        "", ".", "..", "/usr/bin/node", "./node", "-node", "node;exit", "nøde", "node\n",
    ]]
    malformed_fields += [(("input", "definition", "cwd"), path) for path in [
        "", ".", "..", "/work", "C:/work", "a/../b", "work\x00",
    ]]
    malformed_fields += [(("input", "definition", "args"), [{"type": "literal", "value": text}])
        for text in ["a\x00b", None, False]]
    malformed_fields += [(("input", "definition", "environment"), [
        {"name": name, "value": {"type": "reference", "name": "SOURCE"}}
    ]) for name in ["", "0KEY", "A-B", "NÃME", "A=B"]]
    for path, value in malformed_fields:
        changed = copy.deepcopy(sample)
        at(changed, path[:-1])[path[-1]] = value
        invalid.add(json.dumps(changed))
    for text in invalid:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed process wire input was accepted: {text}")
    print(f"{len(invalid)} malformed process wire inputs rejected")


def check_permutations(cases):
    generated = []
    for sample in cases:
        if sample["name"] not in {"enumeration_forward", "all_environment_problems_are_preserved"}:
            continue
        source = sample["request"]["input"]
        for environment in itertools.permutations(source["definition"]["environment"]):
            for files in itertools.permutations(source["files"]):
                changed = copy.deepcopy(sample)
                changed["request"]["input"]["definition"]["environment"] = list(environment)
                changed["request"]["input"]["files"] = list(files)
                generated.append(changed)
    compare(generated)
    print(f"{len(generated)} process enumeration cases match independent vector expectations")


if __name__ == "__main__":
    cases = [json.loads(line) for line in VECTORS.read_text().split("\n") if line]
    compare(cases)
    print(f"{len(cases)} independent process vectors match Lean")
    check_wire_inputs(cases)
    check_permutations(cases)
