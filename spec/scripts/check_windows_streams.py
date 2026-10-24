import copy
import json
from pathlib import Path
import subprocess
import sys

SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/windows-streams.ndjson"


def stream():
    return {
        "schema": 1, "type": "windows_stream_step",
        "input": {
            "state": {"input": {"type": "open", "remaining": 7}, "outputRemaining": 5},
            "signal": {"type": "input", "bytes": 3}
        }
    }


def io():
    return {"schema": 1, "type": "windows_io_step", "input": {"phase": "pending", "signal": "cancel"}}


def replace(request, path, value):
    changed = copy.deepcopy(request)
    parent = changed
    for field in path[:-1]:
        parent = parent[field]
    parent[path[-1]] = value
    return json.dumps(changed)


def wire_cases():
    rejected = ["{", "null", "[]", "true"]
    for request in [stream(), io()]:
        rejected.extend(replace(request, ["schema"], value) for value in [0, 2, 1.5, "1", True, None])
        rejected.extend(replace(request, ["type"], value) for value in [None, "", False, "windows_unknown_step"])
        rejected.extend(replace(request, ["input"], value) for value in [None, [], "input", 3])
        rejected.append(json.dumps({**request, "extra": True}))
        rejected.append(json.dumps({**request, "input": {**request["input"], "extra": True}}))
        for required in ["schema", "type", "input"]:
            rejected.append(json.dumps({key: value for key, value in request.items() if key != required}))
    rejected.extend(replace(stream(), ["input", "state"], value) for value in [None, [], False, {}])
    rejected.extend(replace(stream(), ["input", "state", "input"], value) for value in [None, [], False, {}, {"type": "open"}])
    rejected.extend(replace(stream(), ["input", "state", "input", "type"], value) for value in ["", "ending", None, 1])
    for path in [
        ["input", "state", "input", "remaining"], ["input", "state", "outputRemaining"],
        ["input", "signal", "bytes"]
    ]:
        rejected.extend(replace(stream(), path, value) for value in [-1, 0.5, 9007199254740992, "3", True, None, [], {}])
    rejected.extend(replace(stream(), ["input", "signal"], value) for value in [
        None, [], {}, {"type": "input"}, {"type": "output"},
        {"type": "end_input", "bytes": 0}, {"type": "complete"},
        {"type": "input", "bytes": 3, "extra": True}
    ])
    rejected.append(replace(stream(), ["input", "state"], {"input": {"type": "open", "remaining": 7}, "outputRemaining": 5, "extra": True}))
    rejected.append(replace(stream(), ["input", "state", "input"], {"type": "open", "remaining": 7, "extra": True}))
    for field in ["phase", "signal"]:
        rejected.extend(replace(io(), ["input", field], value) for value in [None, 0, {}, [], "unknown"])
        missing = io()
        del missing["input"][field]
        rejected.append(json.dumps(missing))
    rejected.extend([
        '{"schema":1,"schema":1,"type":"windows_io_step","input":{"phase":"pending","signal":"cancel"}}',
        '{"schema":1,"type":"windows_io_step","input":{"phase":"pending","p\\u0068ase":"terminal","signal":"release"}}',
        '{"schema":1,"type":"windows_stream_step","input":{"state":{"input":{"type":"open","remaining":7},"outputRemaining":5},"signal":{"type":"input","bytes":3,"bytes":4}}}',
        json.dumps(stream()).replace('"bytes": 3', '"bytes": 1e309'),
        json.dumps(stream()).replace('"bytes": 3', '"bytes": -1e309'),
        json.dumps(io()).replace('"pending"', '"\\ud800"'),
        json.dumps(io()).replace('"pending"', '"\\udc00"'),
        json.dumps(io()) + " false",
        json.dumps(io())[:-1] + ",}",
    ])
    accepted = []
    for request in [stream(), io()]:
        for number in ["1.0", "1e0", "1.0000000000000000"]:
            accepted.append(json.dumps(request).replace('"schema": 1', f'"schema": {number}', 1))
    for number in ["3.0", "3e0", "3.0000000000000000", "0", "-0.0", "9007199254740991", "9007199254740991e0"]:
        accepted.append(json.dumps(stream()).replace('"bytes": 3', f'"bytes": {number}', 1))
    return {"rejected": rejected, "accepted": accepted}


def execute(text):
    return subprocess.run([str(ORACLE)], input=text, text=True, capture_output=True, timeout=10)


def check_vectors():
    cases = [json.loads(line) for line in VECTORS.read_text().splitlines() if line]
    assert len({case["name"] for case in cases}) == len(cases)
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("Windows stream response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"Windows stream vector differs: {case['name']}")
    print(f"{len(cases)} independent Windows stream and I/O vectors match Lean")


def check_wire():
    cases = wire_cases()
    for text in cases["rejected"]:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed Windows stream request was accepted: {text!r}")
    for text in cases["accepted"]:
        result = execute(text + "\n")
        if result.returncode != 0 or not result.stdout or result.stderr:
            raise RuntimeError(f"valid numeric form was rejected: {text!r}")
    print(f"{len(cases['rejected'])} malformed Windows stream requests rejected; {len(cases['accepted'])} valid numeric forms accepted")


if __name__ == "__main__":
    if sys.argv[1:] == ["--cases"]:
        print(json.dumps(wire_cases()))
    else:
        check_vectors()
        check_wire()
