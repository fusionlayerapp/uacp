from __future__ import annotations
import re

from .kind_schemas import KIND_SCHEMAS
from .schema_subset import check_schema

SEMVER_RE = re.compile(r'^\d+\.\d+\.\d+$')
ISO8601_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$')
SHA256_RE = re.compile(r'^[a-f0-9]{64}$')
VALID_ROLES = {'user', 'assistant', 'system', 'tool'}
VALID_CONTENT_TYPES = {'text', 'image', 'file', 'code', 'thinking', 'artifact_ref', 'audio', 'video', 'pdf', 'latex'}
VALID_ARTIFACT_TYPES = {'code', 'html', 'svg', 'markdown', 'react', 'text'}
VALID_MSG_STATUS = {'complete', 'in_progress', 'error'}
VALID_PROVENANCE = {'extracted', 'inferred', 'system', 'tool_output'}
VALID_ROOT_KEYS = {
    'uacp', 'id', 'tool', 'tool_chain', 'model', 'title', 'extensions',
    'created_at', 'updated_at', 'tags', 'project', 'branches', 'messages', 'metadata',
}
VALID_MSG_KEYS = {
    'id', 'parent_id', 'role', 'content', 'timestamp', 'model', 'tokens', 'status',
    'tool_calls', 'call_id', 'tool_call_id', 'name', 'attachments', 'citations',
    'artifacts', 'redactions', 'metadata', 'provenance', 'confidence', 'provenance_source',
    'branch_parent_id', 'branch_label', 'reasoning',
}

MAX_ID_LEN = 256
MAX_TOOL_LEN = 128
MAX_CONTENT_LEN = 1048576


def _is_obj(v) -> bool:
    return isinstance(v, dict)


def _validate_content_block(block, prefix: str, errors: list[str]) -> None:
    if not _is_obj(block):
        errors.append(f'{prefix}: must be an object')
        return
    btype = block.get('type')
    if not btype or btype not in VALID_CONTENT_TYPES:
        errors.append(f'{prefix}.type: must be one of {", ".join(sorted(VALID_CONTENT_TYPES))}')
        return
    if btype in ('text', 'thinking', 'latex') and not isinstance(block.get('text'), str):
        errors.append(f'{prefix}: {btype} block requires text (string)')
    if btype == 'code' and not isinstance(block.get('code'), str):
        errors.append(f'{prefix}: code block requires code (string)')
    if btype == 'artifact_ref' and not isinstance(block.get('id'), str):
        errors.append(f'{prefix}: artifact_ref block requires id (string)')
    if btype in ('image', 'file', 'audio', 'video', 'pdf'):
        if not isinstance(block.get('url'), str) and not isinstance(block.get('data'), str):
            errors.append(f'{prefix}: {btype} block requires url or data')


def _validate_citation(c, prefix: str, errors: list[str]) -> None:
    if not _is_obj(c):
        errors.append(f'{prefix}: must be an object')
        return
    span = c.get('span')
    if not isinstance(span, list) or len(span) != 2 or not all(isinstance(v, int) for v in span):
        errors.append(f'{prefix}.span: must be [int, int]')
    source = c.get('source')
    if not _is_obj(source) or not isinstance(source.get('url'), str):
        errors.append(f'{prefix}.source.url: required')
    elif not source['url'].startswith(('http://', 'https://')):
        errors.append(f'{prefix}.source.url: must start with http:// or https://')


def _validate_artifact(a, prefix: str, errors: list[str]) -> None:
    if not _is_obj(a):
        errors.append(f'{prefix}: must be an object')
        return
    if not isinstance(a.get('id'), str) or not a['id']:
        errors.append(f'{prefix}.id: required non-empty string')
    if a.get('type') not in VALID_ARTIFACT_TYPES:
        errors.append(f'{prefix}.type: must be one of {", ".join(sorted(VALID_ARTIFACT_TYPES))}')
    if not isinstance(a.get('title'), str) or not a['title']:
        errors.append(f'{prefix}.title: required non-empty string')
    if not isinstance(a.get('content'), str):
        errors.append(f'{prefix}.content: required (string)')


def _validate_attachment(att, prefix: str, errors: list[str]) -> None:
    if not _is_obj(att):
        errors.append(f'{prefix}: must be an object')
        return
    if not isinstance(att.get('id'), str) or not att['id']:
        errors.append(f'{prefix}.id: required non-empty string')
    if not isinstance(att.get('mime_type'), str) or not att['mime_type']:
        errors.append(f'{prefix}.mime_type: required non-empty string')
    sha = att.get('sha256')
    if sha is not None and not SHA256_RE.match(sha):
        errors.append(f'{prefix}.sha256: must be 64 lowercase hex chars')


