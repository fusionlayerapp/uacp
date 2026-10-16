# UACP-Guideline — Kind Specification v1

**Kind:** `guideline`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value       |
|-----------------|-------------|
| kind            | `guideline` |
| schema_version  | 1           |
| uacp_version    | 1           |

---

## §2 — Purpose

A `guideline` artifact encodes a soft instruction or style preference. Guidelines shape how an AI system responds — tone, format, verbosity, domain focus — without imposing hard constraints. Unlike policies, guidelines can be overridden by explicit user instruction in-session.

**Scope:** Behavioral preferences and style rules. For non-negotiable constraints, use `policy` instead.

---

## §3 — Body Schema

```jsonc
{
  "title": "string (required)",
  "instruction": "string (required) — plain-language directive",
  "priority": "integer 1–10 (optional, default 5)"
}
```

### Field rules

| Field       | Type    | Required | Constraints                            |
|-------------|---------|----------|----------------------------------------|
| title       | string  | YES      | ≤128 chars, non-empty                  |
| instruction | string  | YES      | ≤2000 chars, plain language            |
| priority    | integer | NO       | 1 (lowest) to 10 (highest); default 5 |

### Priority semantics

| Range  | Meaning                                                       |
|--------|---------------------------------------------------------------|
| 8–10   | High — apply unless user explicitly overrides                 |
| 4–7    | Normal — apply by default                                     |
| 1–3    | Low — apply as a suggestion, easily overridden by other rules |

When two guidelines conflict, the one with higher `priority` wins. If equal, later `created_at` wins.

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: guideline
id: f1e2d3c4-5678-4abc-9def-012345678901
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Keep responses concise and direct
tags:
  - tone
  - format
signature: "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"
body:
  title: "Concise responses"
  instruction: "Keep all responses as short as possible without omitting critical information. Use bullet points and headers for lists. Omit filler phrases like 'Great question!' or 'Certainly!'."
  priority: 7
```

---

## §5 — Notes

- Guidelines are advisory. An AI system that cannot apply a guideline (e.g., the format is unsupported) SHOULD log a warning and continue rather than fail.
- Unlike policies, the user MAY override a guideline in-session by explicit instruction (e.g., "write a long detailed answer for this one").
- Implementations SHOULD apply guidelines before generating the response (prompt injection or pre-processing), not after.
- `priority` is an ordering hint. Implementations MAY apply all guidelines without ranking if that better fits their architecture.
- Multiple guidelines with overlapping concerns are valid. Implementations SHOULD apply all of them and resolve conflicts by priority.
