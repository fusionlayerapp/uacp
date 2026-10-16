# UACP-Persona — Kind Specification v1

**Kind:** `persona`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value     |
|-----------------|-----------|
| kind            | `persona` |
| schema_version  | 1         |
| uacp_version    | 1         |

---

## §2 — Purpose

A `persona` artifact encodes an identity, voice, and behavioral configuration that an AI system adopts. Personas are user-defined or operator-defined AI identities — they set the name, system prompt, communication style, and capability scope for a session. Personas cross vendor boundaries so a user's preferred AI identity follows them across tools.

**Scope:** AI identity and behavioral framing. For individual style rules, use `guideline`. For hard constraints on the persona's behavior, use `policy`.

---

## §3 — Body Schema

```jsonc
{
  "name": "string (required)",
  "description": "string (required)",
  "system_prompt": "string (required)",
  "voice_style": "string (optional)",
  "avatar_url": "string (optional, URL)",
  "capabilities": ["string"] // optional — list of enabled capability tags
  "restrictions": ["string"] // optional — list of disabled capability tags
}
```

### Field rules

| Field         | Type     | Required | Constraints                                         |
|---------------|----------|----------|-----------------------------------------------------|
| name          | string   | YES      | ≤64 chars, non-empty                                |
| description   | string   | YES      | ≤512 chars, human-readable summary                  |
| system_prompt | string   | YES      | ≤8000 chars                                         |
| voice_style   | string   | NO       | ≤256 chars, prose description of tone and style     |
| avatar_url    | string   | NO       | HTTPS URL only, ≤2048 chars                         |
| capabilities  | string[] | NO       | ≤20 items, each ≤64 chars                           |
| restrictions  | string[] | NO       | ≤20 items, each ≤64 chars                           |

### Capability and restriction tags

Capability and restriction tags are free-form strings. Vendors SHOULD document their supported tags. Common values include: `code`, `math`, `medical`, `legal`, `adult-content`, `image-generation`, `web-search`.

When a vendor does not recognize a tag, it MUST ignore it and MUST NOT fail.

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: persona
id: 9a8b7c6d-1234-5678-abcd-ef0123456789
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Iris — Research assistant
tags:
  - research
  - academic
signature: "sha256:ef2d127de37b342b36f5b69c6f3e0b452f5e3c1f8baef0a1f4b8c9d7e6a5b4c3"
body:
  name: "Iris"
  description: "A rigorous research assistant. Citation-heavy, skeptical, and precise. Flags uncertainty explicitly."
  system_prompt: |
    You are Iris, a research assistant. You approach every question with the skepticism
    of a peer reviewer. You cite sources for every factual claim. When you are uncertain,
    you say so explicitly rather than speculating. You prefer academic and primary sources
    over secondary summaries. You never state a conclusion without describing the
    evidence that supports it.
  voice_style: "Precise and measured. Minimal filler. Uses hedging language ('the evidence suggests', 'one study found') to signal uncertainty."
  avatar_url: "https://cdn.example.com/avatars/iris.png"
  capabilities:
    - web-search
    - code
  restrictions:
    - adult-content
```

---

## §5 — Notes

- Receiving implementations MUST inject `system_prompt` at the beginning of the system context for the session. They MUST NOT silently ignore it.
- `avatar_url` is display-only. Implementations MUST NOT fetch the URL at capture time — only at display time.
- If `restrictions` conflicts with the platform's own capability restrictions, the stricter restriction wins.
- Implementations that do not support custom personas MUST surface a warning to the user rather than silently applying default behavior.
- `name` and `description` are user-facing. They SHOULD be rendered in the UI as the session identity.
- A session MUST apply at most one persona at a time. If multiple persona artifacts are in context, the implementation SHOULD use the one with the highest `priority` guideline or the latest `created_at`.
