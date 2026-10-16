# UACP v0.6.0 — Release Notes

**Released:** 2026-05-25
**Spec version:** 0.6.0
**npm package:** `uacp@0.6.0`

---

## What is UACP?

The Unified AI Context Protocol (UACP) is an open, vendor-neutral standard for representing, storing, and exchanging AI conversation data across tools. It enables portability between ChatGPT, Claude, Gemini, Cursor, and any other AI tool.

---

## What's new in v0.6.0

This release ships eight context-sharing extensions, a full conformance fixture suite, and reference validators in TypeScript, Python, and Go.

### 1. Sync-event envelope (`uacp-sync-event`)

The signed, ordered event envelope that forms the atomic unit of exchange in a UACP append-only sync log. Each event carries an encrypted payload, a vector-clock position, and an Ed25519 signature tied to the originating device.

Spec: `spec/extensions/uacp-sync-event.md`
Schema: `schema/extensions/uacp-sync-event.schema.json`

### 2. Identity and device key chain (`uacp-identity-key`, `uacp-device-registration`, `uacp-device-retirement`)

A two-level verification chain: a user-scoped identity key (Ed25519, base64url) and per-device registration and retirement events. Canonical CBOR encoding for signing is normative. Error codes `DEVICE_KEY_INVALID`, `DEVICE_NOT_REGISTERED`, `DEVICE_RETIRED`.

Spec: `spec/extensions/uacp-identity-chain.md`
Schemas: `schema/extensions/uacp-identity-key.schema.json`, `uacp-device-registration.schema.json`, `uacp-device-retirement.schema.json`

### 3. Encryption envelope (`uacp-encryption`)

An AES-256-GCM sealed wrapper with Argon2id + HKDF key derivation for at-rest and in-transit encrypted conversation interchange. Fully specifies IV length, tag length, KDF parameters, and canonical encoding.

Spec: `spec/extensions/uacp-encryption.md`
Schema: `schema/extensions/uacp-encryption.schema.json`

### 4. Audit event hash chain (`uacp-audit-event`)

A tamper-evident hash chain for audit events. Each event includes a `prev_hash` (SHA-256 of the preceding event in canonical JSON), an actor identity, and a timestamp. Supports `access`, `modify`, `share`, `delete`, `admin` action types. Error code `AUDIT_CHAIN_BROKEN`.

Spec: `spec/extensions/uacp-audit-event.md`
Schema: `schema/extensions/uacp-audit-event.schema.json`

### 5. Promotion and withdrawal events (`uacp-promotion-event`, `uacp-withdraw-event`)

`uacp-promotion-event` records elevation of a conversation artifact from draft to approved status (or any multi-stage workflow transition). `uacp-withdraw-event` records author retraction or DLP-triggered withdrawal. Both include authorization rules and error codes (`PROMOTER_NOT_AUTHORIZED`, `WITHDRAWER_NOT_AUTHORIZED`).

Specs: `spec/extensions/uacp-promotion-event.md`, `spec/extensions/uacp-withdraw-event.md`
Schemas: `schema/extensions/uacp-promotion-event.schema.json`, `schema/extensions/uacp-withdraw-event.schema.json`

### 6. Member set and scope-key envelope (`uacp-member-set`)

Defines the scope member list and the encrypted scope-key distribution envelope. Members hold a `role` (`owner | member | reader`), a device public key, and an encrypted copy of the scope key. Scope-key envelope uses X25519 ECDH + HKDF to derive per-member encryption keys. Error codes `SCOPE_KEY_MISSING`, `MEMBER_NOT_FOUND`, `DUPLICATE_MEMBER`.

Spec: `spec/extensions/uacp-member-set.md`
Schema: `schema/extensions/uacp-member-set.schema.json`

### 7. Scope identifier and governance axes (`uacp-scope-identifier`)

A compact identifier for a sharing scope: UUID v4 scope ID, optional human-readable label, governance-axis qualifiers (`personal | team | org | public`), and capability qualifiers (`encrypted | audited | promotable`). Compliance token syntax is `+`-separated.

Spec: `spec/extensions/uacp-scope-identifier.md`
Schema: `schema/extensions/uacp-scope-identifier.schema.json`

### 8. Vector clock (`uacp-vector-clock`)

UUID-keyed uint64 Lamport vector clock with normative dominance, concurrency, merge, and increment semantics. Error codes `CLOCK_FORMAT_INVALID`, `CLOCK_OVERFLOW`. Conformance test fixtures cover linear chains, five-device interleave, concurrency detection, and merge commutativity.

Spec: `spec/extensions/uacp-vector-clock.md`
Schema: `schema/extensions/uacp-vector-clock.schema.json`

---

## Conformance harness

A new conformance fixture suite (`spec/45-conformance-fixtures`) ships with this release. The harness at `conformance/harness/run.js` runs all core and extension fixtures and emits an interoperability matrix.

Run: `npm test` (includes version consistency, resource limits, all extension tests, validate.js, and conformance harness)

---

## Reference implementations

Three reference validators ship in `reference-impls/`:

- **TypeScript** — full constraint coverage; 176/176 tests
- **Python** — full constraint coverage; 130/130 tests
- **Go** — full constraint coverage; all tests passing

---

## Schema changes (v0.6.0 vs v0.5.0)

- All 8 extension schemas added under `schema/extensions/`
- Resource limits (`maxItems`, `maxLength`) added to core conversation schema
- Schema `$id` URLs normalized to `https://hn2.github.io/uacp/schema/0.6.0/`
- All test vectors bumped to `"uacp": "0.6.0"`

---

## Breaking changes

None relative to v0.5.0. All v0.5.0 documents remain valid under v0.6.0 core schemas.

The `uacp-privacy` and `uacp-sync` extension placeholders were removed in v0.5.0 (documented there). v0.6.0 ships the new context-sharing extensions as distinct, fully specified extensions.

---

## Earlier releases

- **v0.5.0** — Extracted privacy and encryption to optional extensions; introduced `extensions[]` array; breaking removal of `doc.privacy` core field.
- **v0.4.0** — Per-message provenance and confidence fields.
- **v0.3.0** — Branching, reasoning blocks, citations, artifacts.
- **v0.2.0** — Initial public extraction.
