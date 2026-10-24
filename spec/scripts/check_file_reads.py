import argparse
import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/file-reads.ndjson"
PROPERTY_TAGS = {f"V{i}" for i in range(1, 11)}
TIMEOUT_SECONDS = 10
VOLUME_ID = "9e6c02086c01dc41"
ROOT_FILE_ID = "0dc502000000d1000000000000000000"


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
        return [None, True, 1, "bad", []]
    if isinstance(value, list):
        return [None, True, 1, "bad", {}]
    if isinstance(value, bool):
        return [None, 0, "true", [], {}]
    if isinstance(value, int):
        return [None, True, "1", [], {}]
    if isinstance(value, str):
        return [None, True, 1, [], {}]
    return []


def duplicate_wire(wire, needle, alias):
    return replace_once(wire, needle, needle + "," + alias)


def duplicate_object(wire, field, alias):
    needle = '"' + field + '":{'
    replacement = '"' + field + '":{},"' + alias + '":{'
    return replace_once(wire, needle, replacement)


def malformed_requests(path_case, containment_case, read_case):
    invalid = set()
    representatives = [path_case["request"], containment_case["request"], read_case["request"]]

    for base in representatives:
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
                if field == "type":
                    for wrong in ["unknown", "", None, True, 1, [], {}]:
                        invalid.add(mutated(base, object_path, field, wrong))

    read = read_case["request"]
    path_request = path_case["request"]
    containment = containment_case["request"]

    for wrong in [0, -1, 2, 1.5, 4294967296, "1", None, True, [], {}]:
        invalid.add(mutated(path_request, (), "schema", wrong))
    for wrong in ["other", "", None, True, 1, [], {}]:
        invalid.add(mutated(path_request, (), "type", wrong))

    # Brand decoders must reject malformed identities and canonical volume GUIDs.
    bad_ids = [
        "", "0" * 15, "0" * 17, "A" * 16, "g" * 16, "0" * 15 + "G",
        "0" * 16 + "\n", "0" * 16 + "\r\n", "0" * 16 + "\u2028",
        "0" * 16 + "\u2029", "\0" + "0" * 15, "😀" * 8, "\ud800",
        None, True, 1, [], {},
    ]
    for field_path in [
        ("input", "root", "identity"),
        ("input", "before", "file", "info", "identity"),
    ]:
        for value in bad_ids:
            invalid.add(mutated(read, field_path, "volume", value))
    for value in ["", "0" * 31, "0" * 33, "A" * 32, "g" * 32,
                  "0" * 31 + "G", "0" * 32 + "\n", "\0" + "0" * 31,
                  "😀" * 16, "\ud800", None, True, 1, [], {}]:
        invalid.add(mutated(read, ("input", "root", "identity"), "file", value))

    bad_guids = [
        "", "0" * 36, "350036da7c9b-4f8c-b9e8-8d33c80946e6",
        "350036da-7c9b-4f8c-b9e8-8d33c80946eg", "350036da-7c9b-4f8c-b9e8-8d33c80946e6\n",
        "350036da-7c9b-4f8c-b9e8-8d33c80946e6\0", GUID_UPPER,
        None, True, 1, [], {},
    ]
    for object_path in [("input", "root"), ("input", "file")]:
        for value in bad_guids:
            invalid.add(mutated(containment, object_path, "volume", value))

    # Quantities are canonical nonnegative signed-64-bit decimal strings.
    bad_quantities = [
        "", "00", "01", "-1", "+1", "9223372036854775808",
        "99999999999999999999", " 1", "1\n", "1.0", "1e0", "\0",
        "😀", None, True, 1, [], {},
    ]
    for field_path, field in [
        (("input", "before", "file", "info"), "size"),
        (("input", "before", "file", "info"), "modified"),
        (("input", "before", "file", "info"), "changed"),
        (("input", "read"), "length"),
    ]:
        for value in bad_quantities:
            invalid.add(mutated(read, field_path, field, value))

    # Native paths only permit well-formed strings without NUL.
    bad_paths = [None, True, 1, [], {}, "\0", "prefix\0suffix", "\ud800"]
    for request, field_path in [
        (path_request, ("input",)),
        (read, ("input", "root")),
        (read, ("input", "before", "root", "anchor")),
        (read, ("input", "before", "file", "info")),
    ]:
        for value in bad_paths:
            invalid.add(mutated(request, field_path, "path", value))

    # Canonical components reject empty, dot, separators, streams and NUL.
    bad_components = ["", ".", "..", "a/b", "a\\b", "a:b", "\0", "\ud800", None, True, 1, [], {}]
    for field_path, index in [
        (("input", "root", "components"), 0),
        (("input", "file", "components"), 1),
    ]:
        for value in bad_components:
            changed = copy.deepcopy(containment)
            at_path(changed, field_path)[index] = value
            invalid.add(encode(changed))

    for value in [None, 1, "true", [], {}]:
        invalid.add(mutated(read, ("input", "root"), "caseSensitive", value))

    # Unknown command and observation/read-result variants are malformed wire data.
    for wire in [
        replace_once(encode(path_request), '"type":"file_path"', '"type":"file_read"'),
        mutated(read, ("input", "before", "root"), "type", "file"),
        mutated(read, ("input", "before", "file"), "type", "directory"),
        mutated(read, ("input", "read"), "type", "unavailable"),
        "{",
    ]:
        invalid.add(wire)

    # Duplicate keys, including escape aliases, must be rejected before decoding.
    path_wire = encode(path_request)
    read_wire = encode(read)
    contain_wire = encode(containment)
    invalid.update([
        duplicate_wire(path_wire, '"schema":1', '"schema":1'),
        duplicate_wire(path_wire, '"schema":1', '"sch\\u0065ma":1'),
        duplicate_wire(path_wire, '"type":"file_path"', '"typ\\u0065":"file_path"'),
        duplicate_object(path_wire, "input", "input"),
        duplicate_object(path_wire, "input", r"inp\u0075t"),
        duplicate_object(read_wire, "root", "root"),
        duplicate_object(read_wire, "root", r"roo\u0074"),
        duplicate_wire(read_wire, f'"volume":"{VOLUME_ID}"', f'"volum\\u0065":"{VOLUME_ID}"'),
        duplicate_wire(read_wire, f'"file":"{ROOT_FILE_ID}"', f'"fi\\u006ce":"{ROOT_FILE_ID}"'),
        duplicate_wire(read_wire, '"type":"directory"', '"typ\\u0065":"directory"'),
        duplicate_wire(read_wire, '"size":"0"', '"siz\\u0065":"0"'),
        duplicate_wire(contain_wire, '"components":["vault"]', '"components":["vault"]'),
        duplicate_wire(contain_wire, '"components":["vault"]', '"component\\u0073":["vault"]'),
    ])
    return invalid


