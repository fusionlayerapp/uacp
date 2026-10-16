# Identity Key Chain v1

This document defines a minimal identity and device key chain for context sharing.

## §1 — Identifiers

| Field | Type | Notes |
|---|---|---|
| `user_did` | string | Stable DID. RECOMMENDED: `did:key` or `did:web`. |
| `device_id` | string | Stable per device. |
| `public_key` | string | ed25519 public key (encoding chosen by implementation; base64 recommended). |

## §2 — Key Chain Record

```json
{
  "user_did": "did:key:...",
  "device_id": "device-A",
  "public_key": "base64",
  "created_at": "ISO 8601",
  "revoked_at": "ISO 8601 (optional)"
}
```

## §3 — Trust Hierarchy

1. `user_did` is the root of trust.
2. Device keys MUST be signed by the user identity key.
3. Verifiers MUST reject events signed by revoked device keys.

## §4 — Rotation Procedure

1. Create a new device key pair.
2. Publish a new key chain record signed by `user_did`.
3. Mark the old key record with `revoked_at`.
4. Receivers MUST accept events signed by either key until revocation is observed, then MUST reject the revoked key.

