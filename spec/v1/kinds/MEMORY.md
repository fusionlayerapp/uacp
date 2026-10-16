# UACP-Memory — Kind Specification v1

**Kind:** `memory`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value    |
|-----------------|----------|
| kind            | `memory` |
| schema_version  | 1        |
| uacp_version    | 1        |

---

## §2 — Purpose

A `memory` artifact encodes a single persistent fact, preference, or piece of recalled context about a user. Memories cross vendor boundaries so an AI system that learns something about the user can share that knowledge with other AI systems — without re-learning it on every session.

**Scope:** `memory` is for facts that need to persist across sessions and vendors. It is NOT for ephemeral session state, chat history, or model-internal context.

---

## §3 — Body Schema

```jsonc
{
  "content": "string (required, ≤2000 chars)",
  "category": "personal | professional | preference | health | relationship | financial | <custom>  (optional)",
  "confidence": "number 0.0–1.0 (optional, default 1.0)",
  "source": "string — tool or session that produced this memory (optional)",
  "expires_at": "ISO 8601 datetime string (optional, null = never expires)",
  "lifecycle": "revision action, status, and predecessor (optional)",
  "supersedes": "memory revisions replaced by this active revision (optional)",
  "derived_from": "memory revisions used as evidence (optional)",
  "provenance": "one or more source evidence references (optional)",
  "consent": "not_required | explicit | withdrawn (optional)",
  "topics": "core or namespaced narrow topic labels (optional)",
  "metadata": "bounded typed portable metadata entries (optional)",
  "profile_link": "profile schema/field linkage (optional)"
}
```

### Field rules

| Field       | Type             | Required | Constraints                        |
|-------------|------------------|----------|------------------------------------|
| content     | string           | YES      | ≤2000 characters, non-empty        |
| category    | string enum      | NO       | See category values below          |
| confidence  | number           | NO       | 0.0 ≤ value ≤ 1.0; default 1.0    |
| source      | string           | NO       | ≤256 characters                    |
| expires_at  | ISO 8601 string  | NO       | MUST be a future datetime at creation time |

## §4 — Lifecycle and provenance

Memory envelopes are immutable. A revision creates a new signed envelope while
preserving the stable memory identifier in the envelope. Implementations MUST
NOT rewrite or physically delete an earlier revision in order to update,
supersede, expire, tombstone, or roll back a memory.

`lifecycle` is optional for backwards compatibility. When present, it has an
`action`, `status`, positive integer `revision`, and optional
`previous_revision` reference (`memory_id` and positive integer `revision`).
The following rules are normative:

- A `create` action MUST use revision `1` and MUST NOT name a predecessor.
- Any revision greater than `1` MUST name `previous_revision`.
- The `memory_id` in `previous_revision` MUST equal the current envelope `id`.
- The direct predecessor revision MUST be exactly one less than the current
  revision; a revision sequence MUST NOT skip a number.
- `supersede` MUST name one or more prior revisions in `supersedes`.
- `tombstone` MUST use status `tombstoned`; only a `tombstone` action may use
  that status.
- `expire` MUST use status `expired`; only an `expire` action may use that
  status. Expiry makes a memory ineligible for default retrieval; it does not
  erase the revision.
- `rollback` creates a new active revision. It MUST name both its direct
  predecessor and one or more `derived_from` references. It MUST NOT rewrite
  or delete intervening history.
- A `create`, `confirm`, `update`, `supersede`, or `rollback` action MUST use
  status `active`: the revision performing a supersession is itself the new
  active fact, and the revision it replaces is identified by that new
  revision's `supersedes` list rather than by rewriting the old revision's own
  `status`. Status `superseded` is derived, read-side state that a consumer or
  index MAY attach to a revision once it observes a later revision naming it
  in `supersedes`; a producer MUST NOT author a new envelope with status
  `superseded`, since envelopes are immutable and a revision's own `status` is
  fixed at the time that revision is created.

Scope promotion and withdrawal use the canonical `uacp-promotion-event` and
`uacp-withdraw-event` extension schemas, respectively. A promotion event MUST
name the memory envelope `artifact_id`, retain the source-scope copy, and
re-encrypt the promoted copy for the target scope. A withdrawal event MUST name
the memory envelope `artifact_id` and stop replication without deleting either
the memory revision or its lifecycle evidence. Implementations MUST NOT encode
scope promotion or withdrawal as a memory tombstone.

