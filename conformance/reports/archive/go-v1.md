# Go Reference Implementation — Conformance Report

| Field | Value |
|-------|-------|
| Implementation | `github.com/hn2/uacp/reference-impls/go` |
| Version | 1.0.0 |
| UACP version | 0.6.0 |
| Levels claimed | L1 |
| Date verified | 2026-05-17 |

## Test command

```bash
cd reference-impls/go
go test ./...
```

## Capabilities

- `Parse` / `Serialize` — round-trip for L1 documents
- `Validate` — structural validation for required fields and enums
- No sign/verify functions (Ed25519 signing is not part of core L1)

## Results

All L1 test vectors (01-minimal-chat, 02-multi-message, 03-tool-use) pass
validation and round-trip. L2/L3 vectors are not exercised.

## Notes

Types include a `Signature` field (`types.go`) for future signing extension support.
The package exposes `validate.go`, `serialize.go`, and `types.go`.
