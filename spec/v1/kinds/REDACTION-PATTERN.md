# UACP-RedactionPattern — Kind Specification v1

**Kind:** `redaction-pattern`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value               |
|-----------------|---------------------|
| kind            | `redaction-pattern` |
| schema_version  | 1                   |
| uacp_version    | 1                   |

---

## §2 — Purpose

A `redaction-pattern` artifact defines a pattern used to detect and redact sensitive content in AI input and output. Redaction patterns cross vendor boundaries so a user's data-protection rules apply regardless of which AI tool processes the text.

**Scope:** Pattern-based content filtering and redaction. For behavioral constraints, use `policy`. For topic bans, use `policy` with a rule.

---

## §3 — Body Schema

```jsonc
{
  "name": "string (required)",
  "pattern": "string (required) — the regex or glob to match",
  "replacement": "string (optional, default '[REDACTED]')",
  "pattern_type": "'regex' | 'glob'  (required)",
  "scope": "'outbound' | 'inbound' | 'both'  (required)",
  "is_builtin": "boolean (required)"
}
```

### Field rules

| Field        | Type    | Required | Constraints                                               |
|--------------|---------|----------|-----------------------------------------------------------|
| name         | string  | YES      | ≤128 chars, non-empty                                     |
| pattern      | string  | YES      | ≤4096 chars; MUST be a valid regex or glob per `pattern_type` |
| replacement  | string  | NO       | ≤256 chars; default `[REDACTED]`                          |
| pattern_type | enum    | YES      | `'regex'` or `'glob'`                                     |
| scope        | enum    | YES      | See scope values below                                    |
| is_builtin   | boolean | YES      | `true` = shipped with the engine; `false` = user-defined  |

### Scope values

| Value       | Meaning                                                          |
|-------------|------------------------------------------------------------------|
| `outbound`  | Apply to text sent TO the AI model (user prompt, injected context) |
| `inbound`   | Apply to text received FROM the AI model (response)              |
| `both`      | Apply in both directions                                         |

### Pattern type rules

- `regex`: MUST be a valid ECMA-262 (JavaScript) regular expression without delimiters. The engine MUST compile with global (`g`) and Unicode (`u`) flags.
- `glob`: Simple glob pattern. Implementations SHOULD support `*` (any sequence except newline) and `?` (single character). The engine applies globbing case-insensitively.

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: redaction-pattern
id: 2b3c4d5e-6789-4abc-def0-123456789abc
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Redact US Social Security Numbers
tags:
  - pii
  - privacy
  - compliance
signature: "sha256:9c56cc51b374c3ba189210d5b6d4bf57790d351ef8d0827910fa9b7a83d5e4a"
body:
  name: "US Social Security Number"
  pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b"
  replacement: "[SSN REDACTED]"
  pattern_type: regex
  scope: both
  is_builtin: false
```

---

## §5 — Recommended Built-in Patterns

The following patterns are RECOMMENDED for engine implementations to ship as defaults. They SHOULD be represented as `redaction-pattern` artifacts with `is_builtin: true`.

| Name               | Pattern (regex)                                                        | Scope | Replacement           |
|--------------------|------------------------------------------------------------------------|-------|-----------------------|
| Email address      | `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`                | both  | `[EMAIL REDACTED]`    |
| US phone number    | `\b(\+1[\-.\s]?)?\(?\d{3}\)?[\-.\s]?\d{3}[\-.\s]?\d{4}\b`           | both  | `[PHONE REDACTED]`    |
| US SSN             | `\b\d{3}-\d{2}-\d{4}\b`                                               | both  | `[SSN REDACTED]`      |
| Credit card        | `\b(?:\d{4}[\-\s]?){3}\d{4}\b`                                        | both  | `[CARD REDACTED]`     |
| IP address (IPv4)  | `\b(?:\d{1,3}\.){3}\d{1,3}\b`                                         | both  | `[IP REDACTED]`       |

---

## §6 — Notes

- Implementations MUST apply redaction patterns BEFORE sending content to the model and BEFORE returning content to the user, as determined by `scope`.
- If a pattern fails to compile (malformed regex), the implementation MUST log an error, skip that pattern, and MUST NOT crash.
- `replacement` SHOULD be chosen to be unambiguous. Avoid empty strings which can create confusing concatenations.
- `is_builtin` patterns SHOULD be shown to users in a distinct list from user-defined patterns to aid transparency.
- Implementations SHOULD apply patterns in order of `is_builtin: true` first, then user-defined patterns.
