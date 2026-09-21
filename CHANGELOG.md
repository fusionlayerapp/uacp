# UACP Changelog

## [Unreleased] — UACP-Memory@1 lifecycle, topics, and profile linkage

### Added
- `schema/v1/kinds/memory.schema.json` — additive optional fields: `lifecycle`
  (action/status/revision/previous_revision), `supersedes`, `derived_from`,
  `provenance`, `consent`, `topics`, `metadata`, and `profile_link`. Existing
  valid Memory v1 documents remain valid unchanged.
- `spec/v1/kinds/MEMORY.md` §4–§6 — normative rules for revision lineage,
  supersession, tombstone/expire/rollback-as-new-revision, multi-source
  provenance, the core topic registry, bounded typed metadata, and optional
  structured-profile linkage (`user`/`project`/`team` schemas plus
  collision-safe `<vendor>/<name>` namespacing).
- `lib/memory-lifecycle.js`, `lib/memory-topics.js`, `lib/memory-profile.js` —
  cross-field semantic validators returning stable `MEMORY_*` error codes for
  rules JSON Schema alone cannot express; wired into `validate.js` for both
  per-vector and full-envelope validation.
- `conformance/memory/run.js` — new sequence-level conformance harness that
  validates a chain of memory envelopes for stable-ID/predecessor lineage,
  non-contiguous revisions, unresolved profile-field conflicts, and (opt-in)
  UACP v1 `sha256:` signed-envelope integrity.
- `conformance/memory/vectors/`, `conformance/vectors/kinds/memory.*.json` —
  valid and invalid conformance vectors for lifecycle, topics, and profile
  linkage.
