# UACP #99 — Memory lifecycle work record

## Initial state

UACP Memory v1 defines one immutable envelope with a stable `id` and a semantic
`version`, but its body only records a single `source` string and `expires_at`.
It has no portable representation for revision lineage, supersession,
tombstones, source multiplicity, or rollback-as-a-new-revision. The JSON Schema
also cannot express cross-field lifecycle rules or deterministic errors.

The working tree was clean and fast-forwarded to `d7f043d` before this work.
Existing memory vectors cover only valid content, empty content, and a confidence
range violation.

## Intended change

Implement UACP #99 as an additive Memory v1 extension:

- retain existing valid Memory v1 documents;
- add optional lifecycle, revision, relationship, provenance, and consent fields;
- enforce lifecycle cross-field rules in the existing validator with stable error
  codes, rather than trying to encode them ambiguously in JSON Schema;
- add valid and invalid conformance vectors, including supersession, tombstones,
  multiple sources, expiry, and rollback.

The work deliberately does not define storage, ranking, database migrations,
provider behavior, capture provenance internals, or deletion of historical data.

## Acceptance tests

- `npm test`
- `npm run validate`
- targeted memory lifecycle vector validation

## Completion record

Implemented the additive Memory v1 lifecycle contract in the body schema and
normative kind specification. The contract preserves legacy bodies while adding
revision actions/status, a direct predecessor, supersession and derivation
references, bounded multi-source evidence, and consent state.

Cross-field rules live in `lib/memory-lifecycle.js` so they can return stable
`MEMORY_LIFECYCLE_*` errors. The validator applies them both to standalone
kind vectors and to full envelopes, including the invariant that a direct
predecessor carries the current envelope's stable memory ID.

Added valid and invalid lifecycle vectors plus focused unit tests. Verification:

- `npm test` — pass; validator 171/171, conformance harness 166/166.
- `npm run validate` — pass; validator 171/171.
- `git diff --check` — pass.

No database, provider, capture, credential, release, or deployment change was
made. Follow-up: add cross-revision sequence conformance when the harness can
evaluate a set of signed memory envelopes rather than one body at a time.

## Phase 2 intended change

Add a focused, data-only sequence harness for Memory revisions. It will verify
that a set of envelopes preserves stable identity, contiguous predecessor
lineage, legal supersession/tombstone/expiry transitions, and
rollback-as-new-revision. It will not verify signatures, storage behavior, or
retrieval ranking; those are owned by other protocol layers or implementations.

## Phase 2 completion record

Added `conformance/memory/run.js` and four sequence vectors. The sequence
harness rejects a missing predecessor, an unknown supersession/derivation
reference, and a skipped revision number. Its valid chain proves that a
tombstone remains in history and a rollback creates a later revision rather
than rewriting the earlier one.
The Memory kind now also maps scope promotion and withdrawal to the existing
canonical event extensions, preserving source copies and audit history rather
than treating a scope change as a tombstone.

`CONFORMANCE.md` now documents the lifecycle claim and command. `npm test`
passes with the existing validator and core harnesses plus the memory sequence
harness: 171 validator vectors, 166 core conformance cases, and 4 lifecycle
sequence vectors. `git diff --check` passes.

## Phase 3 intended change

Extend only the Memory sequence harness with an opt-in signed-envelope mode for
UACP v1 `sha256:` envelope integrity signatures. Add a valid signed revision
chain and a tampered signed revision vector. The harness will preserve support
for the existing body-only vectors and will not introduce a new key registry,
identity protocol, storage behavior, or crypto algorithm.

## Phase 3 completion record

Implemented opt-in `require_signed_envelopes` handling in
`conformance/memory/run.js`. It verifies the UACP v1 `sha256:` hash of the JCS
canonical envelope with `signature` omitted, before assessing lifecycle
semantics. Existing body-only sequence vectors remain supported. Added one
signed valid chain and one tampered revision vector, plus focused assertions for
valid, tampered, and absent signatures.

