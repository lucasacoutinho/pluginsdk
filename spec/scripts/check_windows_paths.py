import argparse
import copy
from decimal import Decimal
import json
from pathlib import Path
import re
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/windows-paths.ndjson"
PROPERTY_TAGS = {f"WP{i}" for i in range(1, 10)}
DECISIONS = {"accepted", "syntax", "device", "component_limit", "path_limit"}
CAPACITY_FIELDS = ("maxComponentUnits", "remainingPathUnits")
TIMEOUT_SECONDS = 10
MAX_UINT32 = 4_294_967_295


def unique_object(pairs):
    value = {}
    for key, nested in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key!r}")
        value[key] = nested
    return value


def reject_constant(value):
    raise ValueError(f"invalid JSON numeric constant: {value}")


def decode_json(raw):
    return json.loads(
        raw,
        object_pairs_hook=unique_object,
        parse_int=int,
        parse_float=Decimal,
        parse_constant=reject_constant,
    )


def encode(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def execute(wire):
    try:
        return subprocess.run(
            [str(ORACLE)], input=wire + "\n", text=True, capture_output=True,
            timeout=TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"oracle exceeded its {TIMEOUT_SECONDS}-second timeout") from error


def locations(value, path=()):
    if isinstance(value, dict):
        yield path, value
        for key, nested in value.items():
            yield from locations(nested, path + (key,))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            yield from locations(nested, path + (index,))


def at_path(value, path):
    for part in path:
        value = value[part]
    return value


def replace_once(wire, old, new):
    if old not in wire:
        raise RuntimeError(f"wire mutation target is missing: {old}")
    return wire.replace(old, new, 1)


def mutated(base, path, field, value):
    changed = copy.deepcopy(base)
    at_path(changed, path)[field] = value
    return encode(changed)


def wrong_json_kinds(value):
    if isinstance(value, dict):
        return [None, True, 1, "bad", [], {"unexpected": True}]
    if isinstance(value, list):
        return [None, True, 1, "bad", {}]
    if type(value) is bool:
        return [None, 0, "true", [], {}]
    if type(value) is int:
        return [None, True, "1", [], {}, 1.5]
    if isinstance(value, str):
        return [None, True, 1, [], {}]
    return []


def valid_package_path(path):
    if not isinstance(path, str) or not path or "\0" in path or "\\" in path:
        return False
    try:
        path.encode("utf-16-le", errors="strict")
    except UnicodeEncodeError:
        return False
    if re.match(r"^[A-Za-z]:", path):
        return False
    return all(component not in {"", ".", ".."} for component in path.split("/"))


def read_vectors():
    raw_lines = VECTORS.read_text(encoding="utf-8").splitlines()
    if not raw_lines or any(not line for line in raw_lines):
        raise RuntimeError("Windows path vector file is empty or contains a blank line")
    try:
        cases = [decode_json(line) for line in raw_lines]
    except ValueError as error:
        raise RuntimeError(f"Windows path vectors contain invalid JSON: {error}") from error

    names = set()
    tags = set()
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"name", "properties", "request", "expected"}:
            raise RuntimeError("Windows path vector fields differ from the authored format")
        name = case["name"]
        if not isinstance(name, str) or not name or name in names:
            raise RuntimeError(f"Windows path vector name is empty or duplicated: {name!r}")
        names.add(name)

        properties = case["properties"]
        if (not isinstance(properties, list) or not properties or
                any(not isinstance(tag, str) or tag not in PROPERTY_TAGS for tag in properties) or
                len(set(properties)) != len(properties)):
            raise RuntimeError(f"invalid property tags in Windows path vector: {name}")
        tags.update(properties)

        request = case["request"]
        if not isinstance(request, dict) or set(request) != {"schema", "type", "input"}:
            raise RuntimeError(f"invalid authored request envelope: {name}")
        if type(request["schema"]) is not int or request["schema"] != 1 or request["type"] != "windows_path":
            raise RuntimeError(f"invalid authored request version or type: {name}")
        request_input = request["input"]
        if not isinstance(request_input, dict) or set(request_input) != {"path", "capacity"}:
            raise RuntimeError(f"invalid authored input fields: {name}")
        if not valid_package_path(request_input["path"]):
            raise RuntimeError(f"authored path is not a valid PackagePath: {name}")
        capacity = request_input["capacity"]
        if not isinstance(capacity, dict) or set(capacity) != set(CAPACITY_FIELDS):
            raise RuntimeError(f"invalid authored capacity fields: {name}")
        for field in CAPACITY_FIELDS:
            value = capacity[field]
            if type(value) is not int or not 0 <= value <= MAX_UINT32:
                raise RuntimeError(f"authored capacity is outside UInt32: {name}.{field}")

        expected = case["expected"]
        if (not isinstance(expected, dict) or set(expected) != {"schema", "type", "output"} or
                type(expected["schema"]) is not int or expected["schema"] != 1 or
                expected["type"] != "windows_path" or not isinstance(expected["output"], str) or
                expected["output"] not in DECISIONS):
            raise RuntimeError(f"invalid authored response envelope: {name}")

    if tags != PROPERTY_TAGS:
        raise RuntimeError(f"property tags differ from WP1-WP9: {sorted(tags)}")
    return cases, tags


