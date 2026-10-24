import copy
from decimal import Decimal
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/executable-intents.ndjson"
PROPERTY_TAGS = {f"EI{i}" for i in range(1, 17)}
SOURCE_REASONS = {
    "duplicate_file", "duplicate_declaration", "missing_file", "unavailable",
    "unrepresented", "changed",
}
PAYLOAD_REASONS = {"path", "content", "unavailable", "changed", "intent"}
TIMEOUT_SECONDS = 10


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


def require_object(value, fields, label):
    if type(value) is not dict or set(value) != set(fields):
        raise RuntimeError(f"{label} fields differ from the executable-intent contract")


def read_vectors():
    raw_lines = VECTORS.read_text(encoding="utf-8").splitlines()
    if not raw_lines or any(not line for line in raw_lines):
        raise RuntimeError("executable-intent vector file is empty or contains a blank line")
    try:
        vectors = [decode_json(line) for line in raw_lines]
    except (ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"executable-intent vectors contain invalid JSON: {error}") from error

    names = set()
    requests = set()
    properties = set()
    source_reasons = set()
    payload_reasons = set()
    for vector in vectors:
        require_object(vector, {"name", "properties", "request", "expected"}, "vector")
        name = vector["name"]
        if type(name) is not str or not name or name in names:
            raise RuntimeError(f"vector name is empty, malformed, or duplicated: {name!r}")
        names.add(name)

        labels = vector["properties"]
        if (type(labels) is not list or not labels or
                any(type(tag) is not str or tag not in PROPERTY_TAGS for tag in labels) or
                len(set(labels)) != len(labels)):
            raise RuntimeError(f"invalid property labels in vector: {name}")
        properties.update(labels)

        request = vector["request"]
        require_object(request, {"schema", "type", "input"}, f"{name}.request")
        if type(request["schema"]) is not int or request["schema"] != 1:
            raise RuntimeError(f"{name}.request has an invalid schema version")
        if (type(request["type"]) is not str or
                request["type"] not in {"source_intent", "payload_intent"}):
            raise RuntimeError(f"{name}.request has an unsupported type")
        key = json.dumps(request, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        if key in requests:
            raise RuntimeError(f"duplicate authored request: {name}")
        requests.add(key)
        expected = vector["expected"]
        require_object(expected, {"schema", "type", "output"}, f"{name}.expected")
        if (type(expected["schema"]) is not int or expected["schema"] != 1 or
                expected["type"] != request["type"]):
            raise RuntimeError(f"{name}.expected has an invalid response envelope")

        output = expected["output"]
        if type(output) is dict and output.get("type") == "refused":
            reason = output.get("reason")
            if type(reason) is not str:
                raise RuntimeError(f"{name}.expected has a refusal without a string reason")
            if request["type"] == "source_intent":
                source_reasons.add(reason)
            else:
                payload_reasons.add(reason)

    if len(vectors) != 57:
        raise RuntimeError(f"expected 57 authored executable-intent vectors, found {len(vectors)}")
    if properties != PROPERTY_TAGS:
        raise RuntimeError(f"property labels differ from EI1-EI16: {sorted(properties)}")
    if source_reasons != SOURCE_REASONS:
        raise RuntimeError(f"source refusal coverage differs from the contract: {sorted(source_reasons)}")
    if payload_reasons != PAYLOAD_REASONS:
        raise RuntimeError(f"payload refusal coverage differs from the contract: {sorted(payload_reasons)}")
    return vectors, properties


def strictly_equal(left, right):
    if type(left) is not type(right):
        return False
    if type(left) is dict:
        return left.keys() == right.keys() and all(strictly_equal(left[key], right[key]) for key in left)
    if type(left) is list:
        return len(left) == len(right) and all(
            strictly_equal(a, b) for a, b in zip(left, right, strict=True)
        )
    return left == right


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
    except (ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"oracle emitted malformed {label}: {error}") from error


def objects(value, path=()):
    if type(value) is dict:
        yield path, value
        for key, nested in value.items():
            yield from objects(nested, path + (key,))
    elif type(value) is list:
        for index, nested in enumerate(value):
            yield from objects(nested, path + (index,))


def at_path(value, path):
    for component in path:
        value = value[component]
    return value


def mutate(base, path, field, value):
    changed = copy.deepcopy(base)
    at_path(changed, path)[field] = value
    return encode(changed)


def wrong_json_kinds(value):
    if type(value) is dict:
        return [None, True, 1, "bad", []]
    if type(value) is list:
        return [None, True, 1, "bad", {}]
    if type(value) is bool:
        return [None, 0, "true", [], {}]
    if type(value) is int:
        return [None, True, "1", [], {}]
    if type(value) is str:
        return [None, True, 1, [], {}]
    return []


def locations_with_key(value, key, path=()):
    if type(value) is dict:
        for field, nested in value.items():
            next_path = path + (field,)
            if field == key:
                yield next_path, nested
            yield from locations_with_key(nested, key, next_path)
    elif type(value) is list:
        for index, nested in enumerate(value):
            yield from locations_with_key(nested, key, path + (index,))


def package_path_locations(value, path=()):
    if type(value) is dict:
        for key, nested in value.items():
            next_path = path + (key,)
            if key == "path":
                yield next_path
            elif key in {"files", "executables"} and type(nested) is list:
                for index, item in enumerate(nested):
                    if type(item) is str:
                        yield next_path + (index,)
            yield from package_path_locations(nested, next_path)


def representative_requests(vectors):
    requests = [vector["request"] for vector in vectors]
    find = lambda predicate: next(request for request in requests if predicate(request))
    return [
        find(lambda request: request["type"] == "source_intent" and
             request["input"]["type"] == "filesystem" and
             request["input"]["files"] and
             request["input"]["files"][0]["mode"]["type"] == "posix"),
        find(lambda request: request["type"] == "source_intent" and
             request["input"]["type"] == "filesystem" and
             request["input"]["files"] and
             request["input"]["files"][0]["mode"]["type"] == "unrepresented"),
        find(lambda request: request["type"] == "source_intent" and
             request["input"]["type"] == "declared" and
             request["input"]["files"] and request["input"]["executables"]),
        find(lambda request: request["type"] == "payload_intent" and
             request["input"]["observed"]["mode"]["type"] == "posix"),
        find(lambda request: request["type"] == "payload_intent" and
             request["input"]["observed"]["mode"]["type"] == "unrepresented"),
    ]


def replace_once(wire, old, new):
    if old not in wire:
        raise RuntimeError(f"wire mutation target is missing: {old}")
    return wire.replace(old, new, 1)


def duplicate_member(wire, key, alias_token, occurrence=0):
    prefix = json.dumps(key, ensure_ascii=True, separators=(",", ":")) + ":"
    matches = []
    offset = 0
    while (key_at := wire.find(prefix, offset)) >= 0:
        matches.append(key_at)
        offset = key_at + len(prefix)
    if occurrence >= len(matches):
        raise RuntimeError(f"duplicate-key mutation target is missing: {key}[{occurrence}]")
    value_start = matches[occurrence] + len(prefix)
    decoder = json.JSONDecoder(parse_int=int, parse_float=Decimal, parse_constant=reject_constant)
    try:
        _, value_end = decoder.raw_decode(wire, value_start)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"could not locate duplicate-key value for {key}") from error
    value_wire = wire[value_start:value_end]
    return wire[:value_end] + "," + alias_token + ":" + value_wire + wire[value_end:]