`provenance` is an optional non-empty list of bounded source evidence. Each
entry identifies a `source_type` (`vendor`, `tool`, `session`, `event`, or
`other`) and opaque `identifier`; it MAY carry a SHA-256 content hash and
observation timestamp. Implementations MUST preserve every entry on
export/import and MUST NOT treat a vendor as the canonical authority solely
because it appears in provenance.

Per §8, health and financial memories always require `consent: explicit`,
whether or not `lifecycle` is present. `consent: withdrawn` records that
further use must be stopped by a receiving implementation; it does not delete
historical evidence.

Validators MUST return the stable `MEMORY_LIFECYCLE_*` error code defined by
the conformance vectors for a violated cross-field lifecycle rule.

## §5 — Topics and typed metadata

`category` remains a single broad classification. `topics` are optional,
more-specific labels; `tags` remain free-form envelope labels. Receiving
implementations MUST NOT reinterpret a topic as a category or executable
instruction.

The core topic registry is: `accessibility`, `career`, `education`, `family`,
`finance`, `health`, `identity`, `location`, `preference`, `project`, and
`relationship`. A custom topic MUST use `<vendor>/<name>` lower-case syntax.
Implementations MUST preserve unknown namespaced topics unchanged and MUST
reject unknown unnamespaced topics.

`metadata` is an optional list of at most 32 `{ key, type, value }` entries.
Values are limited to declared `string`, `number`, `boolean`, `date`, or
`null` primitives: nested objects and arrays are not portable typed metadata.
The core keys are `importance`, `locale`, and `effective_from`; custom keys use
the same `<vendor>/<name>` syntax. Unknown namespaced keys MUST round-trip as
inert data. An implementation MUST NOT execute, evaluate, or treat metadata as
instructions. `topics` has a maximum of 16 entries; each key/topic is limited
to 64 characters and each string value to 1024 characters.

## §6 — Structured-profile linkage

`profile_link` is optional metadata on a memory; it does not create a second
profile truth representation. It contains a `schema_id`, a positive
`schema_version`, a bounded `field` identifier (a simple field identifier or
JSON Pointer), and optional `conflict` state.

The core schemas are `user`, `project`, and `team`; custom schemas MUST use
`<vendor>/<name>` syntax. Unknown namespaced schemas/fields MUST round-trip as
inert data, and consumers that ignore `profile_link` MUST continue to read the
memory body normally. Missing profile fields remain absent: implementations
MUST NOT infer defaults from the link.

At most one active memory may claim a subject/scope/schema-version/field tuple
unless every competing link explicitly uses `conflict: unresolved`. Superseded,
tombstoned, and expired revisions are not current claims. The linked memory's
lifecycle, expiry, provenance, and consent remain authoritative.

### Category values

| Value          | Meaning                                               |
|----------------|-------------------------------------------------------|
| `personal`     | Personal details, name, family, location              |
| `professional` | Job, company, role, industry                          |
| `preference`   | Behavioral preferences, style, format                 |
| `health`       | Health conditions, medication, dietary needs          |
| `relationship` | Social connections, contacts                          |
| `financial`    | Budget constraints, payment methods, financial goals  |
| `<custom>`     | Vendor-prefixed custom category, e.g. `acme/project`  |

Custom categories MUST use the `<vendor>/<name>` format to avoid collisions.

---

## §7 — Complete Example

```yaml
uacp_version: 1
kind: memory
id: a1b2c3d4-1234-5678-abcd-ef0123456789
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: User's primary programming stack
tags:
  - professional
  - technology
signature: "sha256:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
body:
  content: "I am a senior TypeScript developer. My primary stack is Node.js, React, and PostgreSQL."
  category: professional
  confidence: 1.0
  source: "claude-code/session-2026-05-16"
  expires_at: null
  lifecycle:
    action: create
    status: active
    revision: 1
  provenance:
    - source_type: session
      identifier: claude-code/session-2026-05-16
  topics:
    - career
    - acme/typescript
  metadata:
    - key: importance
      type: number
      value: 3
  profile_link:
    schema_id: user
    schema_version: 1
    field: primary_stack
```

---

## §8 — Notes

- Implementations MUST NOT store health or financial memories without explicit user consent.
- When `confidence` < 0.7, receiving implementations SHOULD treat the memory as low-confidence and avoid surfacing it without verification.
- Content SHOULD be written in first person from the user's perspective (e.g., "I am...", "My preference is...").
- Empty `content` is invalid. An implementation receiving an empty-content memory MUST reject it.
- `expires_at` applies to the artifact's usefulness; the artifact envelope itself is immutable after signing.
