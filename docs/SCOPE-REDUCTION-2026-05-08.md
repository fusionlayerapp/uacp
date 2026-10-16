---
title: UACP Scope Reduction
date: 2026-05-08
status: spec — ready for Sonnet to execute
author: Opus (planning)
---

# UACP Scope Reduction — 2026-05-08

## Why

UACP currently advertises three optional extensions: `uacp-privacy`, `uacp-encryption`, `uacp-sync`. Two of those don't earn their surface area:

- `uacp-privacy` is a single metadata key with four reference values. Promoting that to a "spec extension" with its own file, declaration, and conformance line is process theater.
- `uacp-sync` has no schema, no spec body, and is marked "pending" in two places. Listing unshipped extensions inflates the protocol's apparent surface and invites scope-creep questions from readers.

`uacp-encryption` stays. It defines an interoperable envelope format with real cross-tool value — any third party that wants to import an encrypted UACP bundle needs the canonical envelope. Inkfold's internal encryption is a separate concern; the envelope is for interchange.

## Final shape

| Concern | Before | After |
|---|---|---|
| Privacy level | Optional extension `uacp-privacy` declared in `extensions[]` | Documented metadata convention only — `metadata.uacp_privacy.level` is reserved, no extension declaration needed |
| Encryption envelope | Optional extension `uacp-encryption` | **Unchanged.** Keep extension, schema, test vectors, conformance line. |
| Sync | Optional extension `uacp-sync` (pending) | Removed entirely. No future placeholder. If ever needed, spec it then. |

## Scope of changes (machine-readable)

### Files to DELETE

1. `spec/extensions/uacp-privacy.md`
2. `test-vectors/extensions/privacy/01-privacy-level-in-metadata.uacp.json`
3. `test-vectors/extensions/privacy/` (empty directory after #2)

### Files to EDIT

#### `README.md`

- **Line 3** — replace tagline:
  - From: `**UACP Core v0.5.0 — vendor-neutral conversation format. Optional extensions add privacy taxonomy (\`uacp-privacy\`), encryption envelope (\`uacp-encryption\`), and sync protocol (\`uacp-sync\`).**`
  - To: `**UACP Core v0.5.0 — vendor-neutral conversation format. Optional encryption envelope extension (\`uacp-encryption\`) for interoperable encrypted interchange.**`

- **Line 33** — delete the bullet `- Mandate real-time sync (sync is implementation-level — see \`uacp-sync\` extension)`. Replace with a simpler bullet: `- Mandate real-time sync (sync is implementation-level)`.

- **Line 34** — replace `- Define any particular privacy model (that is implementation policy — see \`uacp-privacy\` extension)` with `- Define any particular privacy model (that is implementation policy — see "Privacy metadata convention" in §10)`.

- **Extensions table (around line 437–439)** — keep only the `uacp-encryption` row. Delete the `uacp-privacy` and `uacp-sync` rows.

- **Add a new subsection in §10 (Extensibility)** titled **"Privacy metadata convention"** with this exact body:

  ```
  ### Privacy metadata convention

  The metadata key `uacp_privacy.level` is reserved for an optional, vendor-neutral
  privacy classification label. Reference values: `private`, `personal`, `team`,
  `public`. Default when absent: `personal`.

  This is a convention, not an extension — implementations do not declare it in
  `extensions[]`. Implementations with product-specific privacy semantics SHOULD
  use a vendor namespace (e.g. `com.fusionlayer.privacy_mode`) instead.

  Scope: classification only. Encryption is covered by the `uacp-encryption`
  extension. Access control and enforcement are implementation-specific.
  ```

#### `CONFORMANCE.md`

- **Lines 119–122 (extensions table)** — keep only the `uacp-encryption` row. Delete the `uacp-privacy` and `uacp-sync` rows.
- Search the rest of the file for any other `uacp-privacy` or `uacp-sync` reference and remove.

#### `docs/UACP-BOUNDARY.md`

- **Lines 49–57 (extensions table)** — keep only the `uacp-encryption` row. Delete the `uacp-privacy` and `uacp-sync` rows.
- **Lines 61–62 (extension test-vector examples)** — delete the `test-vectors/extensions/privacy/...` bullet.
- **Line 49 (example JSON)** — change `{ "extensions": ["uacp-privacy", "uacp-encryption"] }` to `{ "extensions": ["uacp-encryption"] }`.
- **Lines 100–118 (Metadata namespace guidance)** — `uacp_privacy.level` stays as a reserved metadata key. Update the example to show it as a convention, not an extension. Adjust the bullet `uacp_<extension>.*` reservation note: it now applies only to `uacp_encryption.*` and any future extension namespaces. Add a sentence: `\`uacp_privacy.*\` is reserved by the privacy metadata convention (see README §10).`

#### `spec/extensions/uacp-encryption.md`

- **Line 99** — delete the bullet `- Privacy classification: \`spec/extensions/uacp-privacy.md\``. Replace with: `- Privacy classification: see "Privacy metadata convention" in README §10.`

#### `schema/conversation.schema.json`

- Search for any `uacp-privacy` or `uacp-sync` enum entries (e.g. in the `extensions[]` array constraint, if such a constraint exists). Remove `uacp-privacy` and `uacp-sync` from any enumeration. **Do not** invalidate documents that previously declared `uacp-privacy` — i.e., if the enum is open (no `enum` constraint, just type), no schema change is needed beyond removing those values from any documentation.
- Verify by reading the file: if `extensions` is `{"type":"array","items":{"type":"string"}}` (open), no edit needed. If it has an enum, prune the two values.

#### `CHANGELOG.md`

Add a new entry at the top under an unreleased / `0.6.0` heading (use whatever format the file already uses):

```
## 0.6.0 — 2026-05-08

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
```

### Test / validation steps after edits

1. From `C:/Projects/uacp`, run `npm test` (or whatever the existing test command is — check `package.json` `scripts`).
2. Run `node validate.js` against every file under `test-vectors/` to confirm no validator references the deleted privacy spec or vector.
3. Grep the repo for `uacp-privacy` and `uacp-sync` — both should return zero matches **except** in `CHANGELOG.md` and in this doc (`docs/SCOPE-REDUCTION-2026-05-08.md`).
4. Grep for `uacp_privacy.level` — should still appear in README §10 (the new convention subsection) and `docs/UACP-BOUNDARY.md` (metadata namespace guidance).

### Edge cases / out-of-scope

- **No bumping `uacp` field version on documents** — core conversation schema is unchanged. The `uacp` field stays at `0.5.0` on documents.
- **Spec version** — bump README header from "Specification v0.5.0" to "Specification v0.6.0" only if existing convention treats extension removal as a minor bump. Defer that decision to the implementer; the safe default is to bump to `0.6.0` since this is a breaking change to the extension surface and UACP is pre-1.0.
- **No deprecation period.** Pre-beta. Per memory `project_fusionlayer_prebeta.md` (which applies similarly here): clean breaks, no aliases, no shims.
- **Encryption test vectors and schema are untouched.**

### Definition of done

- All deletions and edits above applied.
- Repo grep for `uacp-privacy` and `uacp-sync` is empty outside `CHANGELOG.md` and this doc.
- `node validate.js` (or equivalent) passes on all remaining test vectors.
- Single commit with message `chore(spec): remove uacp-privacy + uacp-sync extensions; demote privacy to metadata convention`.
- Pushed to `origin/main`.

## After-action update

Once executed, append a short "Outcome" section to this doc with: actual files changed, any deviations from the spec above, and the commit SHA.
