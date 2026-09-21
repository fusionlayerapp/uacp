import json
import os
import pytest
from uacp import validate, parse, serialize, UACPDocument, validate_memory_sequence

VECTORS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'test-vectors')

MINIMAL = {
    'uacp': '0.6.0',
    'id': 'test-conv-id-001',
    'tool': 'test-tool',
    'messages': [{'role': 'user', 'content': 'Hello'}],
}


# ---------------------------------------------------------------------------
# validate()
# ---------------------------------------------------------------------------

def test_kind_envelope_is_validated_against_its_kind_schema():
    doc = {'uacp': '0.6.0', 'id': 'k1', 'kind': 'memory', 'body': {'content': 'Prefers dark mode'}}
    assert validate(doc) == {'ok': True}
    bad = validate({**doc, 'body': {'content': 'x', 'confidence': 2}})
    assert bad['ok'] is False
    assert any('body.confidence' in e for e in bad['errors'])


def test_kind_envelope_passes_unknown_kind_through():
    assert validate({'uacp': '0.6.0', 'id': 'k2', 'kind': 'vendor/custom', 'body': {'x': 1}}) == {'ok': True}


def test_kind_envelope_checks_uri_and_date_time_formats():
    persona = {'uacp': '0.6.0', 'id': 'k3', 'kind': 'persona',
               'body': {'name': 'n', 'description': 'd', 'system_prompt': 'p', 'avatar_url': 'https://example.com/a.png'}}
    assert validate(persona) == {'ok': True}
    bad = validate({**persona, 'body': {**persona['body'], 'avatar_url': 'this is not a url at all!!'}})
    assert bad['ok'] is False and any('body.avatar_url' in e for e in bad['errors'])
    memory = {'uacp': '0.6.0', 'id': 'k4', 'kind': 'memory', 'body': {'content': 'c', 'expires_at': '2024-02-29T00:00:00Z'}}
    assert validate(memory) == {'ok': True}
    for value in ('9999-99-99T99:99:99Z', '2026-02-29T00:00:00Z'):
        bad = validate({**memory, 'body': {'content': 'c', 'expires_at': value}})
        assert bad['ok'] is False and any('body.expires_at' in e for e in bad['errors'])


def test_validate_minimal_valid():
    assert validate(MINIMAL) == {'ok': True}


def test_validate_rejects_missing_uacp():
    doc = {k: v for k, v in MINIMAL.items() if k != 'uacp'}
    r = validate(doc)
    assert r['ok'] is False
    assert any('uacp' in e for e in r['errors'])


def test_validate_rejects_missing_id():
    doc = {k: v for k, v in MINIMAL.items() if k != 'id'}
    r = validate(doc)
    assert r['ok'] is False
    assert any('id' in e for e in r['errors'])


def test_validate_rejects_missing_tool():
    doc = {k: v for k, v in MINIMAL.items() if k != 'tool'}
    r = validate(doc)
    assert r['ok'] is False
    assert any('tool' in e for e in r['errors'])


def test_validate_rejects_missing_messages():
    doc = {k: v for k, v in MINIMAL.items() if k != 'messages'}
    r = validate(doc)
    assert r['ok'] is False
    assert any('messages' in e for e in r['errors'])


def test_validate_rejects_empty_messages():
    r = validate({**MINIMAL, 'messages': []})
    assert r['ok'] is False
    assert any('messages' in e for e in r['errors'])


def test_validate_rejects_invalid_role():
    r = validate({**MINIMAL, 'messages': [{'role': 'bot', 'content': 'hi'}]})
    assert r['ok'] is False
    assert any('role' in e for e in r['errors'])


def test_validate_content_blocks():
    r = validate({**MINIMAL, 'messages': [{'role': 'assistant', 'content': [
        {'type': 'text', 'text': 'Hello'},
        {'type': 'thinking', 'text': 'reasoning...'},
        {'type': 'code', 'code': 'print("hi")', 'language': 'python'},
    ]}]})
    assert r == {'ok': True}


def test_validate_rejects_invalid_content_block_type():
    r = validate({**MINIMAL, 'messages': [{'role': 'user', 'content': [{'type': 'unknown-type'}]}]})
    assert r['ok'] is False
    assert any('type' in e for e in r['errors'])


