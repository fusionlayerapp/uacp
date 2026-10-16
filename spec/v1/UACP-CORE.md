# UACP Core Specification v0.6.0

**Universal AI Context Protocol (UACP) — Core Specification**

> **Status:** Draft — v0.2 narrows UACP-Core to context payloads only per
> [ADR 0038](https://github.com/hn2/fusionlayer/blob/main/docs/decisions/0038-uacp-context-only-narrowing.md).
> Operator/action shapes moved to [AAP](https://github.com/hn2/aap).
> Capture provenance moved to [Capture-Manifest](https://github.com/hn2/capture-manifest).
> Trace moved to UACP-Trace (separate draft, tracked in [#79](https://github.com/hn2/uacp/issues/79)).

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals.

Sections labelled **(informative)** are explanatory and do not contain normative
requirements. All other sections are normative.

---

## §1 — Scope and Definition of "Context"

In UACP (Universal AI Context Protocol), **context** means data that needs to move
between AI systems to preserve a user's experience: their memory, their preferences,
their policies, their citations, their workflows, and their personas.

UACP does NOT describe:
- How any one AI system internally executes (routing, caches, prompt templates, model
  versions, or operator pipelines).
- Operator or tool-call descriptions crossing vendor boundaries (see [AAP](https://github.com/hn2/aap)).
- Capture provenance, consent basis, or applied redactions (see [Capture-Manifest](https://github.com/hn2/capture-manifest)).
- Execution traces or audit logs of engine actions (see UACP-Trace, tracked in [#79](https://github.com/hn2/uacp/issues/79)).

UACP describes what *crosses the wire between vendors*; engines describe what happens
*inside the wire*.

### Anti-patterns

- Do NOT define context as "chat history only" — that is too narrow. UACP context
  includes memory, policy, personas, redaction rules, source citations, themes,
  packs, and playbooks.
- Do NOT define context as "all AI state" — that is too broad. Internal engine state
  (routing decisions, prompt templates, model selection, operator pipelines), action
  descriptions, capture provenance, and execution traces are explicitly out of scope.

---

## §2 — Layer Model

UACP is one layer in a three-layer model.

| Layer  | Name     | Defined by           | Description                                                      |
|--------|----------|----------------------|------------------------------------------------------------------|
| **L1** | UACP     | This specification   | Envelope format, kind registry, signing, versioning, compliance. |
| **L2** | Artifact | Per-kind sub-specs   | The `body` of each artifact kind (memory, policy, persona, …).   |
| **L3** | Operator | Engine implementation | How artifacts are stored, fetched, injected, and transformed inside an engine. |

**Critical note:** UACP does not define operators. UACP defines what flows *into* and
*out of* an operator. An operator's internal behavior — its pipeline, latency targets,
caching strategy, prompt construction — is entirely outside the scope of this
specification.

### Sibling protocols (informative)

| Protocol           | Repo                                          | Owns                                                    |
|--------------------|-----------------------------------------------|---------------------------------------------------------|
| **AAP**            | [hn2/aap](https://github.com/hn2/aap)         | Operator/tool/action descriptions crossing vendor boundaries |
| **Capture-Manifest** | [hn2/capture-manifest](https://github.com/hn2/capture-manifest) | Capture provenance: source, consent basis, applied redactions, hash chain |
| **UACP-Trace**     | [hn2/uacp#79](https://github.com/hn2/uacp/issues/79) | Audit record of engine actions (pending: OTel profile investigation) |

---

## §3 — Kind Registry

UACP defines a blessed set of core artifact kinds. Each kind has a dedicated sub-spec
that normatively defines its `body` field.

### Core kinds

| Kind                | Sub-spec link                        | Status | Description                                          |
|---------------------|--------------------------------------|--------|------------------------------------------------------|
| `memory`            | `spec/v1/kinds/MEMORY.md`            | Draft  | Persistent facts, preferences, and recalled context  |
| `policy`            | `spec/v1/kinds/POLICY.md`            | Draft  | Rules and constraints the engine must enforce        |
| `guideline`         | `spec/v1/kinds/GUIDELINE.md`         | Draft  | Soft instructions and style preferences              |
| `persona`           | `spec/v1/kinds/PERSONA.md`           | Draft  | Identity, voice, and behavioral configuration        |
| `redaction-pattern` | `spec/v1/kinds/REDACTION-PATTERN.md` | Draft  | Patterns used to redact sensitive content            |
| `source`            | `spec/v1/kinds/SOURCE.md`            | Draft  | Citation and reference material                      |
| `theme`             | `spec/v1/kinds/THEME.md`             | Draft  | Visual or tonal configuration                        |
| `pack`              | `spec/v1/kinds/PACK.md`              | Draft  | A named collection of related artifacts              |
| `playbook`          | `spec/v1/kinds/PLAYBOOK.md`          | Draft  | A sequenced workflow of actions or instructions      |

**Note:** `trace` was removed from UACP-Core in v0.2 and is being specified as a
standalone UACP-Trace protocol. Implementations that encounter `kind: "trace"` MUST
treat it as an unknown kind and pass it through without modification.

### Extension kinds

Vendors and operators MAY define custom kinds that are not in the core registry. The
following rules apply:

- Custom kinds MUST be namespaced using the form `'<vendor>/<name>'`
  (e.g., `'acme/chain-of-thought'`).
- Core kinds are unnamespaced (e.g., `memory`, `policy`).
- Implementations that encounter an unknown kind MUST pass through the artifact without
  modification. Implementations MUST NOT reject or drop artifacts solely because their
  kind is unrecognized.

---

## §4 — Envelope Format (informative)

This section is informative. The normative schema is `spec/v1/envelope.schema.json`.

Every UACP artifact is wrapped in a common envelope. The envelope provides routing
metadata, provenance, and integrity information that is independent of artifact content.
Sub-specs define the `body` field only; they MUST NOT redefine or override any
top-level envelope field.

### Minimum envelope (YAML)

```yaml
uacp_version: 1
kind: <one of §3, or a namespaced custom kind>
id: <stable UUID or DID>
schema_version: 1
version: 1.0.0
subject: <opaque DID-style owner identifier>
author: <handle or DID>
created_at: <iso8601 UTC>
signature: <sha256:hex or ed25519:base64>
body: <kind-specific, defined by the sub-spec>
```

### Envelope fields

| Field           | Required | Type            | Description                                                         |
|-----------------|----------|-----------------|---------------------------------------------------------------------|
| `uacp_version`  | REQUIRED | integer         | UACP envelope version. MUST be 1.                                   |
| `kind`          | REQUIRED | string          | Artifact kind (see §3).                                             |
| `id`            | REQUIRED | string          | Stable identifier. MUST be preserved across revisions. UUID v4 recommended. |
| `schema_version`| REQUIRED | integer ≥ 1     | Version of the kind-specific body schema.                           |
| `version`       | REQUIRED | semver string   | Instance version. MUST increment at least patch on every revision.  |
| `subject`       | REQUIRED | string          | Opaque DID-style owner identifier (see §9).                         |
| `author`        | REQUIRED | string          | Who produced this artifact. MAY be a handle or DID.                 |
| `created_at`    | REQUIRED | ISO 8601 UTC    | Timestamp when the artifact was first created.                      |
| `signature`     | REQUIRED | string          | Integrity signature (see §5). Removed before hashing.               |
| `body`          | REQUIRED | object          | Kind-specific payload. Structure defined by the kind's sub-spec.    |
| `audience`      | optional | array of string | Principals authorized to access (see §9). Empty = subject-only.     |
| `scope`         | optional | string          | Scope label from the registry in §Annex A.                          |
| `description`   | optional | string          | Human-readable summary.                                             |
| `tags`          | optional | array of string | Free-form labels.                                                   |
| `license`       | optional | string          | SPDX identifier or `proprietary`.                                   |

### Authoring rules

- `id` MUST be stable across updates to the same artifact. Use a UUID v4 on first
  creation and preserve it in all subsequent revisions.
- `created_at` MUST be an ISO 8601 timestamp in UTC.
- `version` MUST follow semantic versioning (semver). Revisions to the same artifact
  MUST increment at least the patch component.
- `subject` MUST be set. If the owning principal is unknown, implementations MUST use a
  well-known placeholder such as `urn:uacp:subject:anonymous`.

---

## §5 — Signing and Trust

### V1: Hash-only signing

In V1, signing uses a SHA-256 hash of the artifact envelope.

**Computing the signature:**

1. Serialize the full envelope to canonical JSON (keys sorted lexicographically,
   no extra whitespace).
2. Remove the `signature` field from the serialized object.
3. Compute `sha256(<canonical-JSON-bytes>)` and encode as lowercase hexadecimal.
4. Set `signature: sha256:<hex>`.

**Verification:**

1. Parse the envelope.
2. Extract the `signature` value.
3. Remove the `signature` field from the parsed object.
4. Serialize to canonical JSON (same rules as above).
5. Compute SHA-256 and compare to the extracted hex digest.

### V2 (deferred): ed25519 signatures

V2 will support ed25519 signatures with author public keys distributed via
signed registries. V2 signature values will use the form `ed25519:<base64>`.
V2 is deferred pending the key-registry sub-spec.

### Trust model

- Implementations MUST validate SHA-256 hashes when a `signature` field starting
  with `sha256:` is present.
- Implementations MUST reject artifacts whose computed hash does not match the
  declared hash.
- Implementations SHOULD warn the operator when an artifact has no `signature` field.
- Implementations MAY allow unsigned artifacts in development mode.

---

## §6 — Versioning Policy

UACP uses three independent version fields.

| Field            | Scope              | When incremented                                                    | Stability target            |
|------------------|--------------------|---------------------------------------------------------------------|-----------------------------|
| `uacp_version`   | Envelope semantics | Only when the envelope format has a breaking change                 | ≥ 12 months between breaks  |
| `schema_version` | Sub-spec payload   | When a kind's `body` schema has a non-backwards-compatible change   | Defined per sub-spec        |
| `version`        | Artifact instance  | Semver; increment at least patch on every revision                  | Defined per artifact        |

**Compatibility rules:**

- Implementations that encounter `uacp_version` greater than their highest supported
  version MUST refuse to process the artifact and MUST surface an error to the caller.
  They MUST NOT silently discard or partially process such artifacts.
- Implementations SHOULD document which `uacp_version` values they support.
- Adding a new optional envelope field is NOT a breaking change and does NOT require
  incrementing `uacp_version`.
- Sub-specs MAY add optional `body` fields in a minor `schema_version` increment.
  Removing or renaming fields MUST increment `schema_version`.

---

## §7 — Compliance Levels (informative)

This section is informative. Compliance claims are voluntary and self-reported.

### Compliance string format

Compliance is expressed as a `+`-separated list of compliance tokens:

```
UACP-Core@1 + UACP-Memory@1 + UACP-Persona@1
```

### Capability axes

Each compliance token MAY be qualified by one or more capability axes in brackets:

| Axis      | Meaning                                                        |
|-----------|----------------------------------------------------------------|
| `Read`    | Can parse and consume artifacts of this kind                   |
| `Write`   | Can produce valid artifacts of this kind                       |
| `Operate` | Can transform or inject artifacts of this kind in a pipeline   |

**Example:** `UACP-Memory@1 [Read, Write]` means the implementation can parse and
produce `memory` artifacts at schema version 1.

### Baseline requirement

An implementation claiming `UACP-Core@1` compliance MUST:

- Correctly parse envelopes with all required fields including `subject`.
- Validate SHA-256 signatures when present.
- Pass through artifacts of unknown kinds without modification.
- Refuse artifacts with `uacp_version` greater than 1.

---

## §8 — Out of Scope (informative)

This section is informative and enumerates topics that are explicitly not addressed by
this specification. Implementors are free to define their own approaches to these topics.

- **Capture provenance** — what was captured from where, by whom, under what consent,
  and with what redactions applied. See [Capture-Manifest](https://github.com/hn2/capture-manifest).
- **Operator/tool/action descriptions** — callable shapes, input/output schemas, and
  side-effect classifications for agent actions. See [AAP](https://github.com/hn2/aap).
- **Execution traces and audit logs** — records of engine actions (which models were
  invoked, latencies, citations surfaced, etc.). See UACP-Trace ([#79](https://github.com/hn2/uacp/issues/79)).
- **Routing strategy** — which artifacts are delivered to which model, in what order,
  and under what conditions.
- **Orchestration and pipeline state** — multi-step workflow execution, agent loops,
  or chain-of-thought state.
- **Cost and billing** — token accounting, rate limiting, or metering.
- **Model versions and prompt templates** — which language model is invoked or how
  system prompts are constructed.
- **Network transport** — HTTP, WebSocket, gRPC, or any other transport mechanism.
  UACP describes artifact content, not how artifacts move between systems.
- **Identity issuance** — UACP does not define how subjects or audience principals
  are issued or verified. The `subject` field is opaque.

---

## §9 — Permissions Model

This section is normative.

UACP uses a three-primitive permission model. Every artifact carrying these fields MUST
be enforced by the receiving vendor as specified.

### Primitives

**`subject` (required)**

The principal that owns the artifact. Opaque identifier formatted as a DID-style string
(e.g., `did:key:z6Mk...`, `did:web:example.com:users:alice`, or an opaque UUID URN
`urn:uacp:subject:<uuid>`).

- UACP does not define identity issuance. The `subject` value is meaningful only to
  the system that issued it.
- The owning vendor MUST NOT expose an artifact to any principal not listed in
  `audience` unless `audience` is empty (subject-only access) or the artifact is
  explicitly `public` scope.

**`audience` (optional)**

An explicit list of principals (handles or DIDs) authorized to access this artifact.

- An empty or absent `audience` means only the `subject` may access the artifact.
- A single-element audience of `["*"]` signals the artifact is public.
- Implementations MUST enforce `audience` restrictions when they have knowledge of
  the requesting principal's identity.
- Implementations MUST NOT expand `audience` (i.e., adding principals not listed by
  the artifact author) without explicit user consent.

**`scope` (optional)**

A labeled string from the starter registry (see §Annex A) that describes the intended
sharing relationship. The `scope` field is **informational** — the `audience` list is
what implementations enforce. The scope label helps humans and policy engines understand
*why* the audience looks the way it does.

- Implementations MUST NOT use `scope` alone as an access control mechanism.
- Implementations MUST treat unknown scope labels as opaque strings; they MUST NOT
  reject an artifact solely because its scope label is unrecognized.
- If `scope` is absent, implementations MUST treat it as `individual` by default.

---

## Annex A — Scope Label Registry (normative)

This annex is normative for labels defined below. Additional labels SHOULD be registered
via the UACP governance process.

| Label        | Intended relationship                                       | Notes                                              |
|--------------|-------------------------------------------------------------|----------------------------------------------------|
| `individual` | Artifact is private to the subject; no sharing intended     | Default when `scope` is absent                     |
| `family`     | Shared within a personal household or family unit           | Audience list expected to contain ≤ 10 principals  |
| `team`       | Shared within a professional working group                  | Typically 2–50 principals                          |
| `group`      | Shared within a defined community group                     | May overlap with `team`; use when non-work context |
| `corporate`  | Shared across an entire organization                        | Audience list MAY use a group DID to enumerate     |
| `public`     | Artifact is unrestricted; anyone may access                 | MUST be accompanied by `audience: ["*"]`           |

**Deny-by-default rule:** Unknown scope labels MUST be treated as `individual` by
implementations that do not recognize them. Vendors MUST NOT grant broader access for
unrecognized scopes.

---

## Annex B — Change History

| Version | Date       | Summary                                                                      |
|---------|------------|------------------------------------------------------------------------------|
| v0.1    | 2026-05-09 | Initial UACP-Core spec (anchored issue #55). Introduced envelope, kind registry, signing, versioning, compliance levels. |
| v0.2    | 2026-05-21 | Per ADR 0038: removed `trace` from core kind registry; added `subject` (required), revised `audience` to array, added `scope` field and §9 Permissions Model, added Annex A Scope Label Registry; updated §1/§2/§8 to cross-reference AAP, Capture-Manifest, UACP-Trace as sibling protocols. |
