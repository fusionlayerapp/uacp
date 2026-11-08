# Python Reference Implementation — Conformance Report

| Field | Value |
|-------|-------|
| Implementation | `uacp` (PyPI) |
| Version | 1.0.0 |
| UACP version | 0.6.0 |
| Levels claimed | L1 |
| Date verified | 2026-05-17 |

## Test command

```bash
cd reference-impls/python
python -m pytest tests/
```

## Capabilities

- `parse` / `serialize` — round-trip for L1 documents
- `validate` — schema + structural validation for L1 rules
- No sign/verify functions (Ed25519 signing is not part of core L1)

## Results

All L1 test vectors pass validation and round-trip. L2/L3 vectors are not exercised.

## Notes

Types include an optional `signature` field (`types.py`) for future signing extension support.
The package exports `validate`, `parse`, `serialize`, and all dataclasses from `uacp/__init__.py`.