Verification: the focused sequence test passes 2/2; the memory conformance
runner passes 8/8 vectors; `npm test` passes with 179 validator vectors and
166 core conformance cases; `npm run validate` passes 179/179; and
`git diff --check` has no whitespace error. The test vector identifiers and
subjects are non-sensitive placeholders. No key material, new algorithm,
database, provider, release, or deployment change was made.

## Phase 4 intended change

Add one focused data-only sequence vector for an expiry transition. It will
prove that an expired revision follows the same stable memory ID and direct
predecessor rules as other lifecycle actions, while remaining part of the
auditable sequence. No validator behavior, schema, or retrieval logic will
change.

## Phase 4 completion record

Added `09-valid-expired-revision.json`: create revision 1 is followed by an
`expire` action at revision 2 using the same stable memory ID and direct
predecessor. The accepted sequence demonstrates that expiry is a retained
lifecycle revision, not deletion. The focused sequence test passes 2/2 and the
memory conformance runner passes 9/9 vectors. No production, retrieval, schema,
or validator behavior changed.

## Phase 5 — pre-merge review fixes

An independent review pass before committing this work found three real
issues, all fixed before merge:

- `schema/v1/kinds/memory.schema.json`'s `profileLink.field` pattern had a
  misplaced `$` anchor inside a non-capturing-group alternation, so the
  anchor only applied to the JSON-Pointer branch: a plain field identifier
  like `"display name!!!"` would incorrectly pass. Fixed by moving `$`
  outside the group; added a schema-level regression test.
- The `metadata` key pattern allowed an underscore in a namespaced vendor
  prefix (e.g. `"acme_corp/setting"`) while `lib/memory-topics.js`'s semantic
  `isNamespaced()` check did not, so such a key passed AJV but failed the
  semantic layer. Tightened the schema pattern so both layers agree; added a
  regression test asserting the two layers give the same answer.
- `lifecycle.status: "superseded"` was schema-legal but nothing in §4 defined
  when it was legal to use, and no validator rule constrained it — an
  authored envelope could never legitimately carry it, since revisions are
  immutable. Added a normative rule (`create`/`confirm`/`update`/`supersede`/
  `rollback` MUST use status `active`; `superseded` is derived, read-side
  state a producer must never author) plus enforcement
  (`MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS`) and a
  conformance vector.

A second review pass on that fixed state found two further real gaps,
also fixed before merge:

- §4's own normative rule that "the direct predecessor revision MUST be
  exactly one less than the current revision" was enforced only at the
  sequence-harness level (`conformance/memory/run.js`), not in
  `lib/memory-lifecycle.js` — so a single out-of-context envelope with a
  revision that skips a number (e.g. revision 5 naming predecessor revision
  2) passed per-document validation in both `validate.js` paths. Added
  `MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION` to the single-document
  validator, plus a unit test and a per-kind conformance vector distinct
  from the existing sequence-level vector.
- The new §4 consent sentence said health/financial memories require
  `consent: explicit` "whenever lifecycle metadata is present," narrower
  than the pre-existing, unconditional §8 guarantee ("MUST NOT store health
  or financial memories without explicit user consent"). Because
  `validateMemoryLifecycle` returned `[]` immediately whenever `lifecycle`
  was absent, a lifecycle-less sensitive-category memory silently bypassed
  consent entirely — a real regression against §8. Fixed by moving the
  consent check ahead of the lifecycle-presence early return (so it always
  runs) and rewording §4 to match §8 rather than narrow it. Added a unit
  test and a conformance vector for the lifecycle-absent sensitive case.

Also noted, not fixed tonight (filed as fusionlayerapp/uacp#102): the
full-envelope path in `validate.js` resolves any `{kind, body}` document
against the chat-message conversation schema before applying the kind
schema, so a full memory (or persona/playbook) envelope generally cannot
pass end-to-end validation via that path today — pre-existing for every
kind, not introduced by this work. A code comment was added at the call
site pointing to the issue. Also left as an open, non-blocking note:
`profile_link.conflict: "resolved"` is schema-legal but its semantics are
never defined in prose — currently behaves identically to `"none"`.

Verification after all Phase 5 fixes: `npm test` passes clean (182
validator vectors, 166 core conformance cases, 9 memory sequence vectors,
all `node --test` suites green, exit code 0).
