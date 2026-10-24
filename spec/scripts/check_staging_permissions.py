import copy
import json
from pathlib import Path

from check_executable_intents import (
    at_path, decode_json, duplicate_member, encode, execute, expect_rejected,
    objects, replace_once, response_lines, strictly_equal, wrong_json_kinds,
)


SPEC = Path(__file__).resolve().parents[1]


def compare(cases):
    result = execute("\n".join(wire for wire, _, _ in cases))
    responses = response_lines(result, len(cases), "staging permissions")
    for (_, expected, label), actual in zip(cases, responses, strict=True):
        if not strictly_equal(actual, expected):
            raise RuntimeError(f"{label}: expected {expected}, received {actual}")


def malformed_requests(bases):
    malformed = set()
    for base in bases:
        for path, value in objects(base):
            extra = copy.deepcopy(base)
            at_path(extra, path)["extra"] = True
            malformed.add(encode(extra))
            for field, original in value.items():
                missing = copy.deepcopy(base)
                del at_path(missing, path)[field]
                malformed.add(encode(missing))
                for wrong in wrong_json_kinds(original):
                    changed = copy.deepcopy(base)
                    at_path(changed, path)[field] = wrong
                    malformed.add(encode(changed))
        wire = encode(base)
        malformed.add(duplicate_member(wire, "schema", '"sch\\u0065ma"'))
        malformed.add(duplicate_member(wire, "current", '"cur\\u0072ent"'))
        malformed.add(duplicate_member(wire, "executable", '"execu\\u0074able"'))
        malformed.add(replace_once(wire, '"schema":1', '"schema":2'))
        malformed.add(replace_once(wire, '"stage_permissions"', '"unknown"'))
        malformed.add(wire + " trailing")
        for value in [-1, 512, 4294967296, 0.5]:
            changed = copy.deepcopy(base)
            changed["input"]["current"] = value
            malformed.add(encode(changed))
    return malformed


def numeric_cases(zero, maximum):
    cases = []
    wire = encode(zero["request"])
    for form in ["1", "1.0", "1e0", "0.1e1", "10e-1", "100e-2", "1E+0"]:
        cases.append((replace_once(wire, '"schema":1', f'"schema":{form}'), zero["expected"], f"schema {form}"))
    for vector, current, forms in [
        (zero, 0, ["0", "-0", "0.0", "0e100", "0E+0", "0.000e-50"]),
        (maximum, 511, ["511", "511.0", "5.11e2", "51100e-2", "0.511e3", "511E+0"]),
    ]:
        wire = encode(vector["request"])
        for form in forms:
            changed = replace_once(wire, f'"current":{current}', f'"current":{form}')
            cases.append((changed, vector["expected"], f"current {form}"))
    return cases


def main():
    vectors = [decode_json(line) for line in (SPEC / "vectors/staging-permissions.ndjson").read_text().splitlines()]
    if len(vectors) != 18 or len({vector["name"] for vector in vectors}) != 18:
        raise RuntimeError("expected 18 distinct authored staging cases")
    requests = {encode(vector["request"]) for vector in vectors}
    if len(requests) != 18:
        raise RuntimeError("authored staging requests are duplicated")
    tags = {tag for vector in vectors for tag in vector["properties"]}
    if tags != {"EI17", "EI18", "EI19", "EI20"}:
        raise RuntimeError("staging cases do not cover EI17-EI20")
    compare([(encode(vector["request"]), vector["expected"], vector["name"]) for vector in vectors])
    zero = next(vector for vector in vectors if vector["name"] == "zero gains owner execute")
    maximum = next(vector for vector in vectors if vector["name"] == "all execute positions can be removed")
    malformed = malformed_requests([zero["request"], maximum["request"]])
    if malformed & requests:
        raise RuntimeError("a malformed mutation is an authored valid request")
    for wire in sorted(malformed):
        expect_rejected(wire, "malformed staging request")
    numeric = numeric_cases(zero, maximum)
    compare(numeric)
    precise = []
    for value in ["1.0000000000000000000001", "0.99999999999999999999"]:
        precise.append(replace_once(encode(zero["request"]), '"schema":1', f'"schema":{value}'))
    for vector, current, values in [
        (zero, 0, ["0.0000000000000000000001", "0.99999999999999999999"]),
        (maximum, 511, ["510.99999999999999999", "511.00000000000000001"]),
    ]:
        for value in values:
            precise.append(replace_once(encode(vector["request"]), f'"current":{current}', f'"current":{value}'))
    for wire in precise:
        expect_rejected(wire, "precise fractional staging value")
    print(json.dumps({"status": "passed", "authored_vectors": len(vectors), "property_tags": len(tags),
                      "malformed_requests": len(malformed), "exact_integral_numeric_forms": len(numeric),
                      "precise_fractional_rejections": len(precise)}, sort_keys=True))


if __name__ == "__main__":
    main()