def response_lines(result, expected_count, label):
    if result.returncode != 0:
        raise RuntimeError(f"oracle rejected {label}: {result.stderr}")
    if result.stderr:
        raise RuntimeError(f"oracle emitted diagnostics for {label}: {result.stderr}")
    lines = result.stdout.splitlines()
    if len(lines) != expected_count or any(not line for line in lines):
        raise RuntimeError(f"oracle returned {len(lines)} responses for {expected_count} {label}")
    try:
        return [decode_json(line) for line in lines]
    except ValueError as error:
        raise RuntimeError(f"oracle emitted malformed {label} output: {error}") from error


def strictly_equal(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(strictly_equal(left[key], right[key]) for key in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(strictly_equal(a, b) for a, b in zip(left, right, strict=True))
    return left == right


def malformed_requests(base):
    invalid = set()
    for object_path, current in locations(base):
        for field, value in current.items():
            changed = copy.deepcopy(base)
            del at_path(changed, object_path)[field]
            invalid.add(encode(changed))
            changed = copy.deepcopy(base)
            at_path(changed, object_path)["unexpected"] = True
            invalid.add(encode(changed))
            for wrong in wrong_json_kinds(value):
                invalid.add(mutated(base, object_path, field, wrong))

    bad_paths = [
        "", "/absolute", "trailing/", "double//separator", ".", "..", "dir/.", "dir/..",
        "a:", "A:stream", "dir\\file", "\0", "prefix\0suffix", "\ud800",
        None, True, 1, [], {},
    ]
    for value in bad_paths:
        invalid.add(mutated(base, ("input",), "path", value))

    for field in CAPACITY_FIELDS:
        for value in [
            -1, -1.0, 1.5, 4_294_967_296, "1", None, True, [], {},
        ]:
            invalid.add(mutated(base, ("input", "capacity"), field, value))

    invalid.add(replace_once(encode(base), '"type":"windows_path"', '"type":"unknown"'))
    invalid.add(replace_once(encode(base), '"schema":1', '"schema":2'))
    invalid.add(replace_once(encode(base), '"schema":1', '"schema":1.5'))

    wire = encode(base)
    invalid.update([
        wire + " trailing",
        wire + "\0",
    ])

    invalid.update([
        duplicate_member(wire, "schema", '"schem\\u0061"'),
        duplicate_member(wire, "type", '"typ\\u0065"'),
        duplicate_member(wire, "input", '"inp\\u0075t"'),
        duplicate_member(wire, "path", '"pa\\u0074h"'),
        duplicate_member(wire, "capacity", '"capacit\\u0079"'),
        duplicate_member(wire, "maxComponentUnits", '"maxComponent\\u0055nits"'),
        duplicate_member(wire, "remainingPathUnits", '"remainingPath\\u0055nits"'),
    ])
    return invalid


def duplicate_member(wire, key, alias_token):
    prefix = json.dumps(key, ensure_ascii=True, separators=(",", ":")) + ":"
    key_at = wire.find(prefix)
    if key_at < 0:
        raise RuntimeError(f"duplicate-key mutation target is missing: {key}")
    value_start = key_at + len(prefix)
    try:
        _, value_end = json.JSONDecoder().raw_decode(wire, value_start)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"could not locate duplicate-key value for {key}") from error
    return wire[:value_end] + "," + alias_token + ":" + wire[value_start:value_end] + wire[value_end:]


def expect_rejected(wire, label):
    result = execute(wire)
    if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
        raise RuntimeError(
            f"{label} was not rejected: returncode={result.returncode}, "
            f"stdout={result.stdout!r}, stderr={result.stderr!r}"
        )


def expect_exact_numeric_forms(request, expected, forms):
    wire = encode(request)
    numeric_wires = [replace_once(wire, '"schema":1', f'"schema":{form}') for form in forms["schema"]]
    for field in CAPACITY_FIELDS:
        for form in forms["capacity"]:
            numeric_wires.append(replace_once(wire, f'"{field}":2', f'"{field}":{form}'))
    result = execute("\n".join(numeric_wires))
    responses = response_lines(result, len(numeric_wires), "mathematically integral numeric forms")
    if any(not strictly_equal(response, expected) for response in responses):
        raise RuntimeError("exact schema or capacity numeric forms changed the expected response")
    return len(numeric_wires)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    if not ORACLE.is_file():
        raise RuntimeError(f"oracle executable is missing: {ORACLE}")
    cases, tags = read_vectors()
    batch = execute("\n".join(encode(case["request"]) for case in cases))
    responses = response_lines(batch, len(cases), "valid Windows path vectors")
    for case, response in zip(cases, responses, strict=True):
        if not strictly_equal(response, case["expected"]):
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")

    by_name = {case["name"]: case for case in cases}
    base = by_name["supplementary_scalar_without_normalization"]["request"]
    expected = by_name["supplementary_scalar_without_normalization"]["expected"]
    invalid = malformed_requests(base)
    for wire in sorted(invalid):
        expect_rejected(wire, "malformed Windows path request")

    exact_forms = expect_exact_numeric_forms(
        base,
        expected,
        {
            "schema": ["1", "1.0", "1e0", "0.1e1", "10e-1", "100e-2", "1E+0"],
            "capacity": ["2", "2.0", "20e-1", "200e-2", "2E+0"],
        },
    )

    zero = by_name["zero_component_and_path_capacity"]["request"]
    zero_expected = by_name["zero_component_and_path_capacity"]["expected"]
    zero_wire = encode(zero)
    negative_zero_wire = replace_once(zero_wire, '"maxComponentUnits":0', '"maxComponentUnits":-0')
    negative_zero_wire = replace_once(negative_zero_wire, '"remainingPathUnits":0', '"remainingPathUnits":-0')
    zero_result = execute(negative_zero_wire)
    zero_responses = response_lines(zero_result, 1, "negative-zero capacity")
    if not strictly_equal(zero_responses[0], zero_expected):
        raise RuntimeError("mathematical negative zero did not behave as zero capacity")

    precise_bad_numbers = [
        "2.0000000000000000000000000000000001",
        "4294967295.0000000000000000000000000000000001",
    ]
    numeric_rejections = 0
    for field in CAPACITY_FIELDS:
        for number in precise_bad_numbers:
            expect_rejected(
                replace_once(encode(base), f'"{field}":2', f'"{field}":{number}'),
                "non-integral or overflowing exact capacity",
            )
            numeric_rejections += 1

    schema_wire = encode(base)
    rounded_non_one = [
        "1.0000000000000000000000000000000000000000000000000000000000000001",
        "0.9999999999999999999999999999999999999999999999999999999999999999",
    ]
    for number in rounded_non_one:
        expect_rejected(replace_once(schema_wire, '"schema":1', f'"schema":{number}'),
                        "non-1 schema number rounded to 1 by Float")

    report = {
        "schema": 1,
        "status": "passed",
        "vectors": len(cases),
        "property_tags": sorted(tags),
        "malformed_requests": len(invalid),
        "exact_numeric_forms": exact_forms,
        "negative_zero_capacity": "passed",
        "precise_capacity_rejections": numeric_rejections,
        "rounded_non_1_schema_rejections": len(rounded_non_one),
        "timeout_seconds": TIMEOUT_SECONDS,
    }
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"{len(cases)} Windows path vectors, {len(invalid)} malformed requests, "
        f"{exact_forms} exact numeric forms, negative zero and "
        f"{numeric_rejections + len(rounded_non_one)} precise numeric rejections pass"
    )


if __name__ == "__main__":
    main()
