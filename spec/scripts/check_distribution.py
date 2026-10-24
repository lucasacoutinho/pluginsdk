import copy
import itertools
import json

from check_replay import SPEC, execute


VECTORS = SPEC / "vectors/distribution.ndjson"
OPERATIONS = (
    "select_distribution_format",
    "normalize_distribution",
    "open_distribution",
    "schedule_distribution",
    "record_distribution",
    "summarize_distribution",
)
VECTOR_FIELDS = {"name", "properties", "request", "expected"}
NONEMPTY_ARRAYS = {"candidates", "steps", "entries"}
HEX_FIELDS = {"id", "digest"}
ENUM_FIELDS = {"type", "host", "desired", "status", "reason"}
NULLABLE_PATHS = {("input", "prior")}


def request_text(request):
    return json.dumps(request, ensure_ascii=False, separators=(",", ":"))


def compare(cases):
    if not cases:
        raise RuntimeError("no distribution cases")
    result = execute("".join(request_text(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines() if line]
    if len(responses) != len(cases):
        raise RuntimeError("distribution response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(
                f"{case['name']}: expected {case['expected']}, received {response}"
            )


def read_vectors():
    cases = [
        json.loads(line)
        for line in VECTORS.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not cases:
        raise RuntimeError("no distribution vectors")
    for case in cases:
        if not isinstance(case, dict) or set(case) != VECTOR_FIELDS:
            raise RuntimeError("distribution vectors must have name/properties/request/expected")
        if not isinstance(case["name"], str) or not case["name"]:
            raise RuntimeError("distribution vector names must be nonempty strings")
        if not isinstance(case["properties"], list) or not all(
            isinstance(prop, str) for prop in case["properties"]
        ):
            raise RuntimeError(f"{case['name']}: properties must be an array of strings")
        request = case["request"]
        if not isinstance(request, dict) or request.get("type") not in OPERATIONS:
            raise RuntimeError(f"{case['name']}: unknown distribution operation")
        if not isinstance(case["expected"], dict):
            raise RuntimeError(f"{case['name']}: expected response must be an object")
    covered = {case["request"]["type"] for case in cases}
    missing = set(OPERATIONS) - covered
    if missing:
        raise RuntimeError(f"distribution vectors do not cover all operations: {sorted(missing)}")
    return cases


def permutation_orders(values):
    if len(values) < 2:
        return ()
    if len(values) <= 6:
        return itertools.permutations(values)
    candidates = [
        tuple(reversed(values)),
        *(tuple(values[offset:] + values[:offset]) for offset in range(1, len(values))),
    ]
    for index in range(len(values) - 1):
        adjacent = list(values)
        adjacent[index], adjacent[index + 1] = adjacent[index + 1], adjacent[index]
        candidates.append(tuple(adjacent))
    return iter(candidates)


def permutation_cases(cases):
    additions = []
    for case in cases:
        request = case["request"]
        operation = request["type"]
        if operation == "select_distribution_format":
            field = "formats"
        elif operation == "normalize_distribution":
            field = "candidates"
        else:
            continue
        values = request.get("input", {}).get(field)
        if not isinstance(values, list) or len(values) < 2:
            continue

        seen = {request_text(request)}
        for order in permutation_orders(values):
            changed = copy.deepcopy(case)
            changed["request"]["input"][field] = list(order)
            encoded = request_text(changed["request"])
            if encoded in seen:
                continue
            seen.add(encoded)
            changed["name"] = f"{case['name']}_permutation_{len(additions)}"
            additions.append(changed)
    return additions


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


def changed_request(base, path, value):
    if not path:
        return value
    changed = copy.deepcopy(base)
    at(changed, path[:-1])[path[-1]] = value
    return changed


def removed_request(base, path):
    changed = copy.deepcopy(base)
    del at(changed, path[:-1])[path[-1]]
    return changed


def most_complex(case):
    return sum(1 for _ in walk(case["request"]))


def unpaired_surrogate_value_request(base):
    compact = request_text(base)
    free_text = next(
        (
            (path, value)
            for path, value in walk(base)
            if path
            and path[-1] in {"target", "installation"}
            and isinstance(value, str)
        ),
        None,
    )
    if free_text is not None:
        path, value = free_text
        field = path[-1]
        member = json.dumps(field) + ":" + json.dumps(
            value, ensure_ascii=False, separators=(",", ":")
        )
    elif base["type"] == "select_distribution_format":
        field = "host"
        member = json.dumps(field) + ":" + json.dumps(
            at(base, ("input", field)), ensure_ascii=False, separators=(",", ":")
        )
    else:
        raise RuntimeError(
            f"{base['type']}: no free-text or enum field for surrogate validation"
        )
    replacement = json.dumps(field) + '":"' + chr(92) + 'ud800"'
    if member not in compact:
        raise RuntimeError(f"{base['type']}: surrogate field was not found in request text")
    return compact.replace(member, replacement, 1)


def malformed_requests(cases):
    by_operation = {}
    for operation in OPERATIONS:
        matching = [case for case in cases if case["request"]["type"] == operation]
        by_operation[operation] = max(matching, key=most_complex)

    invalid = []

    def add(label, request):
        if isinstance(request, str):
            encoded = request
        else:
            encoded = request_text(request)
        invalid.append((label, encoded))

    for operation, case in by_operation.items():
        base = case["request"]
        compact = request_text(base)
        prefix = operation.removesuffix("_distribution")

        add(f"{prefix}_schema_version", changed_request(base, ("schema",), 2))
        add(f"{prefix}_fractional_schema", changed_request(base, ("schema",), 1.5))
        add(f"{prefix}_boolean_schema", changed_request(base, ("schema",), True))
        add(f"{prefix}_string_schema", changed_request(base, ("schema",), "1"))
        add(f"{prefix}_unknown_operation", changed_request(base, ("type",), "unknown"))
        for field in ("schema", "type", "input"):
            add(f"{prefix}_missing_{field}", removed_request(base, (field,)))

        for path, value in walk(base):
            if isinstance(value, dict):
                target = at(base, path)
                changed = copy.deepcopy(base)
                at(changed, path)["__unexpected_field__"] = True
                add(f"{prefix}_extra_{'_'.join(map(str, path)) or 'envelope'}", changed)
                for key in target:
                    add(
                        f"{prefix}_missing_{'_'.join(map(str, path + (key,)))}",
                        removed_request(base, path + (key,)),
                    )
                wrong_containers = ([], None, "wrong_container")
                if path in NULLABLE_PATHS:
                    wrong_containers = ([], "wrong_container")
                for wrong in wrong_containers:
                    add(
                        f"{prefix}_container_{'_'.join(map(str, path)) or 'envelope'}",
                        changed_request(base, path, wrong),
                    )
            elif isinstance(value, list):
                path_name = str(path[-1]) if path else ""
                for wrong in ({}, None, "wrong_container"):
                    add(
                        f"{prefix}_container_{'_'.join(map(str, path))}",
                        changed_request(base, path, wrong),
                    )
                if path_name in NONEMPTY_ARRAYS:
                    add(
                        f"{prefix}_empty_{path_name}",
                        changed_request(base, path, []),
                    )
            elif isinstance(value, str):
                wrong_values = ["", False, None, [], {}]
                if path and path[-1] in ENUM_FIELDS:
                    wrong_values.append("__unknown__")
                for wrong in wrong_values:
                    add(
                        f"{prefix}_value_{'_'.join(map(str, path))}",
                        changed_request(base, path, wrong),
                    )
                if path and path[-1] in HEX_FIELDS:
                    for wrong in ("A" * 64, "g" * 64, "a" * 63):
                        add(
                            f"{prefix}_invalid_hex_{'_'.join(map(str, path))}",
                            changed_request(base, path, wrong),
                        )
            elif isinstance(value, int) and not isinstance(value, bool):
                for wrong in (2, 1.5, True, "1", None):
                    add(
                        f"{prefix}_value_{'_'.join(map(str, path))}",
                        changed_request(base, path, wrong),
                    )
            elif value is None:
                for wrong in ({}, [], "not_null"):
                    add(
                        f"{prefix}_value_{'_'.join(map(str, path))}",
                        changed_request(base, path, wrong),
                    )

        add(
            f"{prefix}_duplicate_schema",
            compact.replace('"schema":1', '"schema":1,"schema":1', 1),
        )
        add(
            f"{prefix}_escaped_duplicate_schema",
            compact.replace(
                '"schema":1',
                '"schema":1,"sch' + chr(92) + 'u0065ma":1',
                1,
            ),
        )
        add(
            f"{prefix}_nested_duplicate_key",
            compact.replace(
                '"input":{', '"input":{"duplicate":0,"duplicate":0,', 1
            ),
        )
        add(
            f"{prefix}_nested_escaped_duplicate_key",
            compact.replace(
                '"input":{',
                '"input":{"duplicate":0,"dupl' + chr(92) + 'u0069cate":0,',
                1,
            ),
        )
        add(
            f"{prefix}_unpaired_surrogate_key",
            compact.replace(
                '"input":{', '"input":{"bad' + chr(92) + 'ud800":0,', 1
            ),
        )
        add(
            f"{prefix}_unpaired_surrogate_value",
            unpaired_surrogate_value_request(base),
        )

    selection = by_operation["select_distribution_format"]["request"]
    add(
        "selection_unknown_host",
        changed_request(selection, ("input", "host"), "unknown_host"),
    )
    add(
        "selection_unknown_format",
        changed_request(selection, ("input", "formats"), ["unknown_format"]),
    )

    normalization = by_operation["normalize_distribution"]["request"]
    add(
        "normalization_unknown_candidate_type",
        changed_request(
            normalization, ("input", "candidates", 0, "type"), "unknown_candidate"
        ),
    )
    blocked_candidate = {
        "type": "blocked",
        "target": "malformed-test-target",
        "reason": "unknown_failure",
    }
    add(
        "normalization_unknown_failure",
        changed_request(normalization, ("input", "candidates", 0), blocked_candidate),
    )

    record = by_operation["record_distribution"]["request"]
    add(
        "record_unknown_attempt_status",
        changed_request(record, ("input", "status"), "unknown_status"),
    )
    add(
        "record_pending_attempt_status",
        changed_request(record, ("input", "status"), "pending"),
    )

    add("malformed_json", "{")
    return invalid


def check_malformed(cases):
    malformed = malformed_requests(cases)
    for label, request in malformed:
        result = execute(request + "\n")
        if (
            result.returncode != 1
            or result.stdout
            or not result.stderr.startswith("oracle:")
        ):
            raise RuntimeError(f"{label} was not rejected as malformed wire input")
    return len(malformed)


def main():
    cases = read_vectors()
    compare(cases)
    permutations = permutation_cases(cases)
    compare(permutations)
    malformed = check_malformed(cases)
    print(
        f"{len(cases)} independent distribution vectors, "
        f"{len(permutations)} format/candidate permutations, and "
        f"{malformed} malformed wire requests passed"
    )


if __name__ == "__main__":
    main()
