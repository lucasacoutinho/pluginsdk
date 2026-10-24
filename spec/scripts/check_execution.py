import copy
import json

from check_replay import SPEC, execute


def encoded(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def main():
    cases = [json.loads(line) for line in (SPEC / "vectors/execution.ndjson").read_text(encoding="utf-8").splitlines() if line]
    result = execute("".join(encoded(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("execution response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: execution expectation differs")

    invalid = set()
    for case in cases:
        base = case["request"]
        for path in [(), ("input",), ("input", "domain"), ("input", "observed")]:
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
                invalid.add(encoded(changed))
        for location in ["domain", "observed"]:
            current = base["input"][location]
            fields = {
                "group": [0, -1, 1.5, 4294967296, "17", None, True],
                "boot": ["", "\0", "\ud800", None, False],
                "name": ["", "Global\\pluginsdk-" + "a" * 63, "Global\\pluginsdk-" + "A" * 64, "Local\\pluginsdk-" + "a" * 64, None, False,
                         *("Global\\pluginsdk-" + "a" * 64 + tail for tail in ["\n", "\r\n", "\u2028", "\u2029"])],
                "state": ["other", None, False],
                "type": ["other", None, False],
            }
            for field, values in fields.items():
                if field not in current:
                    continue
                for value in values:
                    changed = copy.deepcopy(base)
                    changed["input"][location][field] = value
                    invalid.add(encoded(changed))

    text = encoded(cases[0]["request"])
    for value in ["2", "1.5", "null", "true", '"1"']:
        invalid.add(text.replace('"schema":1', f'"schema":{value}', 1))
    invalid.add(text.replace('"schema":1', '"schema":1,"schema":1', 1))
    invalid.add(text.replace('"schema":1', '"schema":1,"sch' + chr(92) + 'u0065ma":1', 1))
    for wire in sorted(invalid):
        rejected = execute(wire + "\n")
        if rejected.returncode != 1 or rejected.stdout.strip() or not rejected.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed execution request was not rejected: {wire}")

    numeric = []
    baseline = next(case for case in cases if case["name"] == "exact_group_absent")
    wire = encoded(baseline["request"])
    for value in ["1.0", "1e0", "1.00000000000000000001"]:
        numeric.append((wire.replace('"schema":1', f'"schema":{value}', 1), baseline["expected"]))
    for value in ["17.0", "1.7e1", "17.000000000000000001"]:
        numeric.append((wire.replace('"group":17', f'"group":{value}', 1), baseline["expected"]))
    maximum = next(case for case in cases if case["name"] == "maximum_process_id")
    numeric.append((encoded(maximum["request"]).replace("4294967295", "4294967295.0000001", 1), maximum["expected"]))
    for wire, expected in numeric:
        alternate = execute(wire + "\n")
        if alternate.returncode != 0 or json.loads(alternate.stdout) != expected:
            raise RuntimeError("execution numeric decoding differs from JavaScript")
    print(f"{len(cases)} authored execution cases, {len(invalid)} malformed requests and {len(numeric)} numeric cases pass")


if __name__ == "__main__":
    main()
