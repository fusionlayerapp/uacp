# uacp-identity-chain — Identity and Device Key Chain Extension

**Status:** Optional extension  
**Version:** 0.1.0  
**Identifier:** `uacp-identity-chain`  
**Schemas:**
- `schema/extensions/uacp-identity-key.schema.json`
- `schema/extensions/uacp-device-registration.schema.json`
- `schema/extensions/uacp-device-retirement.schema.json`

---

## Overview

`uacp-identity-chain` defines the two-level key hierarchy used to authenticate events in the `uacp-sync-event` extension. A user holds one stable identity key pair. Each of their devices holds a device key pair. The identity key certifies device keys through signed `DeviceRegistration` records. Every `Event` is signed by a device key; receivers verify both levels of the chain.

---

## Types

### IdentityKey

Represents the public half of a user's identity key pair. The private key is never serialized.

| Field | Type | Constraints |
|-------|------|-------------|
| `public` | string | Ed25519 raw public key (32 bytes), base64url-encoded without padding. Exactly 43 characters. |
| `user_id` | string | RFC 4122 v4 UUID. Stable identifier tying this key to billing and membership. |

One identity key per user. Identity key rotation is out of scope for version 0.5.

### DeviceRegistration

Binds a device public key to a user identity. The identity key owner signs over all fields except `signature` using the canonical CBOR encoding defined below.

| Field | Type | Constraints |
|-------|------|-------------|
| `device_id` | string | RFC 4122 v4 UUID identifying this device. |
| `device_public_key` | string | Ed25519 raw public key (32 bytes), base64url-encoded without padding. Exactly 43 characters. |
| `registered_at` | integer | Milliseconds since Unix epoch. Must be >= 0. |
| `device_label` | string | User-chosen label, e.g. "Desktop". 1–128 characters. |
| `registered_by` | string | Identity public key (32 bytes, base64url) of the registering user. Exactly 43 characters. |
| `signature` | string | Ed25519 signature (64 bytes, base64url) by `registered_by` over canonical CBOR of all fields except `signature`. Exactly 86 characters. |

### DeviceRetirement

Records the permanent retirement of a device key. The identity key owner signs this record.

| Field | Type | Constraints |
|-------|------|-------------|
| `device_id` | string | RFC 4122 v4 UUID of the device being retired. |
| `retired_at` | integer | Milliseconds since Unix epoch when this device was retired. Must be >= 0. |
| `retired_by` | string | Identity public key (32 bytes, base64url) of the retiring user. Exactly 43 characters. |
| `signature` | string | Ed25519 signature (64 bytes, base64url) by `retired_by` over canonical CBOR of all fields except `signature`. Exactly 86 characters. |

---

## Normative rules

The key word "MUST" means that a conforming implementation is required to satisfy the rule. "SHOULD" means recommended but not required.

**N-1.** Every `Event` MUST be signed by a device key. The event `signature` covers the canonical CBOR of all event fields except `signature` itself (see `uacp-sync-event` spec for event CBOR encoding).

**N-2.** A receiver MUST verify the event in two steps:
1. Verify the event `signature` against the `device_public_key` of the `DeviceRegistration` whose `device_id` matches `author_device_id`.
2. Verify the `DeviceRegistration.signature` against the `IdentityKey.public` whose `user_id` matches `author_user_id`.

Both checks MUST pass for the event to be accepted.

**N-3.** A user MUST have exactly one active identity key. Multiple device keys (1..N) are allowed.

**N-4.** Retiring a device MUST emit a `DeviceRetirement` record signed by the user's identity key.

**N-5.** An event with `timestamp` strictly greater than `DeviceRetirement.retired_at` for its `author_device_id` MUST be rejected.

**N-6.** Family-scope parental-control keys are NOT identity keys. They operate at scope level under FusionLayer governance and are out of scope for this extension.

---

## Error codes

