import copy
import itertools
import json

from check_replay import SPEC, execute


VECTORS = SPEC / "vectors/tool-contracts.ndjson"
DIGEST = "a" * 64


def request_text(request):
    return json.dumps(request, ensure_ascii=False, separators=(",", ":"))


def compare(cases):
    if not cases:
        raise RuntimeError("no tool-contract cases")
    result = execute("".join(request_text(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines() if line]
    if len(responses) != len(cases):
        raise RuntimeError("tool-contract response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(
                f"{case['name']}: expected {case['expected']}, received {response}"
            )


def read_vectors():
    cases = [
        json.loads(line)
        for line in VECTORS.read_text(encoding="utf-8").splitlines()
        if line
    ]
    operation_types = {case["request"].get("type") for case in cases}
    if not {"normalize_tools", "check_contract_binding"}.issubset(operation_types):
        raise RuntimeError("tool-contract vectors must cover both wire operations")
    return cases


def permutation_cases(cases):
    additions = []
    for case in cases:
        request = case["request"]
        if request.get("type") != "normalize_tools":
            continue
        tools = request.get("input", {}).get("tools")
        if not isinstance(tools, list) or len(tools) < 2:
            continue

        if len(tools) <= 6:
            orders = itertools.permutations(tools)
        else:
            candidates = [
                tuple(reversed(tools)),
                *(tuple(tools[offset:] + tools[:offset]) for offset in range(1, len(tools))),
            ]
            for index in range(len(tools) - 1):
                adjacent = list(tools)
                adjacent[index], adjacent[index + 1] = adjacent[index + 1], adjacent[index]
                candidates.append(tuple(adjacent))
            orders = iter(candidates)

        seen = {request_text(request)}
        for order in orders:
            changed = copy.deepcopy(case)
            changed["request"]["input"]["tools"] = list(order)
            encoded = request_text(changed["request"])
            if encoded in seen:
                continue
            seen.add(encoded)
            changed["name"] = f"{case['name']}_permutation_{len(additions)}"
            additions.append(changed)
    return additions


def changed_request(base, path, value):
    changed = copy.deepcopy(base)
    target = changed
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return request_text(changed)


def removed_request(base, path):
    changed = copy.deepcopy(base)
    target = changed
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]
    return request_text(changed)


def malformed_requests():
    normalize = {
        "schema": 1,
        "type": "normalize_tools",
        "input": {
            "tools": [
                {"name": "read_é", "digest": DIGEST},
                {"name": "write", "digest": "b" * 64},
            ]
        },
    }
    binding = {
        "schema": 1,
        "type": "check_contract_binding",
        "input": {
            "expected": {
                "organization": "acme",
                "service": "billing",
                "digest": DIGEST,
            },
            "actual": {
                "organization": "acme",
                "service": "billing",
                "digest": DIGEST,
            },
        },
    }
    invalid = []

    def add(label, request):
        invalid.append((label, request))

    for operation, base in [
        ("normalize", normalize),
        ("binding", binding),
    ]:
        add(f"{operation}_schema_version", changed_request(base, ("schema",), 2))
        add(f"{operation}_fractional_schema", changed_request(base, ("schema",), 1.5))
        add(f"{operation}_boolean_schema", changed_request(base, ("schema",), True))
        add(f"{operation}_string_schema", changed_request(base, ("schema",), "1"))
        add(f"{operation}_unknown_type", changed_request(base, ("type",), "unknown"))
        other_type = "check_contract_binding" if operation == "normalize" else "normalize_tools"
        add(f"{operation}_mismatched_operation_input", changed_request(base, ("type",), other_type))
        add(f"{operation}_wrong_input_type", changed_request(base, ("input",), []))
        add(f"{operation}_extra_envelope_field", changed_request(base, ("extra",), True))
        add(f"{operation}_extra_input_field", changed_request(base, ("input", "extra"), True))
        add(f"{operation}_missing_schema", removed_request(base, ("schema",)))
        add(f"{operation}_missing_type", removed_request(base, ("type",)))
        add(f"{operation}_missing_input", removed_request(base, ("input",)))
        add(
            f"{operation}_duplicate_schema",
            request_text(base).replace('"schema":1', '"schema":1,"schema":1', 1),
        )
        add(
            f"{operation}_escaped_duplicate_schema",
            request_text(base).replace(
                '"schema":1', '"schema":1,"sch\\u0065ma":1', 1
            ),
        )
        add(
            f"{operation}_unpaired_surrogate_value",
            request_text(base).replace(
                "read_é" if operation == "normalize" else "acme", "\\ud800", 1
            ),
        )
        add(
            f"{operation}_unpaired_surrogate_key",
            request_text(base).replace('"input":', '"bad\\ud800":0,"input":', 1),
        )

    for path in [("input", "tools"), ("input", "expected"), ("input", "actual")]:
        base = normalize if path[-1] == "tools" else binding
        if path in [("input", "tools"), ("input", "expected")]:
            add(f"missing_{path[-1]}", removed_request(base, path))

    for label, path, value in [
        ("tools_not_array", ("input", "tools"), {}),
        ("tools_null", ("input", "tools"), None),
        ("descriptor_not_object", ("input", "tools", 0), "read"),
        ("descriptor_null_name", ("input", "tools", 0, "name"), None),
        ("descriptor_empty_name", ("input", "tools", 0, "name"), ""),
        ("descriptor_nonstring_name", ("input", "tools", 0, "name"), 4),
        ("descriptor_uppercase_digest", ("input", "tools", 0, "digest"), "A" * 64),
        ("descriptor_short_digest", ("input", "tools", 0, "digest"), "a" * 63),
        ("descriptor_nonhex_digest", ("input", "tools", 0, "digest"), "g" * 64),
        ("descriptor_extra_field", ("input", "tools", 0, "extra"), True),
    ]:
        add(label, changed_request(normalize, path, value))
    for field in ["name", "digest"]:
        add(
            f"descriptor_missing_{field}",
            removed_request(normalize, ("input", "tools", 0, field)),
        )

    compact_normalize = request_text(normalize)
    add(
        "descriptor_duplicate_name",
        compact_normalize.replace(
            '"name":"read_é"', '"name":"read_é","name":"read_é"', 1
        ),
    )
    add(
        "descriptor_escaped_duplicate_name",
        compact_normalize.replace(
            '"name":"read_é"', '"name":"read_é","na\\u006de":"read_é"', 1
        ),
    )
    add(
        "input_duplicate_tools",
        compact_normalize.replace('"tools":[', '"tools":[],"tools":[', 1),
    )

    for label, path, value in [
        ("identity_not_object", ("input", "expected"), []),
        ("actual_not_object", ("input", "actual"), []),
        ("empty_organization", ("input", "expected", "organization"), ""),
        ("nonstring_organization", ("input", "expected", "organization"), 4),
        ("empty_service", ("input", "actual", "service"), ""),
        ("nonstring_service", ("input", "actual", "service"), False),
        ("identity_uppercase_digest", ("input", "actual", "digest"), "F" * 64),
        ("identity_short_digest", ("input", "actual", "digest"), "f" * 63),
        ("identity_nonhex_digest", ("input", "actual", "digest"), "z" * 64),
        ("identity_extra_field", ("input", "expected", "extra"), None),
    ]:
        add(label, changed_request(binding, path, value))
    for identity in ["expected", "actual"]:
        for field in ["organization", "service", "digest"]:
            add(
                f"missing_{identity}_{field}",
                removed_request(binding, ("input", identity, field)),
            )
    for identity in ["expected", "actual"]:
        add(
            f"missing_{identity}",
            removed_request(binding, ("input", identity)),
        )
    compact_binding = request_text(binding)
    add(
        "identity_escaped_duplicate_organization",
        compact_binding.replace(
            '"organization":"acme"',
            '"organization":"acme","organi\\u007aation":"acme"',
            1,
        ),
    )
    add(
        "input_duplicate_expected",
        compact_binding.replace(
            '"expected":{', '"expected":{},"expected":{', 1
        ),
    )
    add("malformed_json", "{")

    return invalid


def check_malformed():
    malformed = malformed_requests()
    for label, request in malformed:
        result = execute(request + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"{label} was not rejected as malformed wire input: {request}")
    return len(malformed)


def main():
    cases = read_vectors()
    compare(cases)
    permutations = permutation_cases(cases)
    compare(permutations)
    malformed = check_malformed()
    print(
        f"{len(cases)} independent tool-contract vectors, "
        f"{len(permutations)} normalization permutations, and "
        f"{malformed} malformed wire requests passed"
    )


if __name__ == "__main__":
    main()
