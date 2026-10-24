import copy
import itertools
import json

from check_replay import SPEC, execute


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def walk(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, (*path, index))


def at(value, path):
    for key in path:
        value = value[key]
    return value


def replace(value, path, changed):
    if not path:
        return changed
    result = copy.deepcopy(value)
    at(result, path[:-1])[path[-1]] = changed
    return result


def compare(cases):
    result = execute("".join(encoded(case["request"]) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(cases) != len(responses):
        raise RuntimeError("agent/companion response count differs")
    for case, actual in zip(cases, responses, strict=True):
        if actual != case["expected"]:
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, received {actual}")


def permutations(cases):
    values = []
    for case in cases:
        fields = ("agents",) if case["request"]["type"] == "render_agents" else ("previous", "desired", "observed")
        orders = [list(itertools.permutations(case["request"]["input"][field])) for field in fields]
        seen = {encoded(case["request"])}
        for selection in itertools.product(*orders):
            changed = copy.deepcopy(case)
            for field, order in zip(fields, selection, strict=True):
                changed["request"]["input"][field] = list(order)
            text = encoded(changed["request"])
            if text in seen:
                continue
            seen.add(text)
            values.append(changed)
    return values


def malformed(cases):
    invalid = []
    agent_base = copy.deepcopy(next(case["request"] for case in cases if case["name"] == "claude_code_canonical_names"))
    for agent in agent_base["input"]["agents"]:
        agent["model"] = "selected-model"
        agent["shell"] = "deny"
    companion_base = next(case["request"] for case in cases if case["name"] == "canonical_complete_mixed_transition")
    for base in (agent_base, companion_base):
        for path, value in walk(base):
            if isinstance(value, dict):
                changed = copy.deepcopy(base)
                at(changed, path)["extra"] = True
                invalid.append(encoded(changed))
                for field in value:
                    changed = copy.deepcopy(base)
                    del at(changed, path)[field]
                    invalid.append(encoded(changed))
                for wrong in (None, [], "wrong", False):
                    invalid.append(encoded(replace(base, path, wrong)))
            elif isinstance(value, list):
                for wrong in (None, {}, "wrong", False):
                    invalid.append(encoded(replace(base, path, wrong)))
            elif isinstance(value, str):
                for wrong in ("", None, False, [], {}):
                    if wrong is None and path[-1] == "model":
                        continue
                    invalid.append(encoded(replace(base, path, wrong)))
                key = path[-1]
                if key in {"type", "host", "shell"}:
                    invalid.append(encoded(replace(base, path, "__unknown__")))
                if key == "digest":
                    for wrong in ("A" * 64, "a" * 63, "z" * 64):
                        invalid.append(encoded(replace(base, path, wrong)))
            elif isinstance(value, int):
                for wrong in (2, 1.5, None, True, "1"):
                    invalid.append(encoded(replace(base, path, wrong)))
        text = encoded(base)
        invalid.extend([
            text.replace('"schema":1', '"schema":1,"schema":1', 1),
            text.replace('"schema":1', '"schema":1,"sch' + chr(92) + 'u0065ma":1', 1),
            text.replace('"name":', '"name":"duplicate","name":', 1),
            text.replace('"name":', '"name":"duplicate","na' + chr(92) + 'u006de":', 1),
            text.replace('"input":{', '"input":{"bad' + chr(92) + 'ud800":0,', 1),
        ])
        name_path = next(path for path, value in walk(base) if path and path[-1] == "name")
        invalid.append(encoded(replace(base, name_path, "sentinel")).replace('"sentinel"', '"' + chr(92) + 'ud800"', 1))
        invalid.append(encoded(replace(base, name_path, "has\0nul")))

    for wrong in ("-bad", "bad-", "a--b", "UPPER", "a_b", "a.b", "a:b", "../escape", "a/b", "a" * 65):
        invalid.append(encoded(replace(agent_base, ("input", "agents", 0, "name"), wrong)))
    for wrong in ("-bad", "bad-", "a--b", "a..b", "a/b", "A", "a" * 65):
        invalid.append(encoded(replace(agent_base, ("input", "plugin"), wrong)))
    trim_points = [9, 10, 11, 12, 13, 32, 160, 5760, *range(8192, 8203), 8232, 8233, 8239, 8287, 12288, 65279]
    for field in ("description", "prompt", "model"):
        path = ("input", "agents", 0, field)
        for point in trim_points:
            for wrong in (chr(point) + "text", "text" + chr(point)):
                invalid.append(encoded(replace(agent_base, path, wrong)))
        invalid.append(encoded(replace(agent_base, path, "has\0nul")))
    invalid.append(encoded(replace(agent_base, ("input", "agents", 0, "model"), "inherit")))
    for variant in ("absent", "conflict", "unknown"):
        base = copy.deepcopy(companion_base)
        base["input"]["observed"][0]["observed"] = {"type": variant, "digest": "a" * 64}
        invalid.append(encoded(base))
    return list(dict.fromkeys(invalid))


def main():
    cases = []
    for name in ("agents", "companions"):
        cases.extend(json.loads(line) for line in (SPEC / "vectors" / f"{name}.ndjson").read_text(encoding="utf-8").splitlines() if line)
    if {case["request"]["type"] for case in cases} != {"render_agents", "review_companions"}:
        raise RuntimeError("vectors must cover both agent operations")
    if any(set(case) != {"name", "properties", "request", "expected"} for case in cases):
        raise RuntimeError("unexpected vector fields")
    compare(cases)
    lifecycle = [json.loads(line) for line in (SPEC / "vectors/agent-lifecycle.ndjson").read_text(encoding="utf-8").splitlines() if line]
    compare(lifecycle)
    reordered = permutations(cases)
    compare(reordered)
    invalid = malformed(cases)
    for text in invalid:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout.strip() or "oracle:" not in result.stderr:
            raise RuntimeError(f"malformed agent/companion request accepted: {text}")
    numeric_count = 0
    for case in (cases[0], next(case for case in cases if case["request"]["type"] == "review_companions")):
        for numeric in ("1.0", "1e0", "1.00000000000000000001"):
            result = execute(encoded(case["request"]).replace('"schema":1', f'"schema":{numeric}', 1) + "\n")
            if result.returncode != 0 or json.loads(result.stdout) != case["expected"]:
                raise RuntimeError("numeric schema version disagrees with JavaScript")
            numeric_count += 1
    print(f"{len(cases)} authored agent/companion and {len(lifecycle)} dependency vectors, {len(reordered)} permutations, {len(invalid)} malformed requests and {numeric_count} numeric schema cases pass")


if __name__ == "__main__":
    main()
