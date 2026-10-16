# Scope Key Rotation, Expiry, and Revocation v1

This document extends `SCOPE-KEY-ENVELOPE.md` with rotation, expiry, and revocation semantics for scope key envelopes. Readers MUST be familiar with `SCOPE-KEY-ENVELOPE.md` before applying this document. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## §1 — Extended Scope Key Envelope Fields

The following fields extend the base scope key envelope defined in `SCOPE-KEY-ENVELOPE.md`. All fields are REQUIRED unless marked OPTIONAL.

```json
{
  "scope_key_id": "<uuid>",
  "scope": "conversation:read",
  "issued_to": "<vendor_did>",
  "issued_at": "<ISO 8601>",
  "expires_at": "<ISO 8601>",
  "rotated_from": "<previous_scope_key_id>|null",
  "revoked": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `scope_key_id` | UUID string | REQUIRED | Unique identifier for this key. |
| `scope` | string | REQUIRED | The access scope this key grants (e.g. `conversation:read`). |
| `issued_to` | DID string | REQUIRED | The vendor DID that is the intended recipient of this key. |
| `issued_at` | ISO 8601 string | REQUIRED | UTC timestamp at which this key was issued. |
| `expires_at` | ISO 8601 string | REQUIRED | UTC timestamp at which this key expires. See §2. |
| `rotated_from` | UUID string or `null` | REQUIRED | The `scope_key_id` of the key this one replaces; `null` for initial issuance. |
| `revoked` | boolean | REQUIRED | `true` if this key has been revoked; `false` otherwise. |
| `revoked_at` | ISO 8601 string | OPTIONAL | UTC timestamp of revocation. MUST be present when `revoked` is `true`. |
| `revoked_reason` | string | OPTIONAL | Human-readable explanation of why the key was revoked. |

## §2 — Expiry

`expires_at` is REQUIRED on every scope key envelope. The value MUST be at most 90 days after `issued_at`. Implementations MUST reject scope key envelopes where `expires_at - issued_at > 90 days`.

A scope key whose current UTC time is past `expires_at` MUST be treated as if `revoked` is `true`. Receivers MUST reject events presented with an expired scope key using error code `SCOPE_KEY_EXPIRED`.

## §3 — Rotation

### §3.1 — Rotation API

Issuers MUST expose the following endpoints for scope key lifecycle management:

```
POST <issuer_url>/scope-keys/:id/rotate
```

Rotates the specified key. Returns:
```json
{
  "new_scope_key": { /* ScopeKeyEnvelope */ },
  "old_scope_key_id": "<uuid>"
}
```

The returned `new_scope_key` MUST have `rotated_from` set to the old key's `scope_key_id`.

```
POST <issuer_url>/scope-keys/:id/revoke
Content-Type: application/json

{ "reason": "<string>" }
```

Revokes the specified key permanently. Returns:
```json
{ "ok": true }
```

```
GET <issuer_url>/scope-keys/:id
```

Returns the current `ScopeKeyEnvelope` for the given `scope_key_id`, or HTTP 404 with error `SCOPE_KEY_NOT_FOUND` if not found.

### §3.2 — Rotation Chain Rules

The `rotated_from` field establishes a chain of custody from old keys to new keys. The following rules apply:

1. The rotation chain MUST NOT form a cycle. If following `rotated_from` links would revisit a `scope_key_id` already seen in the chain, the key MUST be rejected with error code `ROTATION_CYCLE_DETECTED`.
2. The rotation chain MUST NOT exceed a depth of 10. A chain longer than 10 links MUST be treated as invalid.

### §3.3 — Grace Period

After a rotation, the old key MUST remain valid for a grace period of exactly 5 minutes from the moment the new key's `issued_at` timestamp. During this grace period, receivers MUST accept events presented with the old key. After the grace period expires, the old key MUST be treated as revoked.

## §4 — Revocation

Revocation is permanent. Once a scope key has `revoked: true`, it MUST NOT be returned to a non-revoked state. There is no un-revoke operation.

Receivers MUST reject events presented with a revoked scope key using error code `SCOPE_KEY_REVOKED`. Receivers MUST NOT fall back to any other key or treat the event as unauthenticated when revocation is detected.

## §5 — Types

```typescript
interface ScopeKeyEnvelope {
  scope_key_id: string;
  scope: string;
  issued_to: string;
  issued_at: string;
  expires_at: string;
  rotated_from?: string | null;
  revoked: boolean;
  revoked_at?: string;
  revoked_reason?: string;
}
```

## §6 — Error Codes

| Code | Description |
|---|---|
| `SCOPE_KEY_EXPIRED` | The scope key's `expires_at` timestamp is in the past. |
| `SCOPE_KEY_REVOKED` | The scope key has been revoked. |
| `SCOPE_KEY_NOT_FOUND` | No scope key exists for the given `scope_key_id`. |
| `ROTATION_CYCLE_DETECTED` | The `rotated_from` chain contains a cycle. |

## §7 — Test Vectors

Conformance implementations MUST pass all cases in `conformance/vectors/scope-key-rotation.json`. The six named cases are:

| Vector name | Description |
|---|---|
| `test_valid_scope_key_accepted` | A non-revoked key with `expires_at` 30 days in the future and no rotation chain. Result: accepted. |
| `test_expired_scope_key_rejected` | A key with `expires_at` in the past. Result: rejected, error `SCOPE_KEY_EXPIRED`. |
| `test_revoked_scope_key_rejected` | A key with `revoked: true` and a valid `expires_at`. Result: rejected, error `SCOPE_KEY_REVOKED`. |
| `test_rotation_grace_period_allows_old_key_5_minutes` | An old key that was rotated 4 minutes ago (within the 5-minute grace period). Result: old key accepted. |
| `test_rotation_cycle_rejected` | Key A has `rotated_from` pointing to key B; key B has `rotated_from` pointing to key A. Result: rejected, error `ROTATION_CYCLE_DETECTED`. |
| `test_revocation_is_permanent` | A key that was revoked and then a `POST /rotate` is attempted on it. Result: the rotate call MUST fail and the key MUST remain revoked. |

## §8 — Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-17 | Initial spec. |