def malformed_requests(representatives):
    malformed = {
        "nested_fields": set(),
        "wrong_json_kinds": set(),
        "duplicate_keys": set(),
        "package_paths": set(),
        "digests": set(),
        "mode_tags": set(),
        "permission_bounds": set(),
        "protocol": set(),
        "unicode": set(),
    }

    for base in representatives:
        for path, value in objects(base):
            wire = encode(base)
            changed = copy.deepcopy(base)
            at_path(changed, path)["unexpected"] = True
            malformed["nested_fields"].add(encode(changed))
            for field, current in value.items():
                changed = copy.deepcopy(base)
                del at_path(changed, path)[field]
                malformed["nested_fields"].add(encode(changed))
                for wrong in wrong_json_kinds(current):
                    malformed["wrong_json_kinds"].add(mutate(base, path, field, wrong))

        wire = encode(base)
        malformed["duplicate_keys"].add(duplicate_member(wire, "schema", '"schem\\u0061"'))

    filesystem = representatives[0]
    wire = encode(filesystem)
    malformed["duplicate_keys"].add(duplicate_member(wire, "path", '"pa\\u0074h"'))
    malformed["duplicate_keys"].add(duplicate_member(wire, "type", '"ty\\u0070e"', occurrence=2))
    payload_wire = encode(representatives[3])
    malformed["duplicate_keys"].add(duplicate_member(payload_wire, "digest", '"dig\\u0065st"'))

    invalid_paths = [
        "", "/absolute", "trailing/", "double//separator", ".", "..", "dir/.", "dir/..",
        "C:", "C:stream", "z:/absolute", "dir\\file", "\\root", "\0", "dir/\0name",
    ]
    invalid_unicode = ["\ud800", "\udfff", "\ud800x"]
    wrong_path_kinds = [None, True, 1, [], {}]
    for base in representatives:
        for path in package_path_locations(base):
            for value in invalid_paths + invalid_unicode + wrong_path_kinds:
                changed = copy.deepcopy(base)
                at_path(changed, path[:-1])[path[-1]] = value
                category = "unicode" if value in invalid_unicode else (
                    "package_paths" if type(value) is str else "wrong_json_kinds"
                )
                malformed[category].add(encode(changed))

    invalid_digests = ["", "a" * 63, "a" * 65, "A" * 64, "g" * 64, "a" * 63 + "G"]
    for base in representatives:
        for path, _ in locations_with_key(base, "digest"):
            for value in invalid_digests:
                changed = copy.deepcopy(base)
                at_path(changed, path[:-1])[path[-1]] = value
                malformed["digests"].add(encode(changed))

    for base in representatives:
        for path, current in locations_with_key(base, "type"):
            if path and path[-1] == "type" and current in {"posix", "unrepresented", "unavailable"}:
                changed = copy.deepcopy(base)
                at_path(changed, path[:-1])[path[-1]] = "unknown_mode"
                malformed["mode_tags"].add(encode(changed))

    invalid_permission_values = [-1, 512, 4_294_967_296, True, None, "511", [], {}]
    for base in representatives:
        for field in ("before", "after"):
            for path, _ in locations_with_key(base, field):
                for value in invalid_permission_values:
                    malformed["permission_bounds" if type(value) is not bool else "wrong_json_kinds"].add(
                        mutate(base, path[:-1], path[-1], value)
                    )

    for base in representatives:
        wire = encode(base)
        malformed["protocol"].add(replace_once(wire, '"schema":1', '"schema":2'))
        malformed["protocol"].add(replace_once(wire, '"type":"' + base["type"] + '"', '"type":"unknown"'))
        malformed["protocol"].add(wire + " trailing")

    return malformed


