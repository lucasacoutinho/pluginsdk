import argparse
import copy
import json
import random

from check_replay import SPEC, execute, replay


EXAMPLES = SPEC.parent / "docs/internals/examples/compiler.ndjson"
VECTORS = SPEC / "vectors/compiler.ndjson"


def request():
    return {"schema": 1, "type": "render", "input": {
        "format": "agent_plugins_v1",
        "metadata": {"id": "team-kit", "version": "0.1.0", "description": "Shared tools"},
        "skills": [], "mcp": {},
    }}


def check_wire_inputs():
    invalid = []
    for field, value in [
        ("format", "unknown"), ("skills", {}), ("mcp", {"": {"url": "https://example.test", "headers": {}}}),
        ("metadata", {"id": "team-kit", "version": "", "description": "Shared tools"}),
    ]:
        case = request()
        case["input"][field] = value
        invalid.append(case)
    for name in ["A", "-kit", "kit-", "kit--tools", "kit..tools", "a" * 65, "kit\n"]:
        case = request()
        case["input"]["metadata"]["id"] = name
        invalid.append(case)
    captured = {"digest": "1" * 64, "executable": False}
    for name in ["", "Review", "-review", "review-", "re--view", "re_view", "a" * 65]:
        case = request()
        case["input"]["skills"] = [{"name": name, "entry": captured, "assets": []}]
        invalid.append(case)
    for path in ["", "/asset", "../asset", "dir/../asset", "dir/./asset", "dir//asset", "dir/",
                 "C:asset", "c:/asset", "dir\\asset", "dir/asset\0", "safe\n/../escape",
                 "safe\n/asset\\escape", "safe\n/asset\0escape"]:
        case = request()
        case["input"]["skills"] = [{"name": "review", "entry": captured, "assets": [{"path": path, **captured}]}]
        invalid.append(case)
    for headers in [{"bad name": "value"}, {"Authorization": "a\nb"}, {"Authorization": "😀"},
                    {"Authorization": {"type": "environment", "name": "9TOKEN", "prefix": "Bearer "}},
                    {"Authorization": {"type": "environment", "name": "TOKEN", "prefix": "Bearer ", "extra": True}}]:
        case = request()
        case["input"]["mcp"] = {"docs": {"url": "https://example.test/mcp", "headers": headers}}
        invalid.append(case)
    texts = [json.dumps(case) for case in invalid]
    encoded = json.dumps(request(), separators=(",", ":"))
    texts.extend([
        encoded.replace('"schema":1', '"schema":1,"schema":1'),
        encoded.replace('"skills":[]', '"skills":[],"sk\\u0069lls":[]'),
    ])
    for text in texts:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed compiler input was not rejected: {text}")
    print(f"{len(texts)} malformed compiler wire inputs rejected")


def check_enumerations():
    randomizer = random.Random(20261020)
    groups = []
    captured = {"digest": "1" * 64, "executable": False}
    for format in ["agent_plugins_v1", "claude_code_v1"]:
        for rejected in [False, True]:
            base = request()
            base["input"]["format"] = format
            assets = [{"path": path, **captured} for path in ["é.md", "\ue000.md", "😀.md", "scripts/check.sh"]]
            if rejected:
                assets += [{"path": path, **captured} for path in ["a", "a-b", "a/c", "SKILL.md"]]
            base["input"]["skills"] = [
                {"name": "review", "entry": captured, "assets": assets},
                {"name": "check", "entry": captured, "assets": []},
            ]
            headers = {"X-Tenant": "public", "Accept": "application/json"}
            if rejected:
                headers |= {"x-tenant": "other", "Authorization": {"type": "environment", "name": "TOKEN", "prefix": "${OTHER}: "}}
            base["input"]["mcp"] = {"docs": {"url": "https://example.test/mcp", "headers": headers},
                                    "search": {"url": "http://127.0.0.1/mcp", "headers": {}}}
            group = [base]
            for _ in range(24):
                case = copy.deepcopy(base)
                randomizer.shuffle(case["input"]["skills"])
                for skill in case["input"]["skills"]:
                    randomizer.shuffle(skill["assets"])
                servers = list(case["input"]["mcp"].items())
                randomizer.shuffle(servers)
                for _, source in servers:
                    entries = list(source["headers"].items())
                    randomizer.shuffle(entries)
                    source["headers"] = dict(entries)
                case["input"]["mcp"] = dict(servers)
                group.append(case)
            groups.append(group)
    cases = [case for group in groups for case in group]
    result = execute("".join(json.dumps(case) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("compiler enumeration response count differs")
    for index, group in enumerate(groups):
        start = index * len(group)
        for response in responses[start:start + len(group)]:
            if response != responses[start]:
                raise RuntimeError("enumeration changed canonical compiler output")
        output = responses[start]["output"]
        if output["type"] == "rendered":
            paths = [file["path"] for file in output["files"]]
            if paths != sorted(paths, key=lambda path: path.encode("utf-8")):
                raise RuntimeError("compiler paths do not use unsigned UTF-8 ordering")
    print(f"{len(cases)} compiler enumerations preserve output, including UTF-8 paths and multiple rejections")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="regenerate vectors from the checked oracle")
    options = parser.parse_args()
    replay(options.write, EXAMPLES, VECTORS, "compiler")
    check_wire_inputs()
    check_enumerations()
