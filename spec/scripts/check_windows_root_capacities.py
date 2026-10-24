import argparse
import copy
import json
from pathlib import Path

from check_windows_paths import (
    decode_json, duplicate_member, encode, execute, expect_rejected, locations,
    mutated, replace_once, response_lines, strictly_equal, at_path, wrong_json_kinds,
)


VECTORS = Path(__file__).resolve().parents[1] / "vectors/windows-root-capacities.ndjson"
PROPERTY_TAGS = {f"WP{i}" for i in range(10, 15)}


def read_vectors():
    lines = VECTORS.read_text(encoding="utf-8").splitlines()
    if not lines or any(not line for line in lines):
        raise RuntimeError("root capacity vectors are empty or contain blank lines")
    cases = [decode_json(line) for line in lines]
    names, requests, tags = set(), set(), set()
    for case in cases:
        if type(case) is not dict or set(case) != {"name", "properties", "request", "expected"}:
            raise RuntimeError("invalid root capacity vector fields")
        name = case["name"]
        if type(name) is not str or not name or name in names:
            raise RuntimeError("empty or repeated root capacity vector name")
        names.add(name)
        labels = case["properties"]
        if (type(labels) is not list or not labels or
                any(type(tag) is not str or tag not in PROPERTY_TAGS for tag in labels) or
                len(set(labels)) != len(labels)):
            raise RuntimeError(f"invalid root capacity property labels: {name}")
        tags.update(labels)
        for field in ["request", "expected"]:
            envelope = case[field]
            payload = "input" if field == "request" else "output"
            if (type(envelope) is not dict or set(envelope) != {"schema", "type", payload} or
                    type(envelope["schema"]) is not int or envelope["schema"] != 1 or
                    envelope["type"] != "windows_root_capacity"):
                raise RuntimeError(f"invalid root capacity {field} envelope: {name}")
        key = json.dumps(case["request"], sort_keys=True)
        if key in requests:
            raise RuntimeError(f"repeated authored root capacity request: {name}")
        requests.add(key)
    if tags != PROPERTY_TAGS:
        raise RuntimeError(f"property coverage differs from WP10-WP14: {sorted(tags)}")
    return cases


def malformed_requests(base):
    invalid = set()
    for path, current in locations(base):
        changed = copy.deepcopy(base)
        at_path(changed, path)["unexpected"] = True
        invalid.add(encode(changed))
        for field, value in current.items():
            changed = copy.deepcopy(base)
            del at_path(changed, path)[field]
            invalid.add(encode(changed))
            for wrong in wrong_json_kinds(value):
                invalid.add(mutated(base, path, field, wrong))
    for path, field in [(('input',), 'maxComponentUnits'),
                        (('input', 'views', 0), 'maxPathBufferUnits')]:
        for value in [-1, 0.5, 4_294_967_296]:
            invalid.add(mutated(base, path, field, value))
    for root in ["a\0b", "\ud800", "\udfff"]:
        invalid.add(mutated(base, ('input', 'views', 0), 'root', root))
        changed = copy.deepcopy(base)
        changed['input']['views'].append({'root': root, 'maxPathBufferUnits': 10})
        invalid.add(encode(changed))
    invalid.add(mutated(base, ('input',), 'views', []))
    invalid.add(mutated(base, (), 'type', 'unknown'))
    invalid.add(mutated(base, (), 'schema', 2))
    wire = encode(base)
    for _, current in locations(base):
        for field in current:
            alias = json.dumps(field[:-1])[:-1] + f'\\u{ord(field[-1]):04x}"'
            invalid.add(duplicate_member(wire, field, alias))
    invalid.update([wire + ' trailing', wire + '\0', '[]', 'true', 'null'])
    return invalid


def exact_numbers(case):
    wire = encode(case['request'])
    forms = {
        'schema': ['1', '1.0', '1e0', '0.1e1', '10e-1', '1E+0'],
        'maxComponentUnits': ['255', '255.0', '2550e-1', '255E+0'],
        'maxPathBufferUnits': ['6', '6.0', '60e-1', '6E+0'],
    }
    originals = {'schema': 1, 'maxComponentUnits': 255, 'maxPathBufferUnits': 6}
    wires = [replace_once(wire, f'"{field}":{originals[field]}', f'"{field}":{form}')
             for field, variants in forms.items() for form in variants]
    responses = response_lines(execute('\n'.join(wires)), len(wires), 'exact root capacity numbers')
    if any(not strictly_equal(response, case['expected']) for response in responses):
        raise RuntimeError('mathematically integral numbers changed the root capacity result')
    rejected = 0
    for field, original in originals.items():
        numbers = ([
            '1.0000000000000000000000000000000001',
            '0.9999999999999999999999999999999999',
        ] if field == 'schema' else [
            f'{original}.0000000000000000000000000000000001',
            '4294967295.0000000000000000000000000000000001',
            '-0.0000000000000000000000000000000001',
        ])
        for number in numbers:
            expect_rejected(replace_once(wire, f'"{field}":{original}', f'"{field}":{number}'),
                            f'precise invalid {field}')
            rejected += 1
    return len(wires), rejected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    cases = read_vectors()
    responses = response_lines(execute('\n'.join(encode(c['request']) for c in cases)),
                               len(cases), 'authored root capacities')
    for case, response in zip(cases, responses, strict=True):
        if not strictly_equal(response, case['expected']):
            raise RuntimeError(f"{case['name']}: expected {case['expected']}, got {response}")
    by_name = {case['name']: case for case in cases}
    base = by_name['drive_root_trailing_separator']
    malformed = malformed_requests(base['request'])
    for wire in sorted(malformed):
        expect_rejected(wire, 'malformed root capacity request')
    integral, precise = exact_numbers(base)
    negative_zeros = 0
    for name, field in [('component_limit_zero_preserved', 'maxComponentUnits'),
                        ('zero_buffer_refuses', 'maxPathBufferUnits')]:
        case = by_name[name]
        wire = replace_once(encode(case['request']), f'"{field}":0', f'"{field}":-0')
        response = response_lines(execute(wire), 1, 'negative-zero root capacity')[0]
        if not strictly_equal(response, case['expected']):
            raise RuntimeError(f'negative zero changed {field}')
        negative_zeros += 1
    report = {'schema': 1, 'status': 'passed', 'vectors': len(cases),
              'property_tags': sorted(PROPERTY_TAGS), 'malformed_requests': len(malformed),
              'exact_numeric_forms': integral, 'precise_numeric_rejections': precise,
              'negative_zero_capacities': negative_zeros}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
