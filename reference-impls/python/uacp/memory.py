"""Semantic checks for kind: memory envelopes.

Mirrors lib/memory-lifecycle.js, lib/memory-topics.js, lib/memory-profile.js and
conformance/memory/run.js so the reference validator rejects exactly what
validate.js rejects (uacp#107).
"""
from __future__ import annotations

import hashlib
import json
import re

SENSITIVE_CATEGORIES = {'health', 'financial'}
ACTIVE_ACTIONS = {'create', 'confirm', 'update', 'supersede', 'rollback'}
CORE_TOPICS = {
    'accessibility', 'career', 'education', 'family', 'finance', 'health',
    'identity', 'location', 'preference', 'project', 'relationship',
}
CORE_METADATA_KEYS = {'importance', 'locale', 'effective_from'}
CORE_PROFILE_SCHEMAS = {'user', 'project', 'team'}
NAMESPACED_RE = re.compile(r'^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$')
SIGNATURE_RE = re.compile(r'^sha256:[a-f0-9]{64}$')


def _has_reference(references) -> bool:
    return isinstance(references, list) and len(references) > 0


def _is_namespaced(value) -> bool:
    return isinstance(value, str) and NAMESPACED_RE.match(value) is not None


def _revision(value):
    # JS compares numbers only; a bool is not a revision number.
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def validate_memory_lifecycle(body: dict, memory_id: str | None = None) -> list[str]:
    errors: list[str] = []

    if body.get('category') in SENSITIVE_CATEGORIES and body.get('consent') != 'explicit':
        errors.append('MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT')

    lifecycle = body.get('lifecycle')
    if not lifecycle:
        return errors

    action = lifecycle.get('action')
    status = lifecycle.get('status')
    revision = _revision(lifecycle.get('revision'))
    previous = lifecycle.get('previous_revision')

    if revision is not None and revision > 1 and not previous:
        errors.append('MEMORY_LIFECYCLE_PREVIOUS_REVISION_REQUIRED')
    if revision == 1 and previous:
        errors.append('MEMORY_LIFECYCLE_INITIAL_REVISION_HAS_PREDECESSOR')
    if memory_id and previous and previous.get('memory_id') != memory_id:
        errors.append('MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH')
    if previous and (revision is None or previous.get('revision') != revision - 1):
        errors.append('MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION')
    if action == 'create' and revision != 1:
        errors.append('MEMORY_LIFECYCLE_CREATE_MUST_START_AT_REVISION_ONE')
    if action == 'supersede' and not _has_reference(body.get('supersedes')):
        errors.append('MEMORY_LIFECYCLE_SUPERSEDE_REQUIRES_SUPERSEDES')
    if action == 'tombstone' and status != 'tombstoned':
        errors.append('MEMORY_LIFECYCLE_TOMBSTONE_REQUIRES_TOMBSTONED_STATUS')
    if status == 'tombstoned' and action != 'tombstone':
        errors.append('MEMORY_LIFECYCLE_TOMBSTONED_STATUS_REQUIRES_TOMBSTONE_ACTION')
    if action == 'expire' and status != 'expired':
        errors.append('MEMORY_LIFECYCLE_EXPIRE_REQUIRES_EXPIRED_STATUS')
    if status == 'expired' and action != 'expire':
        errors.append('MEMORY_LIFECYCLE_EXPIRED_STATUS_REQUIRES_EXPIRE_ACTION')
    if action == 'rollback' and (not previous or not _has_reference(body.get('derived_from'))):
        errors.append('MEMORY_LIFECYCLE_ROLLBACK_REQUIRES_LINEAGE')
    if action in ACTIVE_ACTIONS and status != 'active':
        errors.append('MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS')

    return errors


def validate_memory_topics(body: dict) -> list[str]:
    errors: list[str] = []
    for topic in body.get('topics') or []:
        if topic not in CORE_TOPICS and not _is_namespaced(topic):
            errors.append('MEMORY_TOPIC_UNKNOWN_UNNAMESPACED')
    for entry in body.get('metadata') or []:
        key = entry.get('key')
        if not _is_namespaced(key) and key not in CORE_METADATA_KEYS:
            errors.append('MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY')
    return list(dict.fromkeys(errors))


