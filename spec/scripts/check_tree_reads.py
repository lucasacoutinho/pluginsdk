import copy
import json
from pathlib import Path
import subprocess


SPEC = Path(__file__).resolve().parents[1]
ORACLE = SPEC / '.lake/build/bin/oracle'
VECTORS = SPEC / 'vectors/tree-reads.ndjson'


def encode(value):
    return json.dumps(value, ensure_ascii=True, separators=(',', ':'))


def execute(wire):
    return subprocess.run([str(ORACLE)], input=wire + '\n', text=True, capture_output=True, timeout=10)


def objects(value, path=()):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from objects(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from objects(child, path + (index,))


def at_path(value, path):
    for component in path:
        value = value[component]
    return value


def wrong_kinds(value):
    if isinstance(value, dict):
        return [None, True, 1, 'bad', []]
    if isinstance(value, list):
        return [None, True, 1, 'bad', {}]
    if isinstance(value, bool):
        return [None, 0, 'true', [], {}]
    if isinstance(value, (int, float)):
        return [None, True, '1', [], {}]
    return [None, True, 1, [], {}]


def malformed_requests(representatives):
    malformed = set()
    for request in representatives:
        wire = encode(request)
        for path, obj in objects(request):
            changed = copy.deepcopy(request)
            at_path(changed, path)['extra'] = True
            malformed.add(encode(changed))
            for field, original in obj.items():
                changed = copy.deepcopy(request)
                del at_path(changed, path)[field]
                malformed.add(encode(changed))
                invalid = wrong_kinds(original)
                if field == 'volume':
                    invalid += ['', '0' * 15, '0' * 17, 'F' * 16, 'g' * 16]
                elif field == 'file':
                    invalid += ['', '0' * 31, '0' * 33, 'F' * 32, 'g' * 32]
                elif field == 'path':
                    invalid += ['bad\0path', '\ud800', '\udfff']
                elif field in ['modified', 'changed', 'size']:
                    invalid += ['', '-1', '01', '1.0', '1e1', '9223372036854775808', '9' * 100]
                elif field == 'tag':
                    invalid += [-1, 0.5, 4294967296]
                elif field == 'name':
                    invalid += ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'a\0b', '\ud800']
                elif field == 'policy':
                    invalid += ['', 'unknown', 'SOURCE']
                elif field == 'type':
                    invalid += ['', 'unknown']
                elif field == 'schema':
                    invalid += [0, 2, 0.5]
                if field in ['names', 'visited']:
                    invalid += [[name] for name in ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'a\0b', '\ud800']]
                for value in invalid:
                    changed = copy.deepcopy(request)
                    at_path(changed, path)[field] = value
                    malformed.add(encode(changed))
                token = encode(field) + ':'
                assert token in wire
                malformed.add(wire.replace(token, token + 'null,' + token, 1))
        malformed.add(wire.replace('"schema":1', '"schema":1,"sch\\u0065ma":1', 1))
    return malformed


def expect_response(wire, expected, label):
    result = execute(wire)
    assert result.returncode == 0 and result.stderr == '', (label, result.returncode, result.stderr)
    assert json.loads(result.stdout) == expected, (label, result.stdout, expected)


def main():
    vectors = [json.loads(line) for line in VECTORS.read_text().splitlines()]
    assert all(set(row) == {'name', 'properties', 'request', 'expected'} for row in vectors)
    assert len({row['name'] for row in vectors}) == len(vectors)
    assert len({encode(row['request']) for row in vectors}) == len(vectors)
    assert {tag for row in vectors for tag in row['properties']} == {f'TR{i}' for i in range(1, 14)}
    entry_tags = {'accepted', 'unavailable', 'not_regular', 'stream', 'changed', 'outside', 'name_mismatch', 'reparse', 'cycle'}
    directory_tags = {'accepted', 'unavailable', 'not_directory', 'stream', 'changed', 'outside', 'duplicate', 'incomplete'}
    assert {row['expected']['output'] for row in vectors if row['request']['type'] == 'tree_entry'} == entry_tags
    assert {row['expected']['output'] for row in vectors if row['request']['type'] == 'tree_directory'} == directory_tags
    result = execute('\n'.join(encode(row['request']) for row in vectors))
    assert result.returncode == 0 and result.stderr == '', result.stderr
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(responses) == len(vectors)
    for row, response in zip(vectors, responses, strict=True):
        assert response == row['expected'], (row['name'], response, row['expected'])
    representatives = [next(row['request'] for row in vectors if row['name'] == name) for name in [
        'entry_source_regular_file_accepts', 'entry_payload_ordinary_directory_accepts',
        'entry_source_symlink_into_root_accepts', 'directory_members_visited_once_accepts',
        'directory_before_other_is_not_directory',
    ]]
    malformed = malformed_requests(representatives)
    for wire in sorted(malformed):
        result = execute(wire)
        assert result.returncode == 1 and result.stdout == '' and result.stderr.strip(), ('malformed accepted', wire, result.stdout, result.stderr)
    entry = next(row for row in vectors if row['name'] == 'entry_source_symlink_into_root_accepts')
    numeric_forms = 0
    for value in ['1', '1.0', '1e0', '10e-1', '0.1e1']:
        wire = encode(entry['request']).replace('"schema":1', '"schema":' + value, 1)
        expect_response(wire, entry['expected'], 'schema ' + value)
        numeric_forms += 1
    tag = entry['request']['input']['entry']['info']['tag']
    for value in ['2684354572', '2684354572.0', '2.684354572e9', '268435457200e-2', '0', '-0', '4294967295', '4.294967295e9']:
        wire = encode(entry['request']).replace('"tag":' + str(tag), '"tag":' + value, 1)
        expected = copy.deepcopy(entry['expected'])
        if value in ['0', '-0', '4294967295', '4.294967295e9']:
            expected['output'] = 'reparse'
        expect_response(wire, expected, 'tag ' + value)
        numeric_forms += 1
    precise_rejections = []
    for field, original, value in [
        ('schema', '1', '1.0000000000000000000001'),
        ('schema', '1', '0.9999999999999999999999'),
        ('tag', str(tag), '2684354572.0000000000000001'),
        ('tag', str(tag), '4294967295.0000000000000001'),
    ]:
        wire = encode(entry['request']).replace('"' + field + '":' + original, '"' + field + '":' + value, 1)
        result = execute(wire)
        assert result.returncode == 1 and result.stdout == '' and result.stderr.strip(), value
        precise_rejections.append(value)
    print(json.dumps({
        'status': 'passed', 'authoredVectors': len(vectors), 'properties': 13, 'decisionTags': 17,
        'malformedWireRejections': len(malformed), 'exactNumericForms': numeric_forms,
        'preciseNumericRejections': len(precise_rejections), 'negativeZeroTagAccepted': True,
    }))


if __name__ == '__main__':
    main()
