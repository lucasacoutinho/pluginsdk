import copy
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ORACLE = ROOT / ".lake/build/bin/oracle"


def encode(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True)


def execute(wire):
    return subprocess.run([str(ORACLE)], input=wire + "\n", capture_output=True, text=True, timeout=10)


def main():
    cases = [json.loads(line) for line in (ROOT / "vectors/worker.ndjson").read_text().splitlines() if line]
    assert len({(case["request"]["input"]["state"], case["request"]["input"]["signal"]) for case in cases}) == 9
    invalid = set()
    for case in cases:
        wire = encode(case["request"])
        result = execute(wire)
        if result.returncode != 0 or json.loads(result.stdout) != case["expected"]:
            raise RuntimeError(case["name"])
        for location in [[], ["input"]]:
            target = case["request"]
            for key in location:
                target = target[key]
            for key in [*target, "extra"]:
                changed = copy.deepcopy(case["request"])
                selected = changed
                for part in location:
                    selected = selected[part]
                if key == "extra": selected[key] = True
                else: del selected[key]
                invalid.add(encode(changed))
        for field in ["state", "signal"]:
            for value in ["", "other", None, True, 1, [], {}]:
                changed = copy.deepcopy(case["request"])
                changed["input"][field] = value
                invalid.add(encode(changed))
        invalid.add(wire.replace('"schema":1', '"schema":1,"schema":1', 1))
    for wire in invalid:
        result = execute(wire)
        if result.returncode != 1 or result.stdout.strip() or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed request accepted: {wire}")
    for version in ["1.0", "1e0", "1.00000000000000000001"]:
        wire = encode(cases[0]["request"]).replace('"schema":1', f'"schema":{version}', 1)
        result = execute(wire)
        if result.returncode != 0 or json.loads(result.stdout) != cases[0]["expected"]:
            raise RuntimeError("schema number differs from JavaScript")
    print(f"{len(cases)} worker cases, {len(invalid)} malformed requests and 3 numeric cases pass")


if __name__ == "__main__":
    main()
