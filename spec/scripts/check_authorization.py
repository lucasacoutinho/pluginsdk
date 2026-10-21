import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/authorization.ndjson"


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=30
    )


def replay():
    cases = [json.loads(line) for line in VECTORS.read_text().splitlines() if line.strip()]
    required = {
        "reader_tickets_close",
        "reader_payroll_adjust",
        "administrator_payroll_adjust",
        "membership_issuer_mismatch",
        "same_tool_name_in_another_service",
        "duplicate_contract_conflict",
        "duplicate_rule_adds_scope",
        "token_at_expiry",
        "freshness_at_inclusive_bounds",
        "revoked_membership_direct_call",
        "revoked_policy_grants_direct_call",
        "another_effective_grant_survives_revocation",
    }
    if not required <= {case["name"] for case in cases}:
        raise RuntimeError("required authorization counterexamples are missing")
    properties = {prop for case in cases for prop in case["properties"]}
    if properties != {f"U{number}" for number in range(1, 9)}:
        raise RuntimeError(f"authorization vector property coverage differs: {properties}")
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("authorization oracle response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(
                f"{case['name']}: expected {case['expected']}, received {response}"
            )
    print(f"{len(cases)} authorization vectors match the current oracle")
    return cases[0]["request"]


def entries(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from entries(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from entries(child, (*path, index))


def at(value, path):
    for key in path:
        value = value[key]
    return value


def replace(base, path, value):
    result = copy.deepcopy(base)
    at(result, path[:-1])[path[-1]] = value
    return result


def check_wire_inputs(base):
    invalid = []
    for path, value in entries(base):
        if isinstance(value, dict):
            extra = copy.deepcopy(base)
            at(extra, path)["unexpected"] = True
            invalid.append(json.dumps(extra))
            for key in value:
                missing = copy.deepcopy(base)
                del at(missing, path)[key]
                invalid.append(json.dumps(missing))
        elif isinstance(value, str):
            invalid.append(json.dumps(replace(base, path, "")))
            invalid.append(json.dumps(replace(base, path, False)))
        elif isinstance(value, list):
            invalid.append(json.dumps(replace(base, path, {})))
        elif isinstance(value, int):
            for number in [-1, 0.5, 9007199254740992, "1", None, True]:
                invalid.append(json.dumps(replace(base, path, number)))

    encoded = json.dumps(base, separators=(",", ":"))
    invalid.extend([
        "{", encoded + " {}",
        encoded.replace('"schema":1', '"schema":1,"schema":1'),
        encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
        encoded.replace('"subject":"alice"', '"subject":"alice","subject":"bob"'),
        encoded.replace('"now":1000', '"now":1e400'),
        encoded.replace('"now":1000', '"now":-1e400'),
    ])
    for text in invalid:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed authorization wire input was not rejected: {text}")
    print(f"{len(invalid)} malformed authorization wire inputs rejected")

    canonical = execute(encoded + "\n")
    if canonical.returncode != 0:
        raise RuntimeError(canonical.stderr)
    for number in ["1000.0", "1e3", "10000e-1", "1000.0000000000000000001"]:
        result = execute(encoded.replace('"now":1000', f'"now":{number}') + "\n")
        if result.returncode != 0 or result.stdout != canonical.stdout:
            raise RuntimeError(f"authorization number differs from JavaScript: {number}")
    zero = json.dumps(replace(base, ("input", "now"), 0), separators=(",", ":"))
    canonical_zero = execute(zero + "\n")
    for number in ["-0", "0e5", "1e-400", "-1e-400"]:
        result = execute(zero.replace('"now":0', f'"now":{number}') + "\n")
        if result.returncode != 0 or result.stdout != canonical_zero.stdout:
            raise RuntimeError(f"authorization zero differs from JavaScript: {number}")
    print("authorization wire numbers use JavaScript binary64 integer semantics")


if __name__ == "__main__":
    check_wire_inputs(replay())