def expect_rejected(wire, label):
    result = execute(wire)
    if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
        raise RuntimeError(
            f"{label} was not rejected: returncode={result.returncode}, "
            f"stdout={result.stdout!r}, stderr={result.stderr!r}"
        )


def numeric_cases(vectors):
    zero = next(vector for vector in vectors if vector["name"] == "zero native permissions are known false")
    maximum = next(vector for vector in vectors if vector["name"] == "maximum permission bits")
    schema_forms = ["1", "1.0", "1e0", "0.1e1", "10e-1", "100e-2", "1E+0"]
    zero_forms = ["0", "-0", "0.0", "0e100", "0E+0", "0.000e-50"]
    maximum_forms = ["511", "511.0", "5.11e2", "51100e-2", "0.511e3", "511E+0"]
    cases = []

    for form in schema_forms:
        source = encode(zero["request"])
        cases.append((replace_once(source, '"schema":1', f'"schema":{form}'), zero["expected"], f"schema {form}"))
    for form in zero_forms:
        source = encode(zero["request"])
        source = replace_once(source, '"before":0', f'"before":{form}')
        source = replace_once(source, '"after":0', f'"after":{form}')
        cases.append((source, zero["expected"], f"permission zero {form}"))
    for form in maximum_forms:
        source = encode(maximum["request"])
        source = replace_once(source, '"before":511', f'"before":{form}')
        source = replace_once(source, '"after":511', f'"after":{form}')
        cases.append((source, maximum["expected"], f"permission 511 {form}"))
    return cases


