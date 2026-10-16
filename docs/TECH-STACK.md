# UACP — Tech Stack

UACP (Unified AI Context Protocol) is an open standard. This repo is the spec + reference validator + conformance harness. It will be public — treat it as already public.

For the full ecosystem stack (engine that implements UACP, clients that emit UACP, etc.), see [`fusionlayer/docs/TECH-STACK.md`](../../fusionlayer/docs/TECH-STACK.md).

Last verified: 2026-05-18.

---

## Stack

- **Language:** JavaScript (CommonJS — kept to maximize tool portability; the spec itself is language-agnostic)
- **Schema format:** JSON Schema (draft 2020-12) + YAML manifests
- **Validation:** Ajv 8 + ajv-formats
- **Canonical JSON:** `canonicalize` (RFC 8785-style deterministic ordering for hashing + signing)
- **Cryptography:** `@noble/ed25519` 3 — registry / capture-manifest signature verification
- **Manifests:** `js-yaml` for parsing
- **Test runner:** `node --test` (zero-dep)
- **Conformance harness:** Custom Node harness in `conformance/harness/` that replays vector files and asserts conformance

## Layout

| Path | Purpose |
|---|---|
| `schemas/` | JSON Schema definitions for every UACP kind |
| `docs/` | Spec text, change history, sub-spec docs |
| `conformance/vectors/` | Test vectors (event chains, signed manifests, edge cases) |
| `conformance/harness/` | Runner that executes vectors against an implementation |
| `tools/uacp-validate/` | CLI validator (`uacp-validate <file>`) |
| `validate.js` | Top-level validator entrypoint |

## Tests

```bash
npm test
```

Runs:
1. Version-consistency check (schema versions match `package.json`)
2. Resource-limits tests
3. Validator unit tests
4. Top-level schema validation across all bundled vectors
5. Conformance harness across all vector chains

## Standards stance

- **License:** Apache 2.0 (`LICENSE`)
- **Governance:** documented in `GOVERNANCE.md`
- **Contributions:** `CONTRIBUTING.md`
- **Conformance:** `CONFORMANCE.md` — what an implementation must satisfy to claim UACP support
- **Code of Conduct:** `CODE_OF_CONDUCT.md`

## Out of scope for this repo

- Routing decisions, orchestration, runtime state — engine-internal (per ADR 0033)
- Operator implementations — code, not artifacts
- Reference engine — lives in `hn2/fusionlayer`, not here

UACP describes data crossing vendor boundaries only.
