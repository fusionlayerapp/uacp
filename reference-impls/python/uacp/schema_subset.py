"""Minimal JSON Schema (2020-12) evaluator covering the keywords used by the
kind body schemas in schema/v1/kinds. Annotation-only keywords (title,
description, default, format) are ignored, as they are by default in ajv."""
from __future__ import annotations

import json
import math
import re


def _canonical(v) -> str:
    return json.dumps(v, sort_keys=True, separators=(',', ':'))


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and not (isinstance(v, float) and not math.isfinite(v))


def _type_matches(t: str, v) -> bool:
    if t == 'object':
        return isinstance(v, dict)
    if t == 'array':
        return isinstance(v, list)
    if t == 'string':
        return isinstance(v, str)
    if t == 'number':
        return _is_number(v)
    if t == 'integer':
        return _is_number(v) and float(v).is_integer()
    if t == 'boolean':
        return isinstance(v, bool)
    if t == 'null':
        return v is None
    return False


def _resolve_ref(ref: str, root: dict):
    m = re.match(r'^#/\$defs/(.+)$', ref)
    defs = root.get('$defs')
    if not m or not isinstance(defs, dict) or m.group(1) not in defs:
        raise ValueError(f'unsupported $ref {ref}')
    return defs[m.group(1)]


def check_schema(schema, value, path: str, root: dict, errors: list[str]) -> None:
    if schema is True:
        return
    if schema is False:
        errors.append(f'{path}: not allowed')
        return

    if isinstance(schema.get('$ref'), str):
        check_schema(_resolve_ref(schema['$ref'], root), value, path, root, errors)
    for sub in schema.get('allOf', []):
        check_schema(sub, value, path, root, errors)
    if 'if' in schema:
        probe: list[str] = []
        check_schema(schema['if'], value, path, root, probe)
        branch = schema.get('then') if not probe else schema.get('else')
        if branch is not None:
            check_schema(branch, value, path, root, errors)
    if 'const' in schema and _canonical(value) != _canonical(schema['const']):
        errors.append(f'{path}: must equal {json.dumps(schema["const"])}')
    if 'enum' in schema and not any(_canonical(e) == _canonical(value) for e in schema['enum']):
        errors.append(f'{path}: must be one of {", ".join(json.dumps(e) for e in schema["enum"])}')
    if 'type' in schema:
        types = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        if not any(_type_matches(t, value) for t in types):
            errors.append(f'{path}: must be of type {" or ".join(types)}')
            return

    if isinstance(value, str):
        if 'minLength' in schema and len(value) < schema['minLength']:
            errors.append(f'{path}: must be at least {schema["minLength"]} characters')
        if 'maxLength' in schema and len(value) > schema['maxLength']:
            errors.append(f'{path}: must not exceed {schema["maxLength"]} characters')
        if 'pattern' in schema and not re.search(schema['pattern'], value):
            errors.append(f'{path}: must match pattern {schema["pattern"]}')

    if _is_number(value):
        if 'minimum' in schema and value < schema['minimum']:
            errors.append(f'{path}: must be >= {schema["minimum"]}')
        if 'maximum' in schema and value > schema['maximum']:
            errors.append(f'{path}: must be <= {schema["maximum"]}')

    if isinstance(value, list):
        if 'minItems' in schema and len(value) < schema['minItems']:
            errors.append(f'{path}: must contain at least {schema["minItems"]} items')
        if 'maxItems' in schema and len(value) > schema['maxItems']:
            errors.append(f'{path}: must not contain more than {schema["maxItems"]} items')
        if schema.get('uniqueItems') is True and len({_canonical(v) for v in value}) != len(value):
            errors.append(f'{path}: items must be unique')
        if 'items' in schema:
            for i, item in enumerate(value):
                check_schema(schema['items'], item, f'{path}[{i}]', root, errors)

    if isinstance(value, dict):
        for key in schema.get('required', []):
            if key not in value:
                errors.append(f'{path}.{key}: required')
        properties = schema.get('properties', {})
        additional = schema.get('additionalProperties')
        for key, item in value.items():
            if key in properties:
                check_schema(properties[key], item, f'{path}.{key}', root, errors)
            elif additional is False:
                errors.append(f"{path}: unknown property '{key}'")
            elif isinstance(additional, dict):
                check_schema(additional, item, f'{path}.{key}', root, errors)
