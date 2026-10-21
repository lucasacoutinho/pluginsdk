import argparse
import copy
import itertools
import json
import string

from check_replay import SPEC, execute


VECTORS = SPEC / "vectors/assembly.ndjson"
DIGESTS = ["1" * 64, "2" * 64, "a" * 64]
RESERVED_ROOTS = [
    "plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin",
    ".codex-plugin", ".claude", ".codex", "skills", "commands", "agents", "hooks",
]
ASCII_FOLD = str.maketrans(string.ascii_uppercase, string.ascii_lowercase)


def asset(path, index=0, executable=False):
    return {"path": path, "digest": DIGESTS[index % len(DIGESTS)], "executable": executable}


def request(base, assets):
    return {"schema": 1, "type": "assemble", "input": {"base": base, "assets": assets}}


def examples():
    return [
        ("preserves-and-sorts", request(
            [asset("z/base.txt", 0, True), asset("é/base.txt", 1)],
            [asset("a/readme.md", 2), asset("😀/tool.sh", 0, True)],
        )),
        ("case-fold-collision", request(
            [asset("Docs/Guide.md"), asset("docs/guide.md", 1)], []
        )),
        ("ancestor-collision", request(
            [asset("dir/child.bin"), asset("DIR", 1)], []
        )),
        ("reserved-original-paths-and-all-diagnostics", request(
            [asset("base", 0), asset("base/child", 1), asset("BASE", 2)],
            [asset("PLUGIN.JSON", 0), asset(".CoDeX/agents.md", 1), asset("commands/Run.md", 2)],
        )),
        ("utf8-ordering", request(
            [asset("😀.md"), asset("z.md"), asset("\ue000.md"), asset("é.md")], []
        )),
        ("duplicate-requests-are-collisions", request(
            [asset("same.bin"), asset("same.bin")], [asset("same.bin", 2, True)]
        )),
    ]


def expected_output(case):
    requested = case["input"]["base"] + case["input"]["assets"]
    collisions = set()
    for index, left_asset in enumerate(requested):
        left = left_asset["path"].translate(ASCII_FOLD)
        for right_asset in requested[index + 1:]:
            right = right_asset["path"].translate(ASCII_FOLD)
            if left == right or right.startswith(left + "/"):
                collisions.add(left)
            elif left.startswith(right + "/"):
                collisions.add(right)

    issues = {("path_collision", path) for path in collisions}
    for requested_asset in case["input"]["assets"]:
        original = requested_asset["path"]
        folded = original.translate(ASCII_FOLD)
        if any(folded == root or folded.startswith(root + "/") for root in RESERVED_ROOTS):
            issues.add(("reserved_asset", original))

    ordered_issues = sorted(issues, key=lambda item: (item[0].encode("utf-8"), item[1].encode("utf-8")))
    if ordered_issues:
        return {"type": "rejected", "issues": [
            {"type": kind, "path": path} for kind, path in ordered_issues
        ]}
    files = sorted(requested, key=lambda item: item["path"].encode("utf-8"))
    return {"type": "assembled", "files": files}


def check_vectors(write):
    cases = examples()
    encoded_requests = "".join(json.dumps(case, separators=(",", ":")) + "\n" for _, case in cases)
    result = execute(encoded_requests)
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("assembly vector response count differs")

    rows = []
    for (name, case), response in zip(cases, responses, strict=True):
        expected = {"schema": 1, "type": "assemble", "output": expected_output(case)}
        if response != expected:
            raise RuntimeError(f"{name}: oracle differs from independent assembly result: {response}")
        rows.append({"name": name, "request": case, "expected": response})
    generated = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in rows)
    if write:
        VECTORS.parent.mkdir(exist_ok=True)
        VECTORS.write_text(generated)
    elif not VECTORS.exists() or VECTORS.read_text() != generated:
        raise RuntimeError("assembly vectors differ from the current oracle")
    print(f"{len(cases)} assembly oracle vectors match independent expectations")


