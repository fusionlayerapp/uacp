# Signing Key Registry v1

This document specifies the Ed25519 signing key registry sub-protocol for UACP. It is a companion to `SIGNED-EVENT-ENVELOPE.md`, which defines the signed event envelope format. This document covers key registration, lookup, revocation, and the verification procedure. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## §1 — Signature Field Reference

The `signature` field embedded in a signed UACP event has the following shape (defined in full in `SIGNED-EVENT-ENVELOPE.md`):

```json
{
  "type": "CONVERSATION",
  "signature": {
    "alg": "ed25519",
    "key_id": "<key_id>",
    "value": "<base64url encoded signature>"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `alg` | string | MUST be the literal string `"ed25519"`. Any other value MUST be rejected with `UNKNOWN_ALGORITHM`. |
| `key_id` | string | Identifier of the signing key. Used to retrieve the public key from the registry. |
| `value` | string | Base64url-encoded (no padding) Ed25519 signature over the canonical form of the event (see §3). |

## §2 — Key Registry API

The key registry is hosted by the event issuer or their designated key infrastructure. Receivers resolve keys at:

```
GET <key_registry_url>/keys/:key_id
```

Returns a `SigningKey` object:

```json
{
  "key_id": "string",
  "public_key_hex": "string",
  "owner_did": "string",
  "revoked": false,
  "revoked_at": null
}
```

If the key does not exist the registry MUST return HTTP 404. Receivers MUST treat an HTTP 404 response as error code `KEY_NOT_FOUND`.

## §3 — Types

```typescript
interface UACPSignature {
  alg: 'ed25519';
  key_id: string;
  value: string; // base64url, no padding
}

interface SigningKey {
  key_id: string;
  public_key_hex: string; // 64 hex characters (32 bytes)
  owner_did: string;
  revoked: boolean;
  revoked_at?: string; // ISO 8601; MUST be present when revoked is true
}
```

## §4 — Canonical JSON and Signing Procedure

### §4.1 — Canonical JSON

UACP uses RFC 8785 (JSON Canonicalization Scheme) as the canonical JSON representation. Implementations MUST produce and verify signatures over the RFC 8785 serialization of the event object.

### §4.2 — Signing

1. Construct the complete event object including all fields except `signature`.
2. Serialize the event (without the `signature` field) using RFC 8785 canonical JSON.
3. Sign the resulting UTF-8 byte string using the Ed25519 private key.
4. Encode the 64-byte signature as base64url (no padding) and set `signature.value`.
5. Set `signature.alg` to `"ed25519"` and `signature.key_id` to the identifier of the signing key.

### §4.3 — Verification

Receivers MUST verify signatures as follows:

1. Extract the `signature` field from the event and remove the `signature` field from the event object.
2. Serialize the remaining event object using RFC 8785 canonical JSON.
3. Retrieve the `SigningKey` from the key registry using `signature.key_id`.
4. If the key is revoked, reject with `KEY_REVOKED`. Do NOT fall back to treating the event as unsigned.
5. Decode `public_key_hex` to 32 raw bytes.
6. Decode `signature.value` from base64url to 64 raw bytes.
7. Verify the Ed25519 signature over the canonical JSON bytes using the public key bytes.
8. If verification fails, reject with `SIGNATURE_INVALID`.

## §5 — Missing Signature Handling

### §5.1 — v1 Compatibility Mode

In v1 compatibility mode, a UACP event that omits the `signature` field entirely MUST be accepted. The receiver MUST process the event without signature verification and MUST NOT return an error solely because the `signature` field is absent.

### §5.2 — v2 Strict Mode

In v2 strict mode, a UACP event that omits the `signature` field MUST be rejected with error code `SIGNATURE_REQUIRED`. The mode is determined by the receiver's configured version policy (see `VERSIONING.md`).

## §6 — Registry Reachability

| Mode | Registry unreachable |
|---|---|
| v1 compatibility | Fail open: accept the event and process without signature verification. |
| v2 strict | Fail closed: reject the event with `KEY_NOT_FOUND`. |

Implementations MUST document which mode they operate in.

## §7 — Unknown Algorithm Rejection

Validators MUST reject any event whose `signature.alg` value is not `"ed25519"` with error code `UNKNOWN_ALGORITHM`. Validators MUST NOT silently ignore an unknown `alg` value or treat it as equivalent to no signature.

## §8 — Error Codes

| Code | Description |
|---|---|
| `SIGNATURE_INVALID` | The Ed25519 signature did not verify against the canonical event bytes and the retrieved public key. |
| `KEY_REVOKED` | The signing key identified by `key_id` has been revoked. |
| `KEY_NOT_FOUND` | No key exists in the registry for the given `key_id`. |
| `SIGNATURE_REQUIRED` | The event is missing the `signature` field and the receiver is operating in v2 strict mode. |
| `UNKNOWN_ALGORITHM` | The `signature.alg` value is not a supported algorithm. |

## §9 — Test Vectors

Conformance implementations MUST pass all cases in `conformance/vectors/signing-key-registry.json`. The six named cases are:

| Vector name | Description |
|---|---|
| `test_valid_ed25519_signature_accepts_event` | An event with a valid Ed25519 signature whose key is registered and not revoked. Result: accepted. |
| `test_tampered_event_rejects` | An event with a valid signature over the original payload, but the payload has been modified after signing. Result: rejected, error `SIGNATURE_INVALID`. |
| `test_revoked_key_rejects_event` | An event with an otherwise valid signature, but the signing key has `revoked: true` in the registry. Result: rejected, error `KEY_REVOKED`. The receiver MUST NOT fall back to unsigned processing. |
| `test_missing_signature_accepted_in_v1_mode` | An event with no `signature` field, receiver in v1 compatibility mode. Result: accepted. |
| `test_missing_signature_rejected_in_v2_strict` | An event with no `signature` field, receiver in v2 strict mode. Result: rejected, error `SIGNATURE_REQUIRED`. |
| `test_unknown_algorithm_rejects` | An event with `signature.alg` set to `"rsa2048"`. Result: rejected, error `UNKNOWN_ALGORITHM`. |

## §10 — Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-17 | Initial spec. |
