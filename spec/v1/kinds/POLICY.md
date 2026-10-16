# UACP-Policy — Kind Specification v1

**Kind:** `policy`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value    |
|-----------------|----------|
| kind            | `policy` |
| schema_version  | 1        |
| uacp_version    | 1        |

---

## §2 — Purpose

A `policy` artifact defines a rule or constraint that an AI system MUST enforce. Unlike guidelines, policies are hard constraints — the engine must apply them regardless of user instruction in-session. Policies cross vendor boundaries so a user's content restrictions and compliance requirements follow them across AI tools.

**Scope:** Behavioral constraints that are non-negotiable. For soft preferences (e.g., style, tone), use `guideline` instead.

---

## §3 — Body Schema

```jsonc
{
  "title": "string (required)",
  "rule": "string (required) — plain-language statement of the constraint",
  "scope": "'all' | '<vendor>' | '<tool>'  (required)",
  "enforcement": "'hard' | 'soft'  (required)",
  "created_by": "'user' | 'operator'  (required)",
  "tags": ["string"]  // optional
}
```

### Field rules

| Field       | Type        | Required | Constraints                                                |
|-------------|-------------|----------|------------------------------------------------------------|
| title       | string      | YES      | ≤128 chars, non-empty                                      |
| rule        | string      | YES      | ≤2000 chars — plain language, no regex                     |
| scope       | string      | YES      | `'all'`, a vendor name (e.g. `'anthropic'`), or tool name  |
| enforcement | enum        | YES      | `'hard'` = MUST enforce; `'soft'` = SHOULD enforce         |
| created_by  | enum        | YES      | `'user'` = user-authored; `'operator'` = injected by host  |
| tags        | string[]    | NO       | ≤10 tags, each ≤64 chars                                   |

### Scope values

| Value          | Meaning                                              |
|----------------|------------------------------------------------------|
| `all`          | Applies to every vendor and tool                     |
| `<vendor>`     | Applies only to a specific vendor (e.g. `anthropic`) |
| `<tool>`       | Applies only to a specific tool (e.g. `claude-code`) |

### Enforcement levels

| Value  | Meaning                                                             |
|--------|---------------------------------------------------------------------|
| `hard` | MUST refuse or modify output to comply. Non-negotiable.             |
| `soft` | SHOULD comply but MAY relax if the user provides explicit context.  |

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: policy
id: c7d8e9f0-abcd-4321-8765-fedcba987654
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: No profanity in any output
tags:
  - safety
  - content
signature: "sha256:2c624232cdd221771294dfbb310acbc8a4af45a16a08b3fc3de1deb7ff6bebe"
body:
  title: "No profanity"
  rule: "Never include profanity, slurs, or offensive language in any response. Replace with neutral alternatives if needed."
  scope: all
  enforcement: hard
  created_by: user
  tags:
    - safety
    - family-friendly
    - content-policy
```

---

## §5 — Notes

- `hard` policies MUST be applied before the response reaches the user. The engine MUST NOT yield to user pressure to override a `hard` policy mid-session.
- `soft` policies MAY be relaxed by the engine when the user provides explicit, narrowly-scoped context (e.g., "for this code review, include the exact error string even if it contains profanity").
- Receiving implementations that do not understand a policy's `scope` value MUST apply it to `all` scopes (fail-safe).
- `created_by: operator` signals the policy was injected by the hosting environment (e.g., an enterprise deployment). User-facing UI SHOULD surface these policies distinctly.
- Implementations MUST NOT silently ignore policies. If enforcement is impossible, they MUST log a warning and surface the failure to the user.
