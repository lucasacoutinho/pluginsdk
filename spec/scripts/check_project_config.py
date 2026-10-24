import copy
import json

from check_replay import SPEC, execute


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main():
    cases = [json.loads(line) for line in (SPEC / "vectors/project-config.ndjson").read_text(encoding="utf-8").splitlines() if line]
    result = execute("".join(encoded(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(cases) != len(responses):
        raise RuntimeError("project-config response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: project-config expectation differs")

    baseline = next(case for case in cases if case["name"] == "replace_moves_only_owned_block")
    base = baseline["request"]
    invalid = []
    paths = [(), ("input",), *(("input", "document", index) for index in range(3))]
    for path in paths:
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
        "key": ["", "A" * 64, "a" * 63, "g" * 64, None, False],
        "previous": [False, [], {}],
        "desired": [False, [], {}],
        "document": [None, False, {}, [{"type": "unknown", "content": "text"}]],
    }.items():
        for value in values:
            changed = copy.deepcopy(base)
            changed["input"][field] = value
            invalid.append(encoded(changed))
    for segment in [
        {"type": "managed", "key": "A" * 64, "content": "text"},
        {"type": "external", "key": "a" * 64, "content": "text"},
        {"type": "external", "content": None},
    ]:
        changed = copy.deepcopy(base)
        changed["input"]["document"] = [segment]
        invalid.append(encoded(changed))
    text = encoded(base)
    for value in ["2", "1.5", "null", "true", '"1"']:
        invalid.append(text.replace('"schema":1', f'"schema":{value}', 1))
    invalid.extend([
        text.replace('"schema":1', '"schema":1,"schema":1', 1),
        text.replace('"schema":1', '"schema":1,"sch' + chr(92) + 'u0065ma":1', 1),
        text.replace('"desired":"new"', '"desired":"' + chr(92) + 'ud800"', 1),
    ])
    for value in invalid:
        rejected = execute(value + "\n")
        if rejected.returncode != 1 or rejected.stdout.strip() or not rejected.stderr.startswith("oracle:"):
            raise RuntimeError("malformed project-config input was not rejected")
    for numeric in ["1.0", "1e0", "1.00000000000000000001"]:
        alternate = execute(text.replace('"schema":1', f'"schema":{numeric}', 1) + "\n")
        if alternate.returncode != 0 or json.loads(alternate.stdout) != baseline["expected"]:
            raise RuntimeError("project-config numeric schema differs from JavaScript")
    print(f"{len(cases)} authored project-config cases, {len(invalid)} malformed requests and three numeric schema cases pass")


if __name__ == "__main__":
    main()