- `CONFORMANCE.md` — new requirement #10 (Memory lifecycle).
- Python and TypeScript reference validators now apply the same memory
  semantic checks as `validate.js` (lifecycle, topics, profile linkage) to
  `kind: memory` envelopes, and export a sequence validator
  (`validate_memory_sequence` / `validateMemorySequence`) that runs the
  `conformance/memory/vectors` in both reference test suites in CI (#107).
  The Go reference implementation still has no kind+body routing.

Issues: #98 (epic), #99, #100, #101.

---

## [Unreleased] — uacp-vault-envelope extension

### Added
- `spec/extensions/uacp-vault-envelope.md` — new optional extension (v1.0.0):
  a multi-recipient encrypted, integrity-protected container for one or more
  UACP bundles plus optional opaque companion payloads. Additive: a new root
  document kind signaled by the `uacp_vault_envelope` field, alongside
  `uacp`/`uacp_encrypted`/`uacp_export`/`uacp_context`. Existing consumers of
  those kinds are unaffected. Crypto-agnostic at the spec level — key-wrap
  and content-cipher algorithms are declared identifiers
  (`key_wrap.algorithm`, `content_cipher.algorithm`), not fixed by the schema.
- `schema/extensions/uacp-vault-envelope.schema.json` — extension schema.
- `test-vectors/extensions/vault-envelope/` — two valid test vectors (single
  and multi-recipient, with and without a companion payload).
- `validate.js` — detects `uacp_vault_envelope` documents and routes them to
  the new schema.
- `CONFORMANCE.md`, `docs/UACP-BOUNDARY.md`, README §6/§11 updated to
  register the new extension.

Issue: #96.

---

## [Unreleased] — v0.3 extension drafts

### Added (extension specs)
- `spec/extensions/uacp-branching.md` — conversation branching / non-linear tree (v0.3.1). Adds `branch_parent_id` and `branch_label` message fields.
- `spec/extensions/uacp-reasoning.md` — reasoning/thinking blocks (v0.3.2). Documents `thinking` content block `model_visibility` + `tokens` fields and message-level `reasoning` object.
- `spec/extensions/uacp-citations.md` — per-claim citations (v0.3.3). Documents full citation semantics including `source.retrieved_at`.
- `spec/extensions/uacp-artifacts.md` — artifacts with versioning (v0.3.4). Documents `artifact.version` field.

### Changed (schema v0.6.x patch)
- `schema/conversation.schema.json`: message `branch_parent_id`, `branch_label` fields added.
- `schema/conversation.schema.json`: `content_block` gains `model_visibility` (enum `visible|hidden`) and `tokens` (integer) for thinking blocks.
- `schema/conversation.schema.json`: `artifact` gains `version` (integer ≥ 1).
- `schema/conversation.schema.json`: `citation.source` gains `retrieved_at` (ISO 8601 timestamp).
- `extensions[]` items corrected to string type (was incorrectly enforced as objects in TS validator).

### Test vectors
- Added vectors 56–63 covering branching (2), reasoning (2), citations (2), artifacts (2).
- Conformance harness: 110 vectors (all passing).

### Reference implementations
- All three validators updated: TS 176/176, Python 130/130, Go passing.

---

## v0.6.0 — 2026-05-09

### Removed
- `uacp-privacy` extension. Privacy classification is now documented as a
  metadata convention (see README §10 "Privacy metadata convention"). The
  metadata key `uacp_privacy.level` remains reserved with the same reference
  taxonomy. Pre-beta cleanup; no back-compat shim.
- `uacp-sync` extension placeholder. It was never specified. If sync semantics
  are needed in the future, they will be specified at that time.

### Changed
- README §10 adds "Privacy metadata convention" subsection.
- Extensions tables in README, CONFORMANCE, UACP-BOUNDARY now list only
  `uacp-encryption`.

---

## v0.5.0 — 2026-05-07

### BREAKING
- Remove `privacy` enum from core conversation schema. Privacy taxonomy moved to optional `uacp-privacy` extension. Consumers using `doc.privacy` must migrate (see MIGRATION below).
- Move encryption envelope from core to optional `uacp-encryption` extension. Schema moved from `schema/encrypted-envelope.schema.json` to `schema/extensions/uacp-encryption.schema.json`. The old path is kept as a `$ref` shim for backwards compatibility but is deprecated.
- Schema `$id` URLs migrated from `fusionlayer.app` to `hn2.github.io/uacp` (placeholder; will move to neutral domain once purchased — see inkfold#76).

### Added
- `extensions[]` top-level array on conversation schema — optional list of UACP extension identifiers (e.g. `["uacp-privacy", "uacp-encryption"]`).
- `spec/extensions/uacp-privacy.md` — privacy taxonomy as a reference extension with recommended `metadata.uacp_privacy.level` placement.
- `spec/extensions/uacp-encryption.md` — AES-256-GCM envelope format as an optional extension spec.
- `schema/extensions/uacp-encryption.schema.json` — extension schema for encrypted envelopes.
- `test-vectors/extensions/privacy/` — extension test vectors for privacy classification.
- `test-vectors/extensions/encryption/` — extension test vectors for encryption envelope.
- `docs/UACP-BOUNDARY.md` updated with explicit three-tier examples: Core / Extension / Implementation-specific.
- CONFORMANCE.md updated to layered model: L1/L2/L3 = core conformance levels; extensions declared separately.
- validate.js and conformance harness updated to load extension schemas and collect extension test vectors.

### MIGRATION
- Implementations using `doc.privacy` MUST move to `doc.metadata.uacp_privacy.level` (if using the `uacp-privacy` extension) or a vendor-namespaced field (`doc.metadata."com.vendor.privacy_mode"`).
- Encryption envelopes are still supported but require declaring conformance to the `uacp-encryption` extension.
- Schema `$id` references: update from `https://fusionlayer.app/uacp/schema/0.4.0/...` to `https://hn2.github.io/uacp/schema/0.5.0/...`.

### Changed
- All test vectors bumped from `uacp: "0.3.0"` / `"0.4.0"` to `uacp: "0.5.0"`.
- Export bundle test vector source changed from `"fusionlayer"` to `"my-tool"` (OSS scrub).
- README restructured: §5 Privacy Levels replaced with extension pointer; §6 Encryption replaced with extension pointer; new §11 Extensions section added.

## [Unreleased] — 2026-05-06

### Changed
- OSS scrub: removed product-specific references from README, CONFORMANCE.md, GOVERNANCE.md, docs/ACP-UACP-RELATIONSHIP.md (#15).
- ACP retirement: ACP-UACP-RELATIONSHIP.md rewritten to history note; all 7 ACP extension drafts audited and decided (drop/absorb/private) (#19).
- validate.js: switched to Ajv 2020-12 draft (`ajv/dist/2020`) — was silently skipping schema validation for JSON Schema 2020-12 documents (#20).
- test-vectors/04-multimodal-image: replaced `data:` URI with `https://example.com/placeholder.png` to conform with schema URL pattern constraint.

### Added
- conformance/harness/run.js: public conformance harness ported from private repo, FusionLayer-specific imports removed (#21). Run `node conformance/harness/run.js` for self-test.
- .github/workflows/validate-vectors.yml: CI runs `node validate.js` + `node conformance/harness/run.js` on push/PR.

## [0.4.0] — 2026-04-29

### Added — normative
- **Per-message provenance** (`provenance`, `confidence`, `provenance_source`) on the `message` object.
  - `provenance`: `"extracted" | "inferred" | "system" | "tool_output"` — origin of message content.
  - `confidence` (number 0–1): producer's self-reported confidence. REQUIRED when `provenance=inferred`. MUST NOT be present when `provenance=extracted`.
  - `provenance_source` (string ≤ 256): optional identifier of the upstream source (e.g. `"claude-opus-4-7"`, `"cursor-memory-v2"`, `"user-profile-doc#L42"`).
- Schema conditional enforcement via `allOf` `if/then` rules.
- **CONFORMANCE.md §4 Provenance**: normative MUST/SHOULD table; L2 conformance now requires emitting `provenance` on every message.
- **5 new test vectors** (`16–20`): extracted, inferred-with-confidence, system+tool_output, negative (confidence-on-extracted rejected), back-compat (no provenance).

### Back-compat
- Absence of `provenance` is valid — defaults are documented in spec but not schema-enforced, preserving v0.3.0 document compatibility.
- All v0.3.0 test vectors continue to validate against the v0.4.0 schema.

## v0.3.0 (2026-04-24)

### Added — normative
- **Conventions** section in the spec: RFC 2119 / 8174 keyword usage; timestamp format pinned to RFC 3339 UTC with ms precision (`YYYY-MM-DDTHH:MM:SS.sssZ`); character-offset fields (citation `span`) pinned to Unicode scalar values.
- **§6 Encryption Envelope rewritten** with a normative field-level table and canonical KDF parameters in-schema, not in prose only: `argon2id = {m:65536, t:3, p:1, output_length:32}`, `hkdf = {hash:"sha256", output_length:32}`, `info = "uacp-key-v1"`. `iv` pinned to 12-byte lowercase hex (24 chars). `auth_tag` pinned to 16-byte lowercase hex (32 chars). Canonical AAD default defined: `"{uacp_encrypted}:{info}"`.
- **§6.2 Key derivation pseudocode** with full dataflow (master_key → content_key → AES-GCM).
- **§10 Schema extension policy**: conversation / message / content_block / artifact / tool_call / attachment / citation / redactions objects are closed. Vendor extensions MUST live under the per-object `metadata` key.
- **§12 "What counts as breaking" normative list** defining the 5 conditions that force a major bump.
- **Redactions object** now has a proper schema (`count`, `categories` enum, `placeholder_format` template) instead of free-form prose.
- **Citation span semantics** pinned to half-open `[start, end)` in Unicode scalar values.
- **5 new test vectors**: `11-empty-messages-refused` (negative), `12-rtl-hebrew-citation`, `13-deep-branches` (branch-of-branch + canonical-leaf rule), `14-tool-call-correlation` (paired tool message), `15-redactions-and-metadata` (vendor metadata round-trip).
- **GOVERNANCE.md** — change process, version gates, IP stance, security contact.
- **LICENSE** — dual CC BY 4.0 (spec text) + MIT (schemas, vectors, harness code).
- **CONFORMANCE.md rewritten** with normative level definitions, numbered test checklist, and an implementable `UACPImpl` TypeScript interface.

### Changed
- All JSON Schemas moved from `additionalProperties: true` (or unset) to `unevaluatedProperties: false` on closed objects. Unknown keys on a message or content_block now fail strict validation; unknown keys inside any `metadata` object still pass.
- `content_block` schema uses `if/then` to enforce per-type required fields (`text` blocks need `text`, `code` blocks need `code`, media blocks need one of `url`/`data`, etc.).
- `tool` field schema now correctly accepts `string | string[]` to match the spec text.
- `citation.span.items` tightened from `number` to `integer ≥ 0`.
- Export schema's `conversations[]` items now `$ref` the conversation schema instead of `type: object`.
- Envelope schema is now `additionalProperties: false`.

### Fixed
- Test vector `09-encrypted-envelope` updated to include all required KDF sub-objects and a base64url salt that validates under the new pattern.
- All other test vectors bumped to `uacp: "0.3.0"` / `uacp_export: "0.3.0"` / `uacp_encrypted: "0.3.0"`.

### Deprecated
- Legacy `tool_call_id` / `id` aliases on tool-role messages remain valid for v0.x but will be removed at v1.0. Writers SHOULD emit `call_id`.

## v0.2.0 (2026-04-21)

### Added
- §2.1 Conversation branching (`parent_id`, `branches`, `uacp.branch_nodes`)
- §2.2 Reasoning/thinking content block (`type: "thinking"`)
- §2.3 Citations array on assistant messages
- §2.4 Artifacts + `artifact_ref` content block
- §2.5 Message `status` field (`complete`, `in_progress`, `error`)
- §2.6 Model field expanded — object form `{ id, provider, snapshot_date }`
- §2.7 Multimodal content types: `audio`, `video`, `pdf`, `latex`
- §2.8 Code block schema: `language`, `code`, `filename`
- §10 Extension namespace rule (reverse-domain required for custom types)
- §12 Version negotiation rules (unknown fields MUST be preserved on round-trip)
- §13 Conformance levels (L1 Minimal, L2 Standard, L3 Full)
- §14 Deprecation policy
- §15 v0.2.0 fields reference
- Appendix B: MCP interop mapping
- Appendix C: UACP vs MCP comparison

### Fixed (from v0.2.0 cleanup pass)
- §1: "Universal" → "Unified" in body text (title was already correct)
- `id` field: ULID/UUID v7 recommendation added
- `tool` field: accepts `string | string[]`; `tool_chain` optional field added
- `messages`: explicit array-index-authoritative ordering rule
- `system` role: zero or one, must be index 0
- `call_id` normalization: legacy `id`/`tool_call_id` are aliases
- `attachments`: full object schema defined
- `redactions` optional field per message
- §4: 8 additional tool identifiers (claude-ai, zed, warp, pieces, raycast, openwebui, anythingllm, jetbrains-ai)
- §6: canonical Argon2id params specified (`m=65536, t=3, p=1`)

## v0.1.0 (2026-04-17)

Initial draft specification.

- Conversation object schema (required + optional fields)
- Message object schema (4 roles, content block types)
- Tool identifiers table (27 tools)
- Privacy levels
- Encryption envelope (AES-256-GCM)
- Context injection format
- Export/import format
- Sync protocol (delta sync + upload)
- Extensibility via metadata namespaces
- MIME type + file extension
- Versioning (semantic versioning)
