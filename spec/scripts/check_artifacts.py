import copy
import json

from check_replay import SPEC, execute


def compare(cases):
    result = execute("".join(json.dumps(case["request"], ensure_ascii=False) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(cases):
        raise RuntimeError("artifact response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")


def main():
    cases = [json.loads(line) for line in (SPEC / "vectors/artifacts.ndjson").read_text().split("\n") if line]
    compare(cases)
    permutations = copy.deepcopy(cases)
    for case in permutations:
        input = case["request"]["input"]
        input["artifacts"].reverse()
        input["packages"] = dict(reversed(list(input["packages"].items())))
    compare(permutations)
    print(f"{len(cases)} independent package-set vectors and {len(permutations)} permutations passed")

    sample = cases[0]
    malformed = []
    for path, value in [
        (("schema",), 2),
        (("extra",), True),
        (("input", "extra"), True),
        (("input", "plugin"), ""),
        (("input", "plugin"), "bad--plugin"),
        (("input", "version"), ""),
        (("input", "version"), 1),
        (("input", "packages"), {}),
        (("input", "packages"), []),
        (("input", "packages", "unknown"), "a" * 64),
        (("input", "packages", "claude_code"), "A" * 64),
        (("input", "packages", "claude_code"), "a" * 63),
        (("input", "artifacts"), {}),
        (("input", "artifacts"), None),
        (("input", "artifacts", 0, "extra"), True),
        (("input", "artifacts", 0, "plugin"), ""),
        (("input", "artifacts", 0, "format"), "unknown"),
        (("input", "artifacts", 0, "version"), ""),
        (("input", "artifacts", 0, "version"), None),
        (("input", "artifacts", 0, "digest"), "not-a-digest"),
    ]:
        changed = copy.deepcopy(sample["request"])
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        malformed.append(json.dumps(changed))
    for name in ["plugin", "version", "packages", "artifacts"]:
        changed = copy.deepcopy(sample["request"])
        del changed["input"][name]
        malformed.append(json.dumps(changed))
    for name in ["plugin", "format", "version", "digest"]:
        changed = copy.deepcopy(sample["request"])
        del changed["input"]["artifacts"][0][name]
        malformed.append(json.dumps(changed))
    compact = json.dumps(sample["request"], separators=(",", ":"))
    malformed.extend([
        compact.replace('"schema":1', '"schema":1,"schema":1', 1),
        compact.replace('"plugin":"team-automation"', '"plugin":"team-automation","pl\\u0075gin":"team-automation"', 1),
        compact.replace('"version":"1.0.0"', '"version":"\\ud800"', 1),
    ])
    for request in malformed:
        result = execute(request + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed package-set request was accepted: {request}")
    print(f"{len(malformed)} malformed package-set requests rejected")


if __name__ == "__main__":
    main()
