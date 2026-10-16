# UACP Resource Limits

This document defines the resource profile for UACP documents. Limits marked **normative** are enforced by the JSON schema; limits marked **informative** are advisory for implementers.

## Normative Limits (schema-enforced)

| Field | Limit | Notes |
|-------|-------|-------|
| `messages` array | 10,000 items | Per conversation |
| `content` array (per message) | 256 items | |
| `extensions` array | 32 items | |
| `content_block.data` | 16,777,216 chars (≈12 MB binary) | base64-encoded |
| `attachment.data` | 67,108,864 chars (≈48 MB binary) | base64-encoded |
| `metadata` (root or message) | 64 properties | Top-level keys only |

### base64 Encoding Note

`contentEncoding: base64` in JSON Schema 2020-12 is an annotation — validators do not enforce valid base64 character sets by default. The `maxLength` bounds apply to the raw string length (encoded), not the decoded binary size. Conversion factor: 4 base64 chars ≈ 3 binary bytes.

Conformant importers MUST reject strings in `data` fields that are not valid base64.

## Informative Limits

| Constraint | Recommendation | Rationale |
|------------|----------------|-----------|
| Total document size | Reject > 128 MB | Protects parsers from DoS |
| Metadata nesting depth | Warn / reject > 8 levels | JSON Schema cannot enforce nesting depth; check at runtime |
| Decoded total data bytes | Track toward 96 MB aggregate | Conservative sum across all `data` fields |

Implementations MAY enforce stricter limits. Implementations MAY reject documents exceeding any informative limit with an appropriate error.

## Rationale

These limits were chosen to:
- Bound memory use during parse and validation (no unbounded string or array growth)
- Allow large but finite conversations (10,000 messages covers multi-hour sessions)
- Allow binary attachments up to 48 MB (covers most documents and images; not designed for raw video)
- Keep the schema practical for third-party importers with limited memory

## Changelog

- v0.6.0 — Initial resource-limits profile added (PR #25)
