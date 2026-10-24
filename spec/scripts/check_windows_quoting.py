import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/windows-quoting.ndjson"


def request(text):
    return {"schema": 1, "type": "quote_windows_argument", "input": {"text": text}}


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=10
    )


def check_vectors():
    cases = [json.loads(line) for line in VECTORS.read_text().splitlines() if line]
    result = execute("".join(json.dumps(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("Windows quoting response count differs")
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"Windows quoting vector differs: {case['name']}")
    print(f"{len(cases)} independent Windows quoting vectors match Lean")


def check_wire():
    malformed = [
        "{",
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"ok","extra":true}}',
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"ok"},"extra":true}',
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"ok","text":"changed"}}',
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"ok","t\\u0065xt":"changed"}}',
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"\\ud800"}}',
        '{"schema":1,"type":"quote_windows_argument","input":{"text":"\\udc00"}}',
    ]
    malformed.extend(json.dumps(request(text)) for text in [None, False, [], {}, 1, "a\x00b"])
    malformed.extend(json.dumps({**request("ok"), "schema": version}) for version in [0, 2, 1.5, "1", True])
    malformed.extend([
        json.dumps({**request("ok"), "input": {}}),
        json.dumps({**request("ok"), "input": {"text": "ok", "quoted": "changed"}}),
        json.dumps({**request("ok"), "input": []}),
        json.dumps({**request("ok"), "type": None}),
    ])
    for text in malformed:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed Windows quoting request was accepted: {text!r}")
    for version in ["1.0", "1e0", "1.0000000000000000"]:
        text = json.dumps(request("ok")).replace('"schema": 1', f'"schema": {version}', 1)
        result = execute(text + "\n")
        if result.returncode != 0 or not result.stdout or result.stderr:
            raise RuntimeError(f"numeric schema equivalent was rejected: {version}")
    print(f"{len(malformed)} malformed Windows quoting requests rejected; three numeric equivalents accepted")


if __name__ == "__main__":
    check_vectors()
    check_wire()