GUID_UPPER = "350036DA-7C9B-4F8C-B9E8-8D33C80946E6"


def expect_rejected(wire, label):
    result = execute(wire)
    if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
        raise RuntimeError(
            f"{label} was not rejected: returncode={result.returncode}, "
            f"stdout={result.stdout!r}, stderr={result.stderr!r}"
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    if not ORACLE.is_file():
        raise RuntimeError(f"oracle executable is missing: {ORACLE}")
    cases = [
        json.loads(line)
        for line in VECTORS.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if not cases:
        raise RuntimeError("file-read vectors are empty")
    if len({case.get("name") for case in cases}) != len(cases):
        raise RuntimeError("file-read vector names are not unique")
    if any(set(case) != {"name", "properties", "request", "expected"} for case in cases):
        raise RuntimeError("file-read vector fields differ from the authored format")
    tags = {tag for case in cases for tag in case["properties"]}
    if tags != PROPERTY_TAGS:
        raise RuntimeError(f"file-read property tags differ from V1-V10: {sorted(tags)}")

    commands = {"file_path": 0, "file_containment": 0, "file_read": 0}
    for case in cases:
        request = case["request"]
        expected = case["expected"]
        if request.get("schema") != 1 or request.get("type") not in commands:
            raise RuntimeError(f"invalid authored request envelope: {case['name']}")
        if expected.get("schema") != 1 or expected.get("type") != request["type"]:
            raise RuntimeError(f"invalid authored response envelope: {case['name']}")
        if set(expected) != {"schema", "type", "output"}:
            raise RuntimeError(f"invalid authored response fields: {case['name']}")
        commands[request["type"]] += 1

    batch = execute("\n".join(encode(case["request"]) for case in cases))
    if batch.returncode != 0:
        raise RuntimeError(f"oracle rejected valid file-read vectors: {batch.stderr}")
    try:
        responses = [json.loads(line) for line in batch.stdout.splitlines()]
    except json.JSONDecodeError as error:
        raise RuntimeError(f"oracle emitted malformed vector output: {error}") from error
    if len(responses) != len(cases):
        raise RuntimeError(f"oracle returned {len(responses)} responses for {len(cases)} vectors")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")

    path_case = next(case for case in cases if case["name"] == "path_guid_case_alias_normalizes")
    containment_case = next(case for case in cases if case["name"] == "containment_accepts_strict_descendant")
    read_case = next(case for case in cases if case["name"] == "read_accepts_empty_file")
    invalid = malformed_requests(path_case, containment_case, read_case)
    for wire in sorted(invalid):
        expect_rejected(wire, "malformed file-read request")

    # Schema numbers are exact decimal values, not Float-rounded approximations.
    schema_wire = encode(path_case["request"])
    exact_forms = ["1", "1.0", "1e0", "0.1e1", "10e-1", "100e-2", "1E+0"]
    numeric_batch = execute("\n".join(
        replace_once(schema_wire, '"schema":1', f'"schema":{value}')
        for value in exact_forms
    ))
    if numeric_batch.returncode != 0:
        raise RuntimeError(f"oracle rejected mathematically exact schema numbers: {numeric_batch.stderr}")
    numeric_responses = [json.loads(line) for line in numeric_batch.stdout.splitlines()]
    expected = path_case["expected"]
    if numeric_responses != [expected] * len(exact_forms):
        raise RuntimeError(f"exact schema numeric responses differ: {numeric_responses}")

    rounded_non_one = [
        "1.0000000000000000000000000000000000000000000000000000000000000001",
        "0.9999999999999999999999999999999999999999999999999999999999999999",
    ]
    for value in rounded_non_one:
        expect_rejected(replace_once(schema_wire, '"schema":1', f'"schema":{value}'),
                        "non-1 schema number rounded to 1 by Float")

    report = {
        "schema": 1,
        "status": "passed",
        "vectors": len(cases),
        "commands": commands,
        "property_tags": sorted(tags),
        "malformed_requests": len(invalid),
        "exact_schema_numeric_forms": len(exact_forms),
        "rounded_non_1_schema_rejections": len(rounded_non_one),
        "timeout_seconds": TIMEOUT_SECONDS,
    }
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"{len(cases)} file-read vectors, {len(invalid)} malformed requests, "
        f"{len(exact_forms)} exact schema numbers and {len(rounded_non_one)} rounded non-1 numbers pass"
    )


if __name__ == "__main__":
    main()
