import itertools
import json
from pathlib import Path
import subprocess
import tempfile


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / ".lake/build/bin/oracle"
VECTORS = SPEC / "vectors/process-quoting.ndjson"


def request(text):
    return {"schema": 1, "type": "quote_process_text", "input": {"text": text}}


def execute(text):
    return subprocess.run(
        [str(ORACLE)], input=text, text=True, capture_output=True, timeout=10
    )


def evaluate(requests):
    result = execute("".join(json.dumps(case) + "\n" for case in requests))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.split("\n") if line]
    if len(responses) != len(requests):
        raise RuntimeError("process quoting response count differs")
    for response in responses:
        if set(response) != {"schema", "type", "output"} or response["schema"] != 1:
            raise RuntimeError("process quoting response envelope differs")
        if response["type"] != "quote_process_text" or set(response["output"]) != {"quoted"}:
            raise RuntimeError("process quoting response fields differ")
        if not isinstance(response["output"]["quoted"], str):
            raise RuntimeError("process quoting response is not text")
    return responses


def check_vectors():
    cases = [json.loads(line) for line in VECTORS.read_text().split("\n") if line]
    responses = evaluate([case["request"] for case in cases])
    for case, response in zip(cases, responses, strict=True):
        if response != case["expected"]:
            raise RuntimeError(f"process quoting vector differs: {case['name']}")
    print(f"{len(cases)} independent process quoting vectors match Lean")
    return [case["request"]["input"]["text"] for case in cases]


def check_wire_inputs():
    malformed = [
        "{",
        '{"schema":1,"type":"quote_process_text","input":{"text":"ok","extra":true}}',
        '{"schema":1,"type":"quote_process_text","input":{"text":"ok"},"extra":true}',
        '{"schema":1,"type":"quote_process_text","input":{"text":"ok","text":"changed"}}',
        '{"schema":1,"type":"quote_process_text","input":{"text":"ok","t\\u0065xt":"changed"}}',
        '{"schema":1,"type":"quote_process_text","input":{"text":"\\ud800"}}',
        '{"schema":1,"type":"quote_process_text","input":{"text":"\\udc00"}}',
    ]
    for text in [None, False, [], {}, 1, "a\x00b"]:
        malformed.append(json.dumps(request(text)))
    for version in [0, 2, 1.5, "1", True]:
        malformed.append(json.dumps({**request("ok"), "schema": version}))
    malformed.append(json.dumps({**request("ok"), "input": {}}))
    for text in malformed:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed process quoting request was accepted: {text!r}")
    print(f"{len(malformed)} malformed process quoting requests rejected")


def check_shell(texts):
    alphabet = ["'", '"', "\\", "$", "`", "\n", "\r", "\t", " ", "*", "é", "😀"]
    texts += [chr(code) for code in range(1, 128)]
    texts += ["".join(pair) for pair in itertools.product(alphabet, repeat=2)]
    texts += ["''", "a'\n'b", "${PSDK_QUOTE_MARKER}", "'" * 32, "a" * 4096]
    quoted = [response["output"]["quoted"] for response in evaluate([request(text) for text in texts])]
    script = "set -- " + " ".join(quoted) + "\nprintf '%s\\000' \"$@\"\n"
    with tempfile.TemporaryDirectory(prefix="pluginsdk-quoting-") as directory:
        result = subprocess.run(
            ["/bin/sh", "-c", script], cwd=directory,
            env={"PATH": "/usr/bin:/bin", "HOME": directory, "PSDK_QUOTE_MARKER": "expanded"},
            stdin=subprocess.DEVNULL, capture_output=True, timeout=5,
        )
    expected = b"".join(text.encode("utf-8") + b"\x00" for text in texts)
    if result.returncode != 0 or result.stderr or result.stdout != expected:
        raise RuntimeError("the system shell changed a quoted argument or executed its contents")
    print(f"{len(texts)} Lean-quoted arguments survive /bin/sh byte for byte")


if __name__ == "__main__":
    texts = check_vectors()
    check_wire_inputs()
    check_shell(texts)
