import argparse
import itertools
import json

from check_replay import SPEC, execute, replay


EXAMPLES = SPEC.parent / "docs/internals/examples/bundle.ndjson"
VECTORS = SPEC / "vectors/bundle.ndjson"


def request():
    return {
        "schema": 1,
        "type": "check_bundle",
        "input": {
            "digest": "1" * 64,
            "computed": "1" * 64,
            "paths": ["plugin.json"],
        },
    }


def check_wire_inputs():
    invalid = []
    for field, value in [
        ("schema", 2), ("schema", 1.5), ("schema", 0), ("schema", "1"),
        ("type", "render"), ("extra", True),
    ]:
        case = request()
        case[field] = value
        invalid.append(case)

    case = request()
    del case["input"]
    invalid.append(case)

    for field, value in [
        ("digest", "1" * 63), ("digest", "A" * 64), ("digest", "g" + "1" * 63),
        ("computed", "1" * 63), ("computed", None), ("paths", []),
        ("paths", None), ("unknown", True),
    ]:
        case = request()
        case["input"][field] = value
        invalid.append(case)

    for field in ["digest", "computed"]:
        case = request()
        del case["input"][field]
        invalid.append(case)

    bad_paths = [
        "", "/asset", "../asset", "dir/../asset", "dir/./asset", "dir//asset", "dir/",
        "C:asset", "c:/asset", "dir\\asset", "dir/asset\0", "safe\n/../escape",
        "safe\n/asset\\escape", "safe\n/asset\0escape",
    ]
    for path in bad_paths:
        case = request()
        case["input"]["paths"] = [path]
        invalid.append(case)

    texts = [json.dumps(case) for case in invalid]
    encoded = json.dumps(request(), separators=(",", ":"))
    digest = "1" * 64
    texts.extend([
        "{",
        encoded.replace('"schema":1', '"schema":1,"schema":1'),
        encoded.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
        encoded.replace('"digest":"' + digest + '"',
                        '"digest":"' + digest + '","digest":"' + digest + '"'),
        encoded.replace('"digest":"' + digest + '"',
                        '"digest":"' + digest + '","d\\u0069gest":"' + digest + '"'),
    ])
    for text in texts:
        result = execute(text + "\n")
        if result.returncode != 1 or result.stdout or not result.stderr.startswith("oracle:"):
            raise RuntimeError("malformed bundle input was not rejected")
    print(f"{len(texts)} malformed bundle wire inputs rejected")


def expected_output(case):
    input = case["input"]
    paths = input["paths"]
    issues = []
    if input["digest"] != input["computed"]:
        issues.append({"type": "digest_mismatch"})
    if any(left.encode("utf-8") >= right.encode("utf-8") for left, right in zip(paths, paths[1:])):
        issues.append({"type": "noncanonical_order"})
    folding = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
    collisions = set()
    for index, left in enumerate(paths):
        left = left.translate(folding)
        for right in paths[index + 1:]:
            right = right.translate(folding)
            if left == right or right.startswith(left + "/"):
                collisions.add(left)
            elif left.startswith(right + "/"):
                collisions.add(right)
    issues.extend({"type": "path_collision", "path": path} for path in sorted(collisions, key=lambda path: path.encode("utf-8")))
    return {"type": "rejected", "issues": issues} if issues else {"type": "valid"}


def check_combinations():
    cases = []
    alphabet = ["a", "A", "a-b", "a/c", "b", "É", "é", "\ue000", "😀"]
    for length in range(1, 4):
        for paths in itertools.product(alphabet, repeat=length):
            for computed in ["1" * 64, "2" * 64]:
                case = request()
                case["input"].update(paths=list(paths), computed=computed)
                cases.append(case)
    result = execute("".join(json.dumps(case) + "\n" for case in cases))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(cases):
        raise RuntimeError("bundle combination response count differs")
    for case, response in zip(cases, responses, strict=True):
        expected = {"schema": 1, "type": "check_bundle", "output": expected_output(case)}
        if response != expected:
            raise RuntimeError(f"bundle check differs for {case['input']}: {response}")
    print(f"{len(cases)} bundle combinations match independent digest, ordering, and collision expectations")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="regenerate vectors from the checked oracle")
    options = parser.parse_args()
    replay(options.write, EXAMPLES, VECTORS, "bundle")
    check_wire_inputs()
    check_combinations()
