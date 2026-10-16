# uacp-vault-envelope — Encrypted-Bundle Vault Envelope Extension

**Status:** Optional extension
**Version:** 1.0.0
**Identifier:** `uacp-vault-envelope`
**Schema:** `schema/extensions/uacp-vault-envelope.schema.json`
**Schema identifier:** `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vault-envelope`
**Issue:** #96

---

## Overview

`uacp-vault-envelope` defines a container format for carrying one or more encrypted, integrity-protected UACP bundles — plus optional opaque companion payloads — to a set of recipients, with only the minimal plaintext framing needed for routing and versioning.

It is a sibling of `uacp-encryption`, not a replacement for it. `uacp-encryption` wraps exactly one conversation under a single passphrase-derived key. `uacp-vault-envelope` wraps one-or-more bundles under a single content key that is itself asymmetrically wrapped once per recipient, for multi-recipient sharing use cases (e.g. a shared workspace, a synced device set) where a passphrase model doesn't fit.

This extension is **crypto-agnostic at the spec level**: it defines the envelope shape and the integrity/no-plaintext-content requirements a conforming envelope must satisfy. It does not mandate one key-wrapping algorithm or one content cipher — those are declared per envelope via `key_wrap.algorithm` and `content_cipher.algorithm` string identifiers, so implementations can adopt new algorithms without a spec revision. A binding to a specific cryptographic implementation ("the PAL vault profile", see [Relationship to a reference implementation](#relationship-to-a-reference-implementation)) is one conforming implementation of this shape, not the definition of it.

---

## Vault Envelope Format

```json
{
  "uacp_vault_envelope": "1.0.0",
  "envelope_id": "3f9c4b2a-1e6d-4a2f-9c3b-7d8e5f6a1b2c",
  "created_at": "2026-08-10T12:00:00.000Z",
  "key_wrap": {
    "algorithm": "x25519-sealedbox",
    "recipients": [
      { "recipient_id": "a1c2e3f4a5b6c7d8", "wrapped_key": "dGhpcy1pcy1ub3QtYS1yZWFsLXdyYXBwZWQta2V5" },
      { "recipient_id": "b2d3f4a5b6c7d8e9", "wrapped_key": "YW5vdGhlci1ub3QtcmVhbC13cmFwcGVkLWtleQ" }
    ]
  },
  "content_cipher": { "algorithm": "xchacha20-poly1305-secretstream" },
  "bundles": [
    { "id": "6a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9", "ciphertext": "bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LWJ1bmRsZS0x" },
    { "id": "7b2c3d4e-5f60-7182-93a4-b5c6d7e8f9a0", "ciphertext": "bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LWJ1bmRsZS0y" }
  ],
  "companion_payloads": [
    { "id": "8c3d4e5f-6071-8293-a4b5-c6d7e8f9a0b1", "label": "retrieval-index", "ciphertext": "bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LWluZGV4" }
  ]
}
```

The envelope is a distinct top-level document kind, sibling to `uacp` (Conversation Object), `uacp_encrypted` (Encrypted Envelope), `uacp_export` (Export Bundle), and `uacp_context` (Context Injection). Its presence is signaled by the `uacp_vault_envelope` field, following the same one-field-per-document-kind convention as the other three.

---

## Field requirements (normative)

- `uacp_vault_envelope` — semver string identifying the extension version.
- `envelope_id` — opaque, randomly generated per envelope instance. MUST NOT be derived from, or reveal, any plaintext bundle content.
- `created_at` — envelope creation timestamp, RFC 3339 / ISO 8601, UTC, millisecond precision. Immutable once set; it does not track later modification of the envelope's contents (append/rotation semantics are implementation-specific and out of scope for this extension).
- `key_wrap.algorithm` — a non-empty, lowercase, hyphenated identifier for the per-recipient key-wrapping scheme. See [Algorithm identifiers](#algorithm-identifiers-informative).
- `key_wrap.recipients` — at least one entry. Every entry in `bundles[]` and `companion_payloads[]` is encrypted under the **same** shared content key; unwrapping that key for one recipient grants that recipient access to every entry in the envelope. Access control operates at the envelope-recipient granularity, not per-entry — implementations that need finer-grained access MUST split content across multiple envelopes.
  - `recipient_id` — an opaque per-recipient routing token (e.g. a public-key fingerprint or other stable per-identity handle chosen by the implementation). It exists so a recipient can locate their own wrapped-key entry without decrypting anything; it MUST NOT be derived from or encode bundle content.
  - `wrapped_key` — base64url (RFC 4648 §5, no padding) ciphertext of the shared content key, wrapped for this recipient. Opaque bytes from this schema's point of view; the wrapping construction is defined by `key_wrap.algorithm`.
- `content_cipher.algorithm` — a non-empty, lowercase, hyphenated identifier for the AEAD (or authenticated streaming AEAD) construct used to produce every `ciphertext` value in the envelope under the shared content key. See [Algorithm identifiers](#algorithm-identifiers-informative).
- `bundles` — at least one entry. Each entry's `ciphertext` MUST decrypt, under `content_cipher.algorithm` and the recipient-unwrapped content key, to a single UACP Conversation Object valid against `schema/conversation.schema.json`.
- `companion_payloads` — zero or more entries. Opaque to generic UACP consumers: an implementation MAY put anything here (a retrieval index, sync/merge state, etc.) as long as it travels under the same envelope-wide encryption and integrity guarantees as `bundles[]`. The optional `label` field is a coarse, implementation-documented category hint (e.g. `"retrieval-index"`) — it MUST be drawn from a small fixed vocabulary, never per-instance data, so it cannot leak content.
- `bundles[].id` / `companion_payloads[].id` — opaque, randomly generated per entry. MUST be independent of any identifier carried inside that entry's encrypted plaintext — in particular, an entry's `id` MUST NOT be set to (or derived from) the inner bundle's own `id` field. This is what stops the plaintext envelope from correlating container entries to specific conversations by ID.

---

## No-plaintext-content guarantee

The requirement in scope for this extension is: **no content-bearing field may appear in plaintext anywhere in the envelope.** Every field defined above is one of:

| Field | Why it is not content-bearing |
|---|---|
| `uacp_vault_envelope`, `key_wrap.algorithm`, `content_cipher.algorithm` | Fixed/registry values describing format and algorithm, not conversation data. |
| `envelope_id`, `bundles[].id`, `companion_payloads[].id` | Randomly generated, independent of any content — see the `id` requirement above. |
| `created_at` | A timestamp of container creation, not of any message or fact inside it. |
| `key_wrap.recipients[].recipient_id` | An opaque per-identity routing token, not derived from content. |
| `key_wrap.recipients[].wrapped_key` | Ciphertext of a symmetric key — key material, not conversation content, and itself opaque. |
| `companion_payloads[].label` | A coarse category name from a small fixed vocabulary, not instance data. |
| `bundles[].ciphertext`, `companion_payloads[].ciphertext` | Ciphertext. |

This property was verified against the reference implementation described below: its own test suite constructs an envelope from bundles containing distinctive plaintext strings and distinctive fact values, serializes it to the wire form, and asserts by direct string search that none of that plaintext — nor the opaque companion payload's bytes — appears anywhere in the serialized output. The field-by-field design above reproduces that property structurally, rather than relying on it being true by accident.

---

## Algorithm identifiers (informative)

`key_wrap.algorithm` and `content_cipher.algorithm` are open string identifiers, not closed enums — this extension does not pin a cryptographic algorithm. The following identifiers are documented because a reference implementation uses them; this table is informative and non-exhaustive. New identifiers do not require a spec revision to use, but SHOULD be proposed via PR against this document so implementations can interoperate on a shared name.

| Identifier | Field | Meaning |
|---|---|---|
| `x25519-sealedbox` | `key_wrap.algorithm` | Anonymous ECIES: X25519 key agreement against an ephemeral sender key, sealed to the recipient's public key. No sender authentication (by design — the wrapping step does not need to prove who wrapped the key). |
| `xchacha20-poly1305-secretstream` | `content_cipher.algorithm` | A chunked, authenticated streaming AEAD construct (192-bit nonce XChaCha20-Poly1305) with a distinguished final-chunk tag, providing both ciphertext integrity and stream-boundary integrity (truncation is detectable). |

Implementations MUST NOT invent an identifier that collides with a name in this table but means something else.

---

## Integrity (normative)

- Every `ciphertext` value MUST be produced under an authenticated construct (an AEAD cipher, or an authenticated streaming AEAD such as the one above) keyed by the shared content key. Implementations MUST reject any entry whose authentication check fails; MUST NOT return partially-decrypted plaintext on authentication failure.
- Envelope-context binding — i.e. cryptographically binding `envelope_id` and/or the two algorithm identifiers into each entry's authenticated data, so a ciphertext from one envelope cannot be spliced into another, or replayed under a different declared algorithm — is RECOMMENDED (SHOULD) but not REQUIRED (MUST) by this version of the extension. This is a deliberately weaker requirement than it could be: the reference implementation described below does not currently bind envelope context into per-entry encryption, and requiring it here would make that implementation non-conformant on day one. Implementers who want the stronger property today MAY bind it themselves as part of their `content_cipher.algorithm` construction. Tightening this SHOULD to a MUST is an open item for a future minor revision, once at least one reference implementation demonstrates the binding end-to-end.

---

## Capability / feature detection

Two independent mechanisms, matching this repo's existing conventions:

1. **Document-kind detection (primary).** A parser distinguishes a vault envelope from a Conversation Object, an Encrypted Envelope, an Export Bundle, or a Context Injection document purely by which version-carrying root field is present (`uacp`, `uacp_encrypted`, `uacp_export`, `uacp_context`, or `uacp_vault_envelope`). Because this is a brand-new field name, no existing parser for any of the other four kinds will match a vault envelope document; it will correctly fall through as "not a document kind I recognize" rather than being partially or incorrectly parsed. This is what makes the extension additive: **existing UACP consumers are unaffected** — they simply never encounter a document that satisfies their own kind-detection check.
2. **Capability advertisement (secondary, optional).** An implementation MAY additionally advertise, in the `extensions[]` array of ordinary (non-enveloped) UACP documents it emits, that it knows how to produce and/or consume `uacp-vault-envelope` documents elsewhere in its own pipeline — the same pattern already used for `uacp-encryption` (see README §11). This is informational only; it does not change how any single document is parsed.

---

## Relationship to a reference implementation

A binding referred to here as **the PAL vault profile** implements this extension. It is one conforming implementation of the shape above, not the definition of it — a second implementation could choose different algorithm identifiers entirely and still conform.

The PAL vault profile's concrete algorithm choices:
- Key wrapping: `x25519-sealedbox` (anonymous ECIES over a Curve25519 conversion of the recipient's signing key).
- Content encryption: `xchacha20-poly1305-secretstream`, one independent encrypted stream per entry, all entries under one envelope-wide content key.

### Divergences found during the fixture cross-check, and how they were resolved

Three divergences surfaced while cross-checking this document against the PAL vault profile's own golden fixtures (its round-trip test data and the container shape its serialization step actually produces). None required touching this repo's normative model to hide them; each is resolved and stated explicitly, per the usual UACP contributing rule against silently papering over a spec/implementation gap:

1. **Field naming and timestamp encoding.** The PAL vault profile's current wire form uses camelCase field names (`vaultId`, `wrappedKeys`, `recipientId`, `createdAt`, `factDeltas`, `indexBlob`) and an epoch-millisecond integer for its creation timestamp, rather than this spec's snake_case field names and RFC 3339 / ISO 8601 timestamp string. **Resolution: the spec side was kept normative.** Every other UACP document kind and extension in this repo uses snake_case fields and ISO 8601 timestamps; letting one binding's internal JavaScript-object serialization convention set the public standard's field naming would both break that consistency and make the spec harder to reuse from non-JS implementations. The PAL vault profile's wire format is therefore not yet spec-conformant on this point and needs a follow-up change on that side (field renaming + timestamp reformatting) before it can claim conformance to `uacp-vault-envelope` v1.0.0. This is a non-breaking, additive change for that implementation to make — it does not affect its actual cryptography.
2. **Entry taxonomy.** The PAL vault profile's container has three separate concepts — an array of bundle entries, a separate array of "fact delta" entries (its own last-write-wins conflict-resolution records), and a single opaque "index" blob — where this spec defines two: `bundles[]` and a generic `companion_payloads[]`. **Resolution: the spec side was generalized, not narrowed to match.** Fact-delta/CRDT merge semantics are product-specific conflict-resolution policy, not envelope shape or integrity requirements, so baking that concept into a crypto-agnostic public interchange profile would be out of scope for this extension (and out of scope for issue #96, which asks for the envelope shape only). The mapping is: each of the PAL vault profile's fact-delta entries and its index blob become one `companion_payloads[]` entry each, opaque to this spec either way. If fact-delta/CRDT semantics stabilize enough to standardize, that belongs in its own future extension, not folded into this one.
3. **Algorithm self-description.** The PAL vault profile's wire form carries no algorithm identifier at all — the scheme is implicit and fixed, distinguished only by an outer integer container version. This spec requires explicit `key_wrap.algorithm` and `content_cipher.algorithm` strings, because being crypto-agnostic at the spec level (per issue #96) requires the envelope to be self-describing rather than relying on out-of-band knowledge of "whichever version this was." **Resolution: the spec's requirement was kept as-is; this is reported rather than resolved**, because closing it requires a wire change to the PAL vault profile (adding two constant-valued fields), which is outside this repository's scope to make. It is flagged here as the concrete, minimal change that binding needs to reach conformance: emit `key_wrap: { algorithm: "x25519-sealedbox", ... }` and `content_cipher: { algorithm: "xchacha20-poly1305-secretstream" }` instead of leaving both implicit.

---

## Relationship to core conformance levels

| Level | Vault envelope requirement |
|---|---|
| L1 | No requirement. |
| L2 | No requirement. |
| L3 | No requirement. |

Like `uacp-encryption`, this extension is not required for any core conformance level. If an implementation emits `uacp-vault-envelope` documents, they MUST satisfy the field requirements above and validate against `schema/extensions/uacp-vault-envelope.schema.json`.

---

## Related

- Schema: `schema/extensions/uacp-vault-envelope.schema.json`
- Test vectors: `test-vectors/extensions/vault-envelope/`
- Sibling extension: `spec/extensions/uacp-encryption.md` (single-conversation, passphrase-based envelope)
- Sibling extension: `spec/extensions/uacp-member-set.md` (a different, more prescriptive X25519 per-member key-wrap construction — an example of the trade-off this extension deliberately avoids by staying algorithm-agnostic)
- `CONFORMANCE.md`
- `docs/UACP-BOUNDARY.md`