def _validate_redactions(red, prefix: str, errors: list[str]) -> None:
    if not _is_obj(red):
        errors.append(f'{prefix}: must be an object')
        return
    if not isinstance(red.get('count'), int):
        errors.append(f'{prefix}.count: required integer')
    if not isinstance(red.get('placeholder_format'), str):
        errors.append(f'{prefix}.placeholder_format: required string')


def _validate_model(model, prefix: str, errors: list[str]) -> None:
    if isinstance(model, str):
        if not model:
            errors.append(f'{prefix}: must be a non-empty string')
    elif _is_obj(model):
        if not isinstance(model.get('id'), str) or not model['id']:
            errors.append(f'{prefix}.id: required non-empty string')
    else:
        errors.append(f'{prefix}: must be a string or object with id')


def _validate_message(msg, idx: int, errors: list[str]) -> None:
    p = f'messages[{idx}]'
    if not _is_obj(msg):
        errors.append(f'{p}: must be an object')
        return

    # Unknown properties check (unevaluatedProperties: false)
    unknown = set(msg.keys()) - VALID_MSG_KEYS
    if unknown:
        errors.append(f'{p}: unknown properties: {", ".join(sorted(unknown))}')

    role = msg.get('role')
    if role not in VALID_ROLES:
        errors.append(f'{p}.role: must be one of {", ".join(sorted(VALID_ROLES))}')

    content = msg.get('content')
    if content is None:
        errors.append(f'{p}.content: required')
    elif isinstance(content, list):
        if len(content) == 0:
            errors.append(f'{p}.content: array must contain at least one content block')
        for j, block in enumerate(content):
            _validate_content_block(block, f'{p}.content[{j}]', errors)
    elif isinstance(content, str):
        if len(content) > MAX_CONTENT_LEN:
            errors.append(f'{p}.content: string exceeds maxLength {MAX_CONTENT_LEN}')
    else:
        errors.append(f'{p}.content: must be a string or array of content blocks')

    status = msg.get('status')
    if status is not None and status not in VALID_MSG_STATUS:
        errors.append(f'{p}.status: must be one of {", ".join(sorted(VALID_MSG_STATUS))}')

    ts = msg.get('timestamp')
    if ts is not None and not ISO8601_RE.match(ts):
        errors.append(f'{p}.timestamp: must be an ISO 8601 datetime string')

    model = msg.get('model')
    if model is not None:
        _validate_model(model, f'{p}.model', errors)

    tokens = msg.get('tokens')
    if tokens is not None:
        if _is_obj(tokens):
            inp = tokens.get('input')
            out = tokens.get('output')
            if inp is not None and (not isinstance(inp, int) or inp < 0):
                errors.append(f'{p}.tokens.input: must be a non-negative integer')
            if out is not None and (not isinstance(out, int) or out < 0):
                errors.append(f'{p}.tokens.output: must be a non-negative integer')

    provenance = msg.get('provenance')
    if provenance is not None and provenance not in VALID_PROVENANCE:
        errors.append(f'{p}.provenance: must be one of {", ".join(sorted(VALID_PROVENANCE))}')

    confidence = msg.get('confidence')
    if provenance == 'inferred' and confidence is None:
        errors.append(f'{p}.confidence: required when provenance=inferred')
    if provenance == 'extracted' and confidence is not None:
        errors.append(f'{p}.confidence: must not be present when provenance=extracted')
    if confidence is not None and isinstance(confidence, (int, float)):
        if not (0 <= confidence <= 1):
            errors.append(f'{p}.confidence: must be between 0 and 1')

    tool_calls = msg.get('tool_calls')
    if tool_calls is not None:
        if not isinstance(tool_calls, list):
            errors.append(f'{p}.tool_calls: must be an array')
        else:
            for k, tc in enumerate(tool_calls):
                tcp = f'{p}.tool_calls[{k}]'
                if not _is_obj(tc):
                    errors.append(f'{tcp}: must be an object')
                    continue
                if not isinstance(tc.get('call_id'), str) or not tc['call_id']:
                    errors.append(f'{tcp}.call_id: required non-empty string')
                if not isinstance(tc.get('name'), str) or not tc['name']:
                    errors.append(f'{tcp}.name: required non-empty string')

    attachments = msg.get('attachments')
    if attachments is not None:
        if not isinstance(attachments, list):
            errors.append(f'{p}.attachments: must be an array')
        else:
            for k, att in enumerate(attachments):
                _validate_attachment(att, f'{p}.attachments[{k}]', errors)

    citations = msg.get('citations')
    if citations is not None:
        if not isinstance(citations, list):
            errors.append(f'{p}.citations: must be an array')
        else:
            for j, c in enumerate(citations):
                _validate_citation(c, f'{p}.citations[{j}]', errors)

    artifacts = msg.get('artifacts')
    if artifacts is not None:
        if not isinstance(artifacts, list):
            errors.append(f'{p}.artifacts: must be an array')
        else:
            for j, a in enumerate(artifacts):
                _validate_artifact(a, f'{p}.artifacts[{j}]', errors)

    redactions = msg.get('redactions')
    if redactions is not None:
        _validate_redactions(redactions, f'{p}.redactions', errors)