| Code | Condition |
|------|-----------|
| `DEVICE_NOT_REGISTERED` | `author_device_id` has no `DeviceRegistration` in the known registration set. |
| `DEVICE_RETIRED` | A `DeviceRetirement` exists for `author_device_id` and `event.timestamp > retirement.retired_at`. |
| `IDENTITY_SIGNATURE_INVALID` | The `DeviceRegistration.signature` fails verification against the identity public key. |

The `uacp-sync-event` error `INVALID_SIGNATURE` is used when the event signature itself fails verification.

---

## CBOR canonical encoding

Signatures cover the canonical CBOR encoding of the relevant fields. The encoding follows RFC 8949.

### DeviceRegistration signing payload

Fields in this exact order, `signature` excluded:

| Position | Field | CBOR type |
|----------|-------|-----------|
| 1 | `device_id` | text string |
| 2 | `device_public_key` | byte string (decoded from base64url) |
| 3 | `registered_at` | unsigned integer |
| 4 | `device_label` | text string |
| 5 | `registered_by` | byte string (decoded from base64url) |

Encoded as a CBOR map with 5 entries, keys in the order listed. Keys are encoded as CBOR text strings.

### DeviceRetirement signing payload

Fields in this exact order, `signature` excluded:

| Position | Field | CBOR type |
|----------|-------|-----------|
| 1 | `device_id` | text string |
| 2 | `retired_at` | unsigned integer |
| 3 | `retired_by` | byte string (decoded from base64url) |

Encoded as a CBOR map with 3 entries, keys in the order listed. Keys are encoded as CBOR text strings.

### Encoding rules

- Maps use the explicit ordering given above (not RFC 8949 §4.2.1 canonical order); the spec-defined field order IS the canonical order for these outer maps.
- For inner maps (e.g., `vector_clock` in events), RFC 8949 §4.2.1 length-first lexicographic key order applies.
- Unsigned integers use the shortest encoding (major type 0 with appropriate additional info byte).
- No indefinite-length items.
- No CBOR tags.

---

## Scenario mapping

| Scenario | Fixture | Description |
|----------|---------|-------------|
| 1 | `01-single-device-valid.json` | Single device registers, signs event, verifies. |
| 3 | `02-five-devices-one-identity.json` | Five devices share one identity key; event from device 3 verifies. |
| 7 | `03-two-identity-chain.json` | Two separate identities; each device chains to its own identity key. |
| 10 | `04-family-identities.json` | Four identities (two parents, two children); event from a child device verifies. |
| Neg-1 | `negative-01-device-not-registered.json` | Event references unknown device_id. |
| Neg-2 | `negative-02-device-retired.json` | Event timestamp after device retirement. |
| Neg-3 | `negative-03-identity-signature-invalid.json` | DeviceRegistration signature is tampered. |

---

## Conformance fixture format

Fixtures are JSON files with the following structure:

```json
{
  "fixture_id": "<filename without .json>",
  "description": "<human-readable description>",
  "expected": "<valid | DEVICE_NOT_REGISTERED | DEVICE_RETIRED | IDENTITY_SIGNATURE_INVALID>",
  "identity_keys": [
    { "user_id": "<uuid>", "public": "<43-char base64url>" }
  ],
  "registrations": [
    { "device_id": "...", "device_public_key": "...", "registered_at": 0, "device_label": "...", "registered_by": "...", "signature": "..." }
  ],
  "retirements": [
    { "device_id": "...", "retired_at": 0, "retired_by": "...", "signature": "..." }
  ],
  "event": { "<sync event object>" }
}
```

`retirements` may be an empty array when no retirements apply to the scenario. `identity_keys`, `registrations`, and `event` are always present.

---

## Related

- Schema: `schema/extensions/uacp-identity-key.schema.json`
- Schema: `schema/extensions/uacp-device-registration.schema.json`
- Schema: `schema/extensions/uacp-device-retirement.schema.json`
- Test vectors: `test-vectors/extensions/identity-chain/`
- Generation script: `scripts/generate-identity-chain-vectors.js`
- Sync event spec: `spec/extensions/uacp-sync-event.md`
- Arch reference: §4.2, §7.2
- Epic: hn2/uacp#35
