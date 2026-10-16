# UACP-Pack — Kind Specification v1

**Kind:** `pack`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value  |
|-----------------|--------|
| kind            | `pack` |
| schema_version  | 1      |
| uacp_version    | 1      |

---

## §2 — Purpose

A `pack` artifact is a named, curated collection of related artifacts bundled together for a specific use case or persona. Loading a pack loads all its constituent artifacts in one operation. Packs are the distribution unit for pre-built contexts — they are analogous to "profiles" or "starter kits."

**Scope:** Composition and distribution. `pack` references other artifacts by ID or slug; it does not embed their full content. For sequenced workflows, use `playbook`.

---

## §3 — Body Schema

```jsonc
{
  "title": "string (required)",
  "description": "string (required)",
  "artifact_refs": [
    {
      "kind": "string",
      "id": "string (optional) — UACP artifact id",
      "slug": "string (optional) — human-readable alias"
    }
  ],
  "tags": ["string"]  // optional
}
```

### Field rules

| Field         | Type     | Required | Constraints                                            |
|---------------|----------|----------|--------------------------------------------------------|
| title         | string   | YES      | ≤128 chars, non-empty                                  |
| description   | string   | YES      | ≤512 chars                                             |
| artifact_refs | object[] | YES      | 1–50 refs; each ref MUST have at least `id` OR `slug`  |
| tags          | string[] | NO       | ≤10 items, each ≤64 chars                              |

#### artifact_refs item

| Field  | Type   | Required | Constraints                                      |
|--------|--------|----------|--------------------------------------------------|
| kind   | string | YES      | A valid UACP kind name                           |
| id     | string | NO*      | UUID matching the referenced artifact's `id`     |
| slug   | string | NO*      | Human-readable slug used by the engine's registry |

\* At least one of `id` or `slug` MUST be present.

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: pack
id: 6f7a8b9c-0def-4012-3456-789abcdef012
schema_version: 1
version: 1.0.0
author: "@inkfold"
created_at: "2026-05-16T09:00:00Z"
description: Solo developer daily driver
tags:
  - developer
  - productivity
signature: "sha256:8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"
body:
  title: "Solo Developer"
  description: "Memory, rules, and persona for an independent developer's daily workflow. Includes a senior engineer persona, no-secrets rule, and cite-sources guideline."
  artifact_refs:
    - kind: persona
      slug: persona-senior-engineer
    - kind: policy
      slug: policy-no-hardcoded-secrets
    - kind: guideline
      slug: guideline-cite-sources
    - kind: memory
      slug: memory-role-developer
  tags:
    - developer
    - solo
    - engineering
```

---

## §5 — Notes

- Packs do NOT embed artifact content — they reference artifacts. The engine resolves refs at load time.
- Plain-language "rules" should be represented as `policy` artifacts when they enforce boundaries or redact content.
- If an `id` is provided and the artifact does not exist in the engine, the engine MUST log a warning and skip the missing ref (not fail the whole pack load).
- If a `slug` is provided, the engine uses its registry to resolve the slug to an artifact. If the slug is unknown, the engine MUST log a warning and skip it.
- Packs are immutable once signed. To update a pack (e.g., add a new artifact ref), create a new version (`version: 1.1.0`).
- Circular pack references (pack A references pack B which references pack A) MUST be detected and rejected by the engine.