def validate_memory_profile(body: dict) -> list[str]:
    link = body.get('profile_link')
    if not link:
        return []
    schema_id = link.get('schema_id')
    if schema_id not in CORE_PROFILE_SCHEMAS and not _is_namespaced(schema_id):
        return ['MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA']
    return []


def canonical_json(value) -> str:
    """Same serialization as canonicalJSON() in signing.js (sorted keys, no whitespace)."""
    if isinstance(value, list):
        return '[' + ','.join(canonical_json(v) for v in value) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(
            json.dumps(k, ensure_ascii=False) + ':' + canonical_json(value[k]) for k in sorted(value)
        ) + '}'
    return json.dumps(value, ensure_ascii=False)


def _envelope_signature_error(memory: dict) -> str | None:
    signature = memory.get('signature')
    if not isinstance(signature, str) or not SIGNATURE_RE.match(signature):
        return 'MEMORY_SEQUENCE_SIGNATURE_REQUIRED'
    unsigned = {k: v for k, v in memory.items() if k != 'signature'}
    expected = 'sha256:' + hashlib.sha256(canonical_json(unsigned).encode('utf-8')).hexdigest()
    return None if signature == expected else 'MEMORY_SEQUENCE_SIGNATURE_INVALID'


def _key(memory_id, revision) -> str:
    return f'{memory_id}@{revision}'


def validate_memory_sequence(memories: list[dict], require_signed_envelopes: bool = False) -> list[str]:
    """Validate an ordered sequence of memory revisions, as conformance/memory/run.js does."""
    errors: list[str] = []
    seen: set[str] = set()
    profile_claims: dict[str, list[str]] = {}

    for memory in memories:
        if require_signed_envelopes:
            signature_error = _envelope_signature_error(memory)
            if signature_error:
                errors.append(signature_error)

        body = memory.get('body') or {}
        lifecycle = body.get('lifecycle')
        if not lifecycle:
            errors.append('MEMORY_SEQUENCE_LIFECYCLE_REQUIRED')
            continue

        errors.extend(validate_memory_lifecycle(body, memory.get('id')))
        errors.extend(validate_memory_profile(body))
        key = _key(memory.get('id'), lifecycle.get('revision'))
        if key in seen:
            errors.append('MEMORY_SEQUENCE_DUPLICATE_REVISION')
            continue

        previous = lifecycle.get('previous_revision')
        if previous:
            if _key(previous.get('memory_id'), previous.get('revision')) not in seen:
                errors.append('MEMORY_SEQUENCE_PREDECESSOR_NOT_FOUND')
            revision = _revision(lifecycle.get('revision'))
            if revision is None or previous.get('revision') != revision - 1:
                errors.append('MEMORY_SEQUENCE_NON_CONTIGUOUS_REVISION')

        for reference in (body.get('supersedes') or []) + (body.get('derived_from') or []):
            if _key(reference.get('memory_id'), reference.get('revision')) not in seen:
                errors.append('MEMORY_SEQUENCE_REFERENCE_NOT_FOUND')

        seen.add(key)

        link = body.get('profile_link')
        status = lifecycle.get('status') or 'active'
        if link and status == 'active':
            claim_key = '|'.join([
                str(memory.get('subject') or 'anonymous'),
                str(memory.get('scope') or 'individual'),
                f"{link.get('schema_id')}@{link.get('schema_version')}",
                str(link.get('field')),
            ])
            profile_claims.setdefault(claim_key, []).append(link.get('conflict') or 'none')

    for claims in profile_claims.values():
        if len(claims) > 1 and any(conflict != 'unresolved' for conflict in claims):
            errors.append('MEMORY_PROFILE_FIELD_CONFLICT')

    return list(dict.fromkeys(errors))
