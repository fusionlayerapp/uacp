# TypeScript Reference Implementation — Conformance Report

| Field | Value |
|-------|-------|
| Implementation | `@fusionlayer/uacp` |
| Version | 0.6.0 |
| UACP version | 0.6.0 |
| Levels claimed | L1, L2 |
| Date verified | 2026-05-17 |

## Test command

```bash
cd reference-impls/typescript
npm install
npm test
```

## Capabilities

- `parse` / `serialize` — full round-trip for L1 and L2 documents
- `validate` — schema + structural validation covering all L1 and L2 rules
- No sign/verify functions (Ed25519 signing is not part of core L1/L2)

## Results

All L1 and L2 test vectors pass schema validation and round-trip.
L3 vectors (branches, artifacts, thinking blocks, citations) pass schema validation
but the implementation does not declare L3 due to missing citation-span unicode counting.

## Notes

Package name is `@fusionlayer/uacp` in the npm registry (not `@uacp/reference-impl`).
The package exports `validate`, `parse`, and `serialize` from `dist/index.js`.
