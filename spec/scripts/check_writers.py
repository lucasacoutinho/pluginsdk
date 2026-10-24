import argparse
import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTOR_FILES = [SPEC / "vectors/writers.ndjson", SPEC / "vectors/writer-observation.ndjson"]
PROPERTY_TAGS = {f"Z{i}" for i in range(1, 17)}


def encode(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def execute(wire):
    return subprocess.run(
        [str(ORACLE)], input=wire + "\n", text=True, capture_output=True, timeout=10
    )


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


def invalid_requests(cases, legacy_duplicates=True):
    invalid = set()
    for case in cases:
        base = case["request"]
        for path, current in locations(base):
            for field in current:
                changed = copy.deepcopy(base)
                del at_path(changed, path)[field]
                invalid.add(encode(changed))
            changed = copy.deepcopy(base)
            at_path(changed, path)["unexpected"] = True
            invalid.add(encode(changed))

        for field, values in {
            "schema": [0, -1, 2, 1.5, 4294967296, "1", None, True, [], {}],
            "type": ["other", "", None, True, 1, [], {}],
            "input": [None, True, 1, "bad", [], {}],
        }.items():
            for value in values:
                changed = copy.deepcopy(base)
                changed[field] = value
                invalid.add(encode(changed))

        for path, current in locations(base):
            for field in ("type", "state"):
                if field in current:
                    for value in ["other", "", None, True, 1, [], {}]:
                        changed = copy.deepcopy(base)
                        at_path(changed, path)[field] = value
                        invalid.add(encode(changed))
            for field in ("writers", "observed", "signal", "writer", "lookup", "current", "owners"):
                if field in current:
                    for value in [None, True, 1, "bad", {}, [None]]:
                        changed = copy.deepcopy(base)
                        at_path(changed, path)[field] = value
                        invalid.add(encode(changed))
            if "pid" in current:
                for value in [0, -1, 1.5, 4294967296, "17", None, True, [], {}]:
                    changed = copy.deepcopy(base)
                    at_path(changed, path)["pid"] = value
                    invalid.add(encode(changed))
            if "creation" in current:
                for value in [
                    "",
                    "0" * 15,
                    "0" * 17,
                    "A" * 16,
                    "g" * 16,
                    "0" * 15 + "G",
                    "0" * 16 + "\n",
                    "0" * 16 + "\r\n",
                    "0" * 16 + "\u2028",
                    "0" * 16 + "\u2029",
                    "\0" + "0" * 15,
                    "😀" * 8,
                    "\ud800",
                    None,
                    True,
                    1,
                    [],
                    {},
                ]:
                    changed = copy.deepcopy(base)
                    at_path(changed, path)["creation"] = value
                    invalid.add(encode(changed))

    if not legacy_duplicates:
        return invalid

    # Duplicate members are rejected even when the duplicate key uses a JSON escape alias.
    birth = next(case for case in cases if case["name"] == "open_birth_admits_fresh_writer")
    birth_wire = encode(birth["request"])
    invalid.update([
        birth_wire.replace('"schema":1', '"schema":1,"schema":1', 1),
        birth_wire.replace('"schema":1', '"schema":1,"sch\\u0065ma":1', 1),
        birth_wire.replace('"type":"writer_step"', '"type":"writer_step","typ\\u0065":"writer_step"', 1),
        birth_wire.replace('"input":{', '"input":{},"input":{', 1),
        birth_wire.replace('"pid":17', '"pid":17,"pid":17', 1),
        birth_wire.replace('"pid":17', '"pid":17,"pi\\u0064":17', 1),
        birth_wire.replace('"creation":"0123456789abcdef"',
                           '"creation":"0123456789abcdef","crea\\u0074ion":"0123456789abcdef"', 1),
        birth_wire.replace('"type":"open"', '"type":"open","typ\\u0065":"open"', 1),
        birth_wire.replace('"type":"birth"', '"type":"birth","typ\\u0065":"birth"', 1),
        "{",
    ])

    completion = next(case for case in cases if case["name"] == "single_exact_termination_is_complete")
    completion_wire = encode(completion["request"])
    invalid.add(completion_wire.replace('"state":"terminated"',
                                        '"state":"terminated","state":"terminated"', 1))
    observation = next(case for case in cases if case["name"] == "missing_matching_pid_is_terminated")
    observation_wire = encode(observation["request"])
    invalid.add(observation_wire.replace('"type":"missing"',
                                         '"type":"missing","typ\\u0065":"missing"', 1))
    invalid.add(observation_wire.replace('"lookup":{', '"lookup":{},"look\\u0075p":{', 1))
    return invalid


def replace_once(wire, old, new):
    if old not in wire:
        raise RuntimeError(f"numeric mutation target not present: {old}")
    return wire.replace(old, new, 1)


def check_traces():
    cases = [json.loads(line) for line in (SPEC / "vectors/writer-traces.ndjson").read_text().splitlines() if line]
    if not cases or len({case["name"] for case in cases}) != len(cases):
        raise RuntimeError("writer traces must have unique names and cannot be empty")
    steps = 0
    for case in cases:
        if set(case) != {"name", "properties", "initial", "signals", "actions", "final"} or case["properties"] != ["Z17"]:
            raise RuntimeError(f"invalid writer trace fields: {case['name']}")
        if len(case["signals"]) != len(case["actions"]):
            raise RuntimeError(f"writer trace action count differs: {case['name']}")
        state = case["initial"]
        resumed = []
        for index, (signal, action) in enumerate(zip(case["signals"], case["actions"], strict=True)):
            request = {"schema": 1, "type": "writer_step", "input": {"state": state, "signal": signal}}
            result = execute(encode(request))
            if result.returncode != 0:
                raise RuntimeError(f"{case['name']} step {index}: {result.stderr}")
            response = json.loads(result.stdout)
            if set(response) != {"schema", "type", "output"} or response["schema"] != 1 or response["type"] != "writer_step":
                raise RuntimeError(f"{case['name']} step {index}: invalid oracle envelope")
            output = response["output"]
            if set(output) != {"state", "action"} or output["action"] != action:
                raise RuntimeError(f"{case['name']} step {index}: expected action {action}, received {output}")
            if action["type"] == "resume":
                resumed.append(action["writer"])
            state = output["state"]
            steps += 1
        if state != case["final"]:
            raise RuntimeError(f"{case['name']}: expected final state {case['final']}, received {state}")
        if any(writer not in state["writers"] for writer in resumed):
            raise RuntimeError(f"{case['name']}: final ledger lost an authorized writer")
    print(f"{len(cases)} writer traces and {steps} oracle steps pass")


def check_prior_owners():
    cases = [json.loads(line) for line in (SPEC / "vectors/writer-prior-owners.ndjson").read_text().splitlines() if line]
    if not cases or len({case["name"] for case in cases}) != len(cases):
        raise RuntimeError("prior-owner cases must have unique names and cannot be empty")
    if any(set(case) != {"name", "properties", "request", "expected"} for case in cases):
        raise RuntimeError("prior-owner vector fields differ from the authored format")
    if {tag for case in cases for tag in case["properties"]} != {f"Z{i}" for i in range(18, 23)}:
        raise RuntimeError("prior-owner property tags differ from Z18-Z22")
    for case in cases:
        if set(case["request"]) != {"schema", "type", "input"} or case["request"]["schema"] != 1 or case["request"]["type"] != "writer_prior_owners":
            raise RuntimeError(f"invalid prior-owner request envelope: {case['name']}")
        if set(case["expected"]) != {"schema", "type", "output"} or case["expected"]["schema"] != 1 or case["expected"]["type"] != "writer_prior_owners":
            raise RuntimeError(f"invalid prior-owner response envelope: {case['name']}")
    result = execute("\n".join(encode(case["request"]) for case in cases))
    if result.returncode != 0 or [json.loads(line) for line in result.stdout.splitlines()] != [case["expected"] for case in cases]:
        raise RuntimeError(f"prior-owner oracle differs from authored vectors: {result.stderr}; {result.stdout}")
    invalid = invalid_requests(cases, legacy_duplicates=False)
    baseline = encode(cases[0]["request"])
    for field, alias in [("current", "curr\\u0065nt"), ("owners", "own\\u0065rs"), ("observed", "observ\\u0065d")]:
        invalid.add(baseline.replace(f'"{field}":', f'"{alias}":null,"{field}":', 1))
    for wire in sorted(invalid):
        rejected = execute(wire)
        if rejected.returncode != 1 or rejected.stdout or not rejected.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed prior-owner request was not rejected: {wire}; {rejected}")
    print(f"{len(cases)} prior-owner cases and {len(invalid)} malformed requests pass")


def main():
    parser = argparse.ArgumentParser()
    focus = parser.add_mutually_exclusive_group()
    focus.add_argument("--traces-only", action="store_true")
    focus.add_argument("--prior-owners-only", action="store_true")
    args = parser.parse_args()
    if args.traces_only:
        check_traces()
        return
    if args.prior_owners_only:
        check_prior_owners()
        return
    cases = [
        json.loads(line)
        for path in VECTOR_FILES
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if not cases:
        raise RuntimeError("writer vectors are empty")
    if len({case.get("name") for case in cases}) != len(cases):
        raise RuntimeError("writer vector names are not unique")
    if any(set(case) != {"name", "properties", "request", "expected"} for case in cases):
        raise RuntimeError("writer vector fields differ from the authored format")
    tags = {tag for case in cases for tag in case["properties"]}
    if tags != PROPERTY_TAGS:
        raise RuntimeError(f"writer property tags differ from Z1-Z16: {sorted(tags)}")

    requests = []
    for case in cases:
        request = case["request"]
        expected = case["expected"]
        if request.get("schema") != 1 or request.get("type") not in {"writer_step", "writer_completion", "writer_observation"}:
            raise RuntimeError(f"invalid authored request envelope: {case['name']}")
        if expected.get("schema") != 1 or expected.get("type") != request["type"]:
            raise RuntimeError(f"invalid authored response envelope: {case['name']}")
        if set(expected) != {"schema", "type", "output"}:
            raise RuntimeError(f"invalid authored response fields: {case['name']}")
        requests.append(encode(request))

    result = execute("\n".join(requests))
    if result.returncode != 0:
        raise RuntimeError(f"writer oracle failed for valid vectors: {result.stderr}")
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("writer oracle response count differs from vector count")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")

    invalid = invalid_requests(cases)
    for wire in sorted(invalid):
        rejected = execute(wire)
        if rejected.returncode != 1 or rejected.stdout or not rejected.stderr.startswith("oracle:"):
            raise RuntimeError(
                f"malformed writer request was not rejected: {wire}; "
                f"returncode={rejected.returncode}, stdout={rejected.stdout!r}, stderr={rejected.stderr!r}"
            )

    numeric = []
    baseline = next(case for case in cases if case["name"] == "open_birth_admits_fresh_writer")
    baseline_wire = encode(baseline["request"])
    for value in ["1.0", "1e0", "10e-1", "1.00000000000000000001"]:
        numeric.append((replace_once(baseline_wire, '"schema":1', f'"schema":{value}'), baseline["expected"]))
    for value in ["17.0", "1.7e1", "17.000000000000000001"]:
        numeric.append((replace_once(baseline_wire, '"pid":17', f'"pid":{value}'), baseline["expected"]))
    maximum = next(case for case in cases if case["name"] == "birth_accepts_uint32_maximum_identity")
    numeric.append((replace_once(encode(maximum["request"]), '"pid":4294967295',
                                 '"pid":4294967295.0000001'), maximum["expected"]))
    for wire, expected in numeric:
        alternate = execute(wire)
        if alternate.returncode != 0 or [json.loads(line) for line in alternate.stdout.splitlines()] != [expected]:
            raise RuntimeError(
                "writer numeric decoding differs from JavaScript number semantics: "
                f"returncode={alternate.returncode}, stdout={alternate.stdout!r}, stderr={alternate.stderr!r}"
            )
    print(f"{len(cases)} writer cases, {len(invalid)} malformed requests and {len(numeric)} numeric cases pass")
    check_traces()
    check_prior_owners()


if __name__ == "__main__":
    main()