def test_validate_citations_with_span_and_source_url():
    r = validate({**MINIMAL, 'messages': [{
        'role': 'assistant',
        'content': 'Source: ...',
        'citations': [{'span': [0, 6], 'source': {'url': 'https://example.com'}}],
    }]})
    assert r == {'ok': True}


def test_validate_rejects_citation_without_source_url():
    r = validate({**MINIMAL, 'messages': [{
        'role': 'assistant',
        'content': 'text',
        'citations': [{'span': [0, 1], 'source': {}}],
    }]})
    assert r['ok'] is False
    assert any('source.url' in e for e in r['errors'])


def test_validate_artifacts():
    r = validate({**MINIMAL, 'messages': [{
        'role': 'assistant',
        'content': [
            {'type': 'text', 'text': 'Here is the code'},
            {'type': 'artifact_ref', 'id': 'art-1'},
        ],
        'artifacts': [{'id': 'art-1', 'type': 'code', 'title': 'example.py', 'content': 'x = 1'}],
    }]})
    assert r == {'ok': True}


def test_validate_iso8601_timestamps():
    r = validate({**MINIMAL, 'created_at': '2026-05-09T12:00:00Z', 'updated_at': '2026-05-09T12:00:01.000Z'})
    assert r == {'ok': True}


def test_validate_rejects_non_iso_timestamp():
    r = validate({**MINIMAL, 'created_at': 'not-a-date'})
    assert r['ok'] is False
    assert any('created_at' in e for e in r['errors'])


# ---------------------------------------------------------------------------
# parse()
# ---------------------------------------------------------------------------

def test_parse_valid_json_string():
    doc = parse(json.dumps(MINIMAL))
    assert doc.id == MINIMAL['id']
    assert doc.tool == MINIMAL['tool']


def test_parse_raises_on_invalid_document():
    with pytest.raises(ValueError, match='UACP parse failed'):
        parse({'uacp': 'bad', 'id': '', 'tool': '', 'messages': []})


# ---------------------------------------------------------------------------
# serialize()
# ---------------------------------------------------------------------------

def test_serialize_produces_valid_json():
    doc = parse(MINIMAL)
    json_str = serialize(doc)
    parsed = json.loads(json_str)
    assert parsed['id'] == MINIMAL['id']
    assert parsed['uacp'] == MINIMAL['uacp']


def test_serialize_raises_on_invalid_document():
    doc = UACPDocument.model_validate({**MINIMAL, 'messages': []})
    with pytest.raises(ValueError, match='UACP serialize failed'):
        serialize(doc)


def test_parse_serialize_round_trip():
    complex_doc = {
        'uacp': '0.6.0',
        'id': 'round-trip-001',
        'tool': 'test',
        'title': 'Round-trip test',
        'created_at': '2026-05-09T00:00:00Z',
        'messages': [
            {'role': 'user', 'content': 'Write a bubble sort function'},
            {
                'role': 'assistant',
                'content': [
                    {'type': 'text', 'text': 'Here it is:'},
                    {'type': 'code', 'code': 'def bubble_sort(arr): pass', 'language': 'python'},
                ],
            },
        ],
        'metadata': {'session': 'abc123'},
    }
    json_str = serialize(parse(complex_doc))
    back = parse(json_str)
    assert back.id == complex_doc['id']
    assert back.title == complex_doc['title']
    assert len(back.messages) == 2


# ---------------------------------------------------------------------------
# Test vectors
# ---------------------------------------------------------------------------

INVALID_VECTORS = {
    '09-encrypted-envelope.uacp.json',
    '10-export-bundle.uacp.json',
    '11-empty-messages-refused.uacp.json',
    '19-provenance-confidence-on-extracted-rejected.uacp.json',
}


def _load_vector(filename):
    path = os.path.join(VECTORS_DIR, filename)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _expects_invalid(filename):
    meta = _load_vector(filename).get('metadata') or {}
    return meta.get('uacp.test.expect') == 'invalid'


def _list_valid_vectors():
    files = [f for f in os.listdir(VECTORS_DIR) if f.endswith('.uacp.json')]
    return [f for f in files if f not in INVALID_VECTORS and not _expects_invalid(f)]


