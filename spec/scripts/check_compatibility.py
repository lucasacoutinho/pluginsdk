import copy
import itertools
import json

from check_replay import SPEC, execute


OPERATIONS = {"select_native_profile", "native_ownership_compatible"}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def compare(cases):
    result = execute("".join(encoded(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("compatibility response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")


def walk(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, (*path, index))


def at(value, path):
    for part in path:
        value = value[part]
    return value


def replace(base, path, value):
    if not path:
        return value
    changed = copy.deepcopy(base)
    at(changed, path[:-1])[path[-1]] = value
    return changed


def malformed(cases):
    invalid = []
    for operation in sorted(OPERATIONS):
        base = max((case["request"] for case in cases if case["request"]["type"] == operation), key=lambda value: sum(1 for _ in walk(value)))
        for path, value in walk(base):
            if isinstance(value, dict):
                changed = copy.deepcopy(base)
                at(changed, path)["extra"] = True
                invalid.append(encoded(changed))
                for key in value:
                    changed = copy.deepcopy(base)
                    del at(changed, path)[key]
                    invalid.append(encoded(changed))
                for wrong in (None, [], "wrong"):
                    invalid.append(encoded(replace(base, path, wrong)))
            elif isinstance(value, list):
                for wrong in (None, {}, "wrong"):
                    invalid.append(encoded(replace(base, path, wrong)))
                if path[-1] == "formats":
                    invalid.append(encoded(replace(base, path, [])))
            elif isinstance(value, str):
                for wrong in ("", None, False, [], {}):
                    if wrong is None and path[-1] == "format":
                        continue
                    invalid.append(encoded(replace(base, path, wrong)))
                if path[-1] in {"host", "scope", "type", "format"} or (len(path) > 1 and path[-2] == "formats"):
                    invalid.append(encoded(replace(base, path, "__unknown__")))
            elif isinstance(value, int):
                for wrong in (2, 1.5, None, True, "1"):
                    invalid.append(encoded(replace(base, path, wrong)))
        text = encoded(base)
        version_value = next(value for path, value in walk(base) if path and path[-1] == "version")
        invalid.extend([
            text.replace('"schema":1', '"schema":1,"schema":1', 1),
            text.replace('"schema":1', '"schema":1,"sch' + chr(92) + 'u0065ma":1', 1),
            text.replace('"input":{', '"input":{"extra":0,"extra":1,', 1),
            text.replace('"input":{', '"input":{"extra":0,"extr' + chr(92) + 'u0061":1,', 1),
            text.replace('"input":{', '"input":{"bad' + chr(92) + 'ud800":0,', 1),
            text.replace('"version":' + encoded(version_value), '"version":"' + chr(92) + 'ud800"', 1),
        ])
    return list(dict.fromkeys(invalid))


def main():
    cases = [json.loads(line) for line in (SPEC / "vectors/compatibility.ndjson").read_text(encoding="utf-8").splitlines() if line]
    if not cases or {case["request"]["type"] for case in cases} != OPERATIONS:
        raise RuntimeError("compatibility vectors must cover both operations")
    for case in cases:
        if set(case) != {"name", "properties", "request", "expected"}:
            raise RuntimeError("unexpected compatibility vector fields")
    compare(cases)
    permutations = []
    for case in cases:
        profiles = case["request"]["input"]["profiles"]
        seen = {encoded(case["request"])}
        for order in itertools.permutations(profiles):
            changed = copy.deepcopy(case)
            changed["request"]["input"]["profiles"] = list(order)
            text = encoded(changed["request"])
            if text in seen:
                continue
            seen.add(text)
            permutations.append(changed)
    compare(permutations)
    invalid = malformed(cases)
    for text in invalid:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout.strip() or "oracle:" not in result.stderr:
            raise RuntimeError(f"malformed compatibility request was not rejected: {text}")
    numeric = []
    for case in cases:
        if case["name"] not in {"sole_exact_profile", "qualified_claude_upgrade"}:
            continue
        for version in ("1.0", "1e0", "1.00000000000000000001"):
            result = execute(encoded(case["request"]).replace('"schema":1', f'"schema":{version}', 1) + "\n")
            if result.returncode != 0 or json.loads(result.stdout) != case["expected"]:
                raise RuntimeError("numeric schema version disagrees with JavaScript decoding")
            numeric.append(version)
    print(f"{len(cases)} authored compatibility vectors, {len(permutations)} permutations, {len(invalid)} malformed requests and {len(numeric)} numeric schema cases pass")


if __name__ == "__main__":
    main()
