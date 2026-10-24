import copy
import json

from check_replay import SPEC, execute


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main():
    cases = [json.loads(line) for line in (SPEC / "vectors/publication.ndjson").read_text(encoding="utf-8").splitlines() if line]
    result = execute("".join(encoded(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("publication response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: publication expectation differs")

    baseline = cases[1]
    base = baseline["request"]
    invalid = []
    for path in [(), ("input",), ("input", "desired"), ("input", "history", 0)]:
        current = base
        for key in path:
            current = current[key]
        for field in [*current, "extra"]:
            changed = copy.deepcopy(base)
            target = changed
            for key in path:
                target = target[key]
            if field == "extra":
                target[field] = True
            else:
                del target[field]
            invalid.append(encoded(changed))
    for field, values in {
        "plugin": ["", "-bad", "bad--id", "bad..id", "BAD", "a" * 65, None],
        "version": ["", None, False, []],
        "digest": ["", "A" * 64, "a" * 63, "g" * 64, None],
    }.items():
        for value in values:
            for path in [("input", "desired"), ("input", "history", 0)]:
                changed = copy.deepcopy(base)
                target = changed
                for key in path:
                    target = target[key]
                target[field] = value
                invalid.append(encoded(changed))
    for value in [None, False, {}, [False]]:
        changed = copy.deepcopy(base)
        changed["input"]["history"] = value
        invalid.append(encoded(changed))
    text = encoded(base)
    for value in ["2", "1.5", "null", "true", '"1"']:
        invalid.append(text.replace('"schema":1', f'"schema":{value}', 1))
    invalid.extend([
        text.replace('"schema":1', '"schema":1,"schema":1', 1),
        text.replace('"schema":1', '"schema":1,"sch' + chr(92) + 'u0065ma":1', 1),
        text.replace('"version":"1.0.0"', '"version":"' + chr(92) + 'ud800"', 1),
    ])
    for value in invalid:
        rejected = execute(value + "\n")
        if rejected.returncode != 1 or rejected.stdout.strip() or not rejected.stderr.startswith("oracle:"):
            raise RuntimeError("malformed publication request was not rejected")
    for numeric in ["1.0", "1e0", "1.00000000000000000001"]:
        alternate = execute(text.replace('"schema":1', f'"schema":{numeric}', 1) + "\n")
        if alternate.returncode != 0 or json.loads(alternate.stdout) != baseline["expected"]:
            raise RuntimeError("publication numeric schema differs from JavaScript")
    print(f"{len(cases)} authored publication cases, {len(invalid)} malformed requests and three numeric schema cases pass")


if __name__ == "__main__":
    main()