def _list_invalid_vectors():
    result = [f for f in INVALID_VECTORS]
    result += [f for f in os.listdir(VECTORS_DIR) if f.endswith('.uacp.json') and f not in INVALID_VECTORS and _expects_invalid(f)]
    invalid_dir = os.path.join(VECTORS_DIR, 'invalid')
    if os.path.isdir(invalid_dir):
        result += [os.path.join('invalid', f) for f in os.listdir(invalid_dir) if f.endswith('.uacp.json')]
    return result


@pytest.mark.parametrize('filename', _list_valid_vectors())
def test_valid_vector_passes(filename):
    doc = _load_vector(filename)
    result = validate(doc)
    assert result['ok'] is True, f'{filename} should be valid but got errors: {result.get("errors")}'


@pytest.mark.parametrize('filename', _list_invalid_vectors())
def test_invalid_vector_fails(filename):
    path = os.path.join(VECTORS_DIR, filename)
    with open(path, encoding='utf-8') as f:
        doc = json.load(f)
    result = validate(doc)
    assert result['ok'] is False, f'{filename} should be invalid but validate() returned ok=True'


# ---------------------------------------------------------------------------
# Memory semantic checks (uacp#107)
# ---------------------------------------------------------------------------

MEMORY_VECTORS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'conformance', 'memory', 'vectors')


def _memory(body):
    return {'uacp': '0.6.0', 'id': 'mem-1', 'kind': 'memory', 'body': body}


def test_memory_semantically_valid_is_accepted():
    body = {'content': 'Prefers dark mode', 'topics': ['preference'],
            'lifecycle': {'action': 'create', 'status': 'active', 'revision': 1}}
    assert validate(_memory(body)) == {'ok': True}


def test_memory_broken_revision_chain_is_rejected_like_validate_js():
    body = {'content': 'x', 'lifecycle': {'action': 'update', 'status': 'active', 'revision': 3,
                                          'previous_revision': {'memory_id': 'mem-1', 'revision': 1}}}
    r = validate(_memory(body))
    assert r['ok'] is False
    assert 'body.lifecycle: MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION' in r['errors']


def test_memory_predecessor_for_another_memory_is_rejected():
    body = {'content': 'x', 'lifecycle': {'action': 'update', 'status': 'active', 'revision': 2,
                                          'previous_revision': {'memory_id': 'mem-other', 'revision': 1}}}
    assert 'body.lifecycle: MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH' in validate(_memory(body))['errors']


def test_memory_sensitive_without_explicit_consent_is_rejected():
    r = validate(_memory({'content': 'x', 'category': 'health'}))
    assert 'body.lifecycle: MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT' in r['errors']


def test_memory_unknown_unnamespaced_topic_and_profile_are_rejected():
    r = validate(_memory({'content': 'x', 'topics': ['hobbies'],
                          'profile_link': {'schema_id': 'custom', 'schema_version': 1, 'field': 'f'}}))
    assert 'body: MEMORY_TOPIC_UNKNOWN_UNNAMESPACED' in r['errors']
    assert 'body: MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA' in r['errors']


def test_memory_namespaced_topic_and_profile_are_accepted():
    body = {'content': 'x', 'topics': ['acme/hobbies'],
            'profile_link': {'schema_id': 'acme/crm', 'schema_version': 1, 'field': 'f'}}
    assert validate(_memory(body)) == {'ok': True}


def _memory_vectors():
    return sorted(f for f in os.listdir(MEMORY_VECTORS_DIR) if f.endswith('.json'))


def test_memory_conformance_vectors_are_present():
    assert len(_memory_vectors()) >= 9


@pytest.mark.parametrize('filename', _memory_vectors())
def test_memory_conformance_vector(filename):
    with open(os.path.join(MEMORY_VECTORS_DIR, filename), encoding='utf-8') as f:
        vector = json.load(f)
    errors = validate_memory_sequence(vector.get('memories') or [],
                                      require_signed_envelopes=vector.get('require_signed_envelopes') is True)
    assert ('accepted' if not errors else 'rejected') == vector['expected_outcome'], errors
    if vector.get('expected_error'):
        assert vector['expected_error'] in errors, errors