def precise_numeric_rejections(vectors):
    zero = next(vector for vector in vectors if vector["name"] == "zero native permissions are known false")
    maximum = next(vector for vector in vectors if vector["name"] == "maximum permission bits")
    cases = []
    for value in [
        "1.0000000000000000000001",
        "0.99999999999999999999",
    ]:
        wire = replace_once(encode(zero["request"]), '"schema":1', f'"schema":{value}')
        cases.append((wire, f"fractional schema {value}"))

    for vector, original, values in [
        (zero, "0", ["0.0000000000000000000001", "0.99999999999999999999"]),
        (maximum, "511", ["510.99999999999999999", "511.00000000000000001"]),
    ]:
        base = encode(vector["request"])
        for field in ("before", "after"):
            for value in values:
                wire = replace_once(base, f'"{field}":{original}', f'"{field}":{value}')
                cases.append((wire, f"fractional permission {field} {value}"))
    return cases


def main():
    if not ORACLE.is_file():
        raise RuntimeError(f"oracle executable is missing: {ORACLE}")
    vectors, tags = read_vectors()

    batch = execute("\n".join(encode(vector["request"]) for vector in vectors))
    responses = response_lines(batch, len(vectors), "authored executable-intent vectors")
    for vector, response in zip(vectors, responses, strict=True):
        if not strictly_equal(response, vector["expected"]):
            raise RuntimeError(f"{vector['name']}: expected {vector['expected']}, received {response}")

    malformed = malformed_requests(representative_requests(vectors))
    malformed_wires = set().union(*malformed.values())
    for wire in sorted(malformed_wires):
        expect_rejected(wire, "malformed executable-intent request")

    numeric = numeric_cases(vectors)
    numeric_result = execute("\n".join(wire for wire, _, _ in numeric))
    numeric_responses = response_lines(numeric_result, len(numeric), "exact integral numeric forms")
    for (_, expected, label), response in zip(numeric, numeric_responses, strict=True):
        if not strictly_equal(response, expected):
            raise RuntimeError(f"{label}: expected canonical response {expected}, received {response}")

    precise = precise_numeric_rejections(vectors)
    for wire, label in precise:
        expect_rejected(wire, label)

    print(json.dumps({
        "status": "passed",
        "authored_vectors": len(vectors),
        "distinct_requests": len(vectors),
        "property_tags": len(tags),
        "source_refusal_reasons": len(SOURCE_REASONS),
        "payload_refusal_reasons": len(PAYLOAD_REASONS),
        "malformed_requests": len(malformed_wires),
        "malformed_categories": {name: len(wires) for name, wires in malformed.items()},
        "exact_integral_numeric_forms": len(numeric),
        "precise_fractional_rejections": len(precise),
        "timeout_seconds": TIMEOUT_SECONDS,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
