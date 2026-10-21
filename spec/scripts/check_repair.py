import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/repair.ndjson"


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=30
    )


def replay():
    cases = [json.loads(line) for line in VECTORS.read_text().splitlines() if line.strip()]
    if not cases:
        raise RuntimeError("no repair vectors")

    required = {
        "propose_recoverable_absence",
        "start_absence_has_no_native_change",
        "start_orphan_marketplace_cleanup",
        "changed_fingerprint_is_stale",
        "changed_pending_binding_is_rejected",
        "unknown_inspection_never_starts",
        "unowned_inspection_never_starts",
        "same_cleanup_retry_only_resumes",
        "same_cleanup_id_with_changed_review_is_invalid",
        "fresh_repair_supersedes_pending_cleanup",
        "qualified_absence_completes_cleanup",
        "remaining_marketplace_preserves_pending_basis",
        "blocked_settlement_preserves_pending_basis",
        "completed_replay_acknowledges_absence",
    }
    names = {case["name"] for case in cases}
    missing = required - names
    if missing:
        raise RuntimeError(f"required repair vectors are missing: {sorted(missing)}")
    properties = {prop for case in cases for prop in case["properties"]}
    if properties != {f"R{index}" for index in range(1, 9)}:
        raise RuntimeError(f"repair vectors do not cover R1-R8: {sorted(properties)}")

    requests = "".join(
        json.dumps(case["request"], separators=(",", ":")) + "\n" for case in cases
    )
    result = execute(requests)
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("oracle response count differs from repair vector count")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(
                f"{case['name']}: expected {case['expected']}, received {response}"
            )
    print(f"{len(cases)} repair vectors match the current oracle")


def check_wire_inputs():
    plan = "a" * 64
    fingerprint = "b" * 64
    base = {
        "schema": 1,
        "type": "repair_propose",
        "input": {
            "state": {"type": "operation_pending", "plan": plan},
            "observed": {
                "type": "recoverable",
                "state": {"fingerprint": fingerprint, "residual": "absent"},
            },
        },
    }
    invalid = []
    for key, value in [
        ("schema", 2),
        ("schema", 1.5),
        ("schema", 0),
        ("schema", -1),
        ("schema", "1"),
        ("type", "repair_forget"),
        ("extra", True),
    ]:
        request = copy.deepcopy(base)
        request[key] = value
        invalid.append(json.dumps(request))

    request = copy.deepcopy(base)
    del request["input"]
    invalid.append(json.dumps(request))

    malformed_inputs = [
        ("state", {"type": "operation_pending"}),
        ("state", {"type": "operation_pending", "plan": "A" * 64}),
        ("state", {"type": "operation_pending", "plan": plan, "extra": True}),
        ("state", {"type": "pending", "plan": plan}),
        (
            "state",
            {"type": "repair_pending", "plan": plan},
        ),
        (
            "observed",
            {"type": "recoverable", "state": {"fingerprint": fingerprint}},
        ),
        (
            "observed",
            {
                "type": "recoverable",
                "state": {"fingerprint": "B" * 64, "residual": "absent"},
            },
        ),
        (
            "observed",
            {
                "type": "recoverable",
                "state": {"fingerprint": fingerprint, "residual": "installed_plugin"},
            },
        ),
        ("observed", {"type": "blocked"}),
        ("observed", {"type": "blocked", "reason": "foreign"}),
        (
            "observed",
            {
                "type": "recoverable",
                "state": {"fingerprint": fingerprint, "residual": "absent"},
                "extra": 1,
            },
        ),
    ]
    for field, value in malformed_inputs:
        request = copy.deepcopy(base)
        request["input"][field] = value
        invalid.append(json.dumps(request))

    begin = {
        "schema": 1,
        "type": "repair_begin",
        "input": {
            "state": {"type": "operation_pending", "plan": plan},
            "observed": base["input"]["observed"],
            "plan": "c" * 64,
            "before": {
                "interrupted": plan,
                "pending": plan,
                "observed": {"fingerprint": fingerprint, "residual": "absent"},
            },
        },
    }
    for field, value in [
        ("plan", "c" * 63),
        ("before", {"interrupted": plan, "pending": plan}),
        (
            "before",
            {
                "interrupted": "A" * 64,
                "pending": plan,
                "observed": {"fingerprint": fingerprint, "residual": "absent"},
            },
        ),
        (
            "before",
            {
                "interrupted": plan,
                "pending": "c" * 63,
                "observed": {"fingerprint": fingerprint, "residual": "absent"},
            },
        ),
        (
            "before",
            {
                "interrupted": plan,
                "pending": plan,
                "observed": {"fingerprint": "b" * 63, "residual": "absent"},
            },
        ),
        (
            "before",
            {
                "interrupted": plan,
                "pending": plan,
                "observed": {"fingerprint": fingerprint, "residual": "absent"},
                "extra": True,
            },
        ),
    ]:
        request = copy.deepcopy(begin)
        request["input"][field] = value
        invalid.append(json.dumps(request))

    settle = {
        "schema": 1,
        "type": "repair_settle",
        "input": {
            "state": {
                "type": "repair_pending",
                "plan": "c" * 64,
                "before": {
                    "interrupted": plan,
                    "pending": plan,
                    "observed": {"fingerprint": fingerprint, "residual": "marketplace"},
                },
            },
            "observed": base["input"]["observed"],
        },
    }
    request = copy.deepcopy(settle)
    request["input"]["state"] = {"type": "operation_pending", "plan": plan}
    invalid.append(json.dumps(request))

    encoded = json.dumps(base, separators=(",", ":"))
    invalid.extend(
        [
            "{",
            encoded + " {}",
            encoded.replace('"schema":1', '"schema":1,"schema":1'),
            encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
            encoded.replace(
                '"type":"operation_pending"',
                '"type":"operation_pending","type":"complete"',
            ),
        ]
    )
    for text in invalid:
        result = execute(text + "\n")
        if (
            result.returncode != 1
            or result.stdout
            or not result.stderr.startswith("oracle:")
        ):
            raise RuntimeError(f"malformed repair input was not rejected: {text}")
    print(f"{len(invalid)} malformed repair wire inputs rejected")

    canonical = execute(encoded + "\n")
    if canonical.returncode != 0:
        raise RuntimeError(canonical.stderr)
    for number in ["1.0", "1e0", "10e-1", "1.0000000000000000001"]:
        result = execute(encoded.replace('"schema":1', '"schema":' + number) + "\n")
        if (
            result.returncode != 0
            or json.loads(result.stdout) != json.loads(canonical.stdout)
        ):
            raise RuntimeError(f"equivalent numeric schema version was rejected: {number}")
    print("equivalent numeric schema versions match JavaScript number decoding")


if __name__ == "__main__":
    replay()
    check_wire_inputs()