def check_wire_inputs():
    valid = request([asset("base.txt")], [])
    malformed = []
    for key, value in [
        ("schema", 2), ("schema", 1.5), ("schema", 0), ("schema", "1"),
        ("type", "render"), ("extra", True),
    ]:
        case = copy.deepcopy(valid)
        case[key] = value
        malformed.append(case)

    case = copy.deepcopy(valid)
    del case["input"]
    malformed.append(case)
    for key, value in [("base", []), ("base", None), ("base", {}), ("assets", None),
                       ("assets", {}), ("unknown", True)]:
        case = copy.deepcopy(valid)
        case["input"][key] = value
        malformed.append(case)
    for field in ["base", "assets"]:
        case = copy.deepcopy(valid)
        del case["input"][field]
        malformed.append(case)

    bad_assets = [
        {}, {"path": "safe.txt", "digest": "1" * 64},
        {"path": "safe.txt", "digest": "1" * 64, "executable": False, "extra": 1},
        {"path": "safe.txt", "digest": "1" * 63, "executable": False},
        {"path": "safe.txt", "digest": "A" * 64, "executable": False},
        {"path": "safe.txt", "digest": "g" + "1" * 63, "executable": False},
        {"path": "safe.txt", "digest": "1" * 64, "executable": 0},
        {"path": "../escape", "digest": "1" * 64, "executable": False},
    ]
    for bad_asset in bad_assets:
        case = copy.deepcopy(valid)
        case["input"]["base"] = [bad_asset]
        malformed.append(case)
    for path in ["", "/absolute", "dir/../escape", "dir/./x", "dir//x", "dir/",
                 "C:asset", "c:/asset", "dir\\asset", "dir/asset\0"]:
        case = copy.deepcopy(valid)
        case["input"]["assets"] = [asset(path)]
        malformed.append(case)

    encoded = json.dumps(valid, separators=(",", ":"))
    malformed_text = [json.dumps(case) for case in malformed]
    malformed_text.extend([
        "{",
        encoded.replace('"schema":1', '"schema":1,"schema":1'),
        encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
        encoded.replace('"base":[', '"base":[],"ba\\u0073e":['),
        encoded.replace('"path":"base.txt"', '"path":"base.txt","path":"base.txt"'),
    ])
    for text in malformed_text:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError(f"malformed assembly wire input was not rejected: {text}")
    print(f"{len(malformed_text)} malformed assembly wire inputs rejected")


def check_permutations():
    base = [asset("base/z.txt"), asset("base/a.txt", 1, True), asset("β.txt", 2)]
    assets = [asset("assets/é.md"), asset("assets/😀.md", 1), asset("tools/run.sh", 2, True)]
    cases = [request(list(base_order), list(asset_order))
             for base_order in itertools.permutations(base)
             for asset_order in itertools.permutations(assets)]
    collision_base = [asset("Tree/Leaf"), asset("Other")]
    collision_assets = [asset("tree", 1), asset("PLUGIN.JSON", 2)]
    cases.extend(request(list(base_order), list(asset_order))
                 for base_order in itertools.permutations(collision_base)
                 for asset_order in itertools.permutations(collision_assets))

    result = execute("".join(json.dumps(case) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("assembly permutation response count differs")
    for case, response in zip(cases, responses, strict=True):
        independent = {"schema": 1, "type": "assemble", "output": expected_output(case)}
        if response != independent:
            raise RuntimeError(f"assembly permutation disagrees with independent result: {case}")
    valid_count = 6 * 6
    if any(response != responses[0] for response in responses[:valid_count]):
        raise RuntimeError("separate base/assets permutations changed accepted assembly")
    rejected = responses[valid_count:]
    if any(response != rejected[0] for response in rejected):
        raise RuntimeError("separate base/assets permutations changed rejected assembly")
    print(f"{len(cases)} assembly permutations preserve canonical accepted and rejected outputs")


def check_path_combinations():
    alphabet = ["a", "A", "a/b", "b", "é", "\ue000", "😀", "skills/x", "Hooks/item"]
    cases = []
    for size in range(1, 4):
        for paths in itertools.product(alphabet, repeat=size):
            base = [asset(paths[0])]
            assets = [asset(path, index + 1) for index, path in enumerate(paths[1:])]
            cases.append(request(base, assets))
    result = execute("".join(json.dumps(case) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("assembly path combination response count differs")
    for case, response in zip(cases, responses, strict=True):
        expected = {"schema": 1, "type": "assemble", "output": expected_output(case)}
        if response != expected:
            raise RuntimeError(f"assembly differs for paths {case['input']}: {response}")
    print(f"{len(cases)} case, ancestor, reserved, and Unicode path combinations match independent results")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="regenerate vectors from the checked oracle")
    options = parser.parse_args()
    check_vectors(options.write)
    check_wire_inputs()
    check_permutations()
    check_path_combinations()
