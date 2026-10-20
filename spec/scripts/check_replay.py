import argparse
import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
EXAMPLES = SPEC.parent / "docs/examples/replay.ndjson"
VECTORS = SPEC / "vectors/lifecycle.ndjson"


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=30
    )


def replay(write, examples=EXAMPLES, vectors=VECTORS, label="lifecycle"):
    cases = []
    for line in examples.read_text().splitlines():
        scenario = json.loads(line)
        for frame in scenario["frames"]:
            cases.append({"name": scenario["name"], "properties": scenario["properties"], **frame})
    if not cases:
        raise RuntimeError("no replay scenarios")
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("oracle response count differs from request count")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {response}")
        case["expected"] = response
    generated = "".join(json.dumps(case, sort_keys=True, separators=(",", ":")) + "\n" for case in cases)
    if write:
        vectors.parent.mkdir(exist_ok=True)
        vectors.write_text(generated)
    elif vectors.read_text() != generated:
        raise RuntimeError(f"{label} vectors differ from the current oracle")
    print(f"{len(cases)} {label} frames match the design examples and generated vectors")


def check_wire_inputs():
    base = {"schema": 1, "type": "decide", "input": {
        "journal": {"type": "empty", "last": None},
        "observed": {"type": "absent"}, "desired": {"type": "absent"}
    }}
    invalid = []
    for key, value in [
        ("schema", 2), ("schema", 1.5), ("schema", 0), ("schema", -1),
        ("schema", "1"), ("type", "render"), ("extra", True)
    ]:
        request = copy.deepcopy(base)
        request[key] = value
        invalid.append(json.dumps(request))
    request = copy.deepcopy(base)
    del request["input"]
    invalid.append(json.dumps(request))
    for field, value in [
        ("journal", {"type": "empty"}),
        ("journal", {"type": "empty", "last": "A" * 64}),
        ("observed", {"type": "absent", "identity": None}),
        ("desired", {"type": "present"}),
        ("desired", {"type": "present", "bundle": "a" * 63}),
    ]:
        request = copy.deepcopy(base)
        request["input"][field] = value
        invalid.append(json.dumps(request))
    encoded = json.dumps(base, separators=(",", ":"))
    invalid.extend([
        "{",
        encoded.replace('"schema":1', '"schema":1,"schema":1'),
        encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
        encoded.replace('"observed":{"type":"absent"}',
                        '"observed":{"type":"absent","type":"unknown"}'),
    ])
    for text in invalid:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed input was not rejected: {text}")
    print(f"{len(invalid)} malformed wire inputs rejected")
    canonical = execute(encoded + "\n")
    for number in ["1.0", "1e0", "10e-1", "1.0000000000000000001"]:
        result = execute(encoded.replace('"schema":1', '"schema":' + number) + "\n")
        if result.returncode != 0 or json.loads(result.stdout) != json.loads(canonical.stdout):
            raise RuntimeError(f"equivalent numeric schema version was rejected: {number}")
    print("equivalent numeric schema versions match JavaScript number decoding")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="regenerate vectors from the checked oracle")
    options = parser.parse_args()
    replay(options.write)
    check_wire_inputs()