def _validate_kind_envelope(doc: dict) -> dict:
    errors: list[str] = []
    uacp = doc.get('uacp')
    if not isinstance(uacp, str) or not SEMVER_RE.match(uacp):
        errors.append('uacp: must be a semver string (e.g. "0.6.0")')
    doc_id = doc.get('id')
    if not isinstance(doc_id, str) or not doc_id.strip():
        errors.append('id: required, must be a non-empty string')
    elif len(doc_id) > MAX_ID_LEN:
        errors.append(f'id: must not exceed {MAX_ID_LEN} characters')
    schema = KIND_SCHEMAS.get(doc['kind'])
    if not isinstance(schema, dict):
        errors.append(f"kind: unknown artifact kind '{doc['kind']}'")
    else:
        check_schema(schema, doc['body'], 'body', schema, errors)
    if errors:
        return {'ok': False, 'errors': errors}
    return {'ok': True}


def validate(doc: object) -> dict:
    errors: list[str] = []

    if not _is_obj(doc):
        return {'ok': False, 'errors': ['Root must be a JSON object']}

    # A kind+body artifact envelope (memory, persona, ...) is not a conversation:
    # its body is judged by its kind schema, as in validate.js (uacp#102, #105).
    if isinstance(doc.get('kind'), str) and 'body' in doc:
        return _validate_kind_envelope(doc)

    # Unknown root properties (unevaluatedProperties: false)
    unknown_root = set(doc.keys()) - VALID_ROOT_KEYS
    if unknown_root:
        errors.append(f'root: unknown properties: {", ".join(sorted(unknown_root))}')

    uacp = doc.get('uacp')
    if not isinstance(uacp, str) or not SEMVER_RE.match(uacp):
        errors.append('uacp: must be a semver string (e.g. "0.6.0")')

    doc_id = doc.get('id')
    if not isinstance(doc_id, str) or not doc_id:
        errors.append('id: required, must be a non-empty string')
    elif len(doc_id) > MAX_ID_LEN:
        errors.append(f'id: must not exceed {MAX_ID_LEN} characters')

    tool = doc.get('tool')
    if tool is None:
        errors.append('tool: required, must be a string or array of strings')
    elif isinstance(tool, str):
        if not tool:
            errors.append('tool: string must not be empty (minLength 1)')
        elif len(tool) > MAX_TOOL_LEN:
            errors.append(f'tool: string must not exceed {MAX_TOOL_LEN} characters')
    elif isinstance(tool, list):
        if len(tool) == 0:
            errors.append('tool: array must contain at least one item (minItems 1)')
        else:
            for t in tool:
                if not isinstance(t, str) or not t:
                    errors.append('tool: each array item must be a non-empty string')
                    break
    else:
        errors.append('tool: must be a string or array of strings')

    model = doc.get('model')
    if model is not None:
        _validate_model(model, 'model', errors)

    messages = doc.get('messages')
    if not isinstance(messages, list):
        errors.append('messages: required, must be an array')
    elif len(messages) == 0:
        errors.append('messages: must contain at least one message')
    else:
        for i, msg in enumerate(messages):
            _validate_message(msg, i, errors)

    created_at = doc.get('created_at')
    if created_at is not None and not ISO8601_RE.match(created_at):
        errors.append('created_at: must be an ISO 8601 datetime string')

    updated_at = doc.get('updated_at')
    if updated_at is not None and not ISO8601_RE.match(updated_at):
        errors.append('updated_at: must be an ISO 8601 datetime string')

    extensions = doc.get('extensions')
    if extensions is not None:
        if not isinstance(extensions, list):
            errors.append('extensions: must be an array')
        elif len(extensions) > 32:
            errors.append('extensions: must not contain more than 32 items')

    branches = doc.get('branches')
    if branches is not None and not isinstance(branches, list):
        errors.append('branches: must be an array of strings')

    if errors:
        return {'ok': False, 'errors': errors}
    return {'ok': True}
