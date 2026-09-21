"""Minimal JSON Schema (2020-12) evaluator covering the keywords used by the
kind body schemas in schema/v1/kinds, with the uri and date-time formats
checked as ajv-formats does in validate.js. Annotation-only keywords (title,
description, default) are ignored."""
from __future__ import annotations

import json
import math
import re


# Ported from ajv-formats (full mode), which validate.js uses.
_URI = re.compile(r"^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$", re.IGNORECASE | re.ASCII)
_DATE = re.compile(r'^(\d\d\d\d)-(\d\d)-(\d\d)$', re.ASCII)
_TIME = re.compile(r'^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$', re.IGNORECASE | re.ASCII)
_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def _is_uri(s: str) -> bool:
    return bool(re.search(r'/|:', s)) and bool(_URI.match(s))


def _is_date(s: str) -> bool:
    m = _DATE.match(s)
    if not m:
        return False
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    return 1 <= month <= 12 and 1 <= day <= (29 if month == 2 and leap else _DAYS[month])


def _is_time(s: str) -> bool:
    m = _TIME.match(s)
    if not m or not m.group(4):
        return False
    hr, mn, sec = int(m.group(1)), int(m.group(2)), float(m.group(3))
    sign = -1 if m.group(5) == '-' else 1
    tz_h, tz_m = int(m.group(6) or 0), int(m.group(7) or 0)
    if tz_h > 23 or tz_m > 59:
        return False
    if hr <= 23 and mn <= 59 and sec < 60:
        return True
    utc_min = mn - tz_m * sign
    utc_hr = hr - tz_h * sign - (1 if utc_min < 0 else 0)
    return utc_hr in (23, -1) and utc_min in (59, -1) and sec < 61


def _is_date_time(s: str) -> bool:
    parts = re.split(r'[tT\s]', s)
    return len(parts) == 2 and _is_date(parts[0]) and _is_time(parts[1])


_FORMATS = {'uri': _is_uri, 'date-time': _is_date_time}


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
        if 'pattern' in schema and not re.search(schema['pattern'], value, re.ASCII):
            errors.append(f'{path}: must match pattern {schema["pattern"]}')
        check = _FORMATS.get(schema.get('format'))
        if check and not check(value):
            errors.append(f'{path}: must be a valid {schema["format"]}')

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
