# UACP Scope-Key Envelope Rotation — U8 Spec

**Issue:** hn2/uacp#76  
**Status:** Spec — implementation tracked separately

---

## Overview

UACP scope keys grant vendors access to shared context. This spec defines the scope-key envelope format, rotation protocol, expiry semantics, and revocation rules.

---

## Scope Key Envelope

```json
{
  "scope_key_id": "<uuid>",
  "scope": "conversation:read",
  "issued_to": "<vendor_did>",
  "issued_at": "2026-05-16T00:00:00Z",
  "expires_at": "2026-08-14T00:00:00Z",
  "rotated_from": null,
  "revoked": false
}
```

### API

```
// Rotation
POST <issuer_url>/scope-keys/:id/rotate
→ 200 { new_scope_key: ScopeKeyEnvelope; old_scope_key_id: string }

// Revocation
POST <issuer_url>/scope-keys/:id/revoke
  body: { reason: string }
→ 200 { ok: boolean }

// Verification
GET <issuer_url>/scope-keys/:id
→ 200 ScopeKeyEnvelope
→ 404 { error: "SCOPE_KEY_NOT_FOUND" }
```

---

## Schema / Types

```typescript
interface ScopeKeyEnvelope {
  scope_key_id: string;       // UUIDv4
  scope: string;              // e.g. 'conversation:read', 'context:write'
  issued_to: string;          // vendor DID
  issued_at: string;          // ISO 8601
  expires_at: string;         // max 90 days from issued_at; required, no nulls
  rotated_from?: string;      // scope_key_id of predecessor key
  revoked: boolean;
  revoked_at?: string;        // ISO 8601, present only if revoked: true
  revoked_reason?: string;
}
```

---

## Validation Rules

1. **Expiry check**: if `now > expires_at`, treat as revoked (reject even if `revoked: false`)
2. **Revocation check**: if `revoked: true`, reject with `SCOPE_KEY_REVOKED`
3. **Existence**: if key not found in issuer registry, reject with `SCOPE_KEY_NOT_FOUND`
4. **Max expiry**: issuers MUST NOT issue keys with `expires_at > issued_at + 90 days`

---

## Rotation Protocol

When a scope key is rotated:
- A new `ScopeKeyEnvelope` is issued with `rotated_from = old_scope_key_id`
- The old key remains valid for **5 minutes** (grace period for in-flight events)
- After the grace period, the old key is marked revoked automatically

### Rotation chain constraints
- `rotated_from` links form a chain; max depth = 10
- Cycles are forbidden; issuers MUST reject rotation requests that create a cycle (`ROTATION_CYCLE_DETECTED`)

---

## Revocation

- Revocation is permanent: once `revoked: true`, it cannot be set back to `false`
- Revocation reason is stored for audit purposes
- Revocation propagates immediately — no grace period

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Expired key (`now > expires_at`) | Rejected with `SCOPE_KEY_EXPIRED`, even if `revoked: false` |
| Revoked key | Rejected with `SCOPE_KEY_REVOKED` |
| Rotation creates a cycle | Issuer returns 422 `ROTATION_CYCLE_DETECTED` |
| Old key during 5-min grace | Accepted for in-flight events |
| Chain depth > 10 | Issuers reject further rotation with 422 |

---

## Error Model

| Code | HTTP | Message |
|------|------|---------|
| `SCOPE_KEY_EXPIRED` | 400 | "Scope key has expired — request a new key from the issuer" |
| `SCOPE_KEY_REVOKED` | 400 | "Scope key has been revoked" |
| `SCOPE_KEY_NOT_FOUND` | 400 | "Scope key not found" |
| `ROTATION_CYCLE_DETECTED` | 422 | "Scope key rotation chain contains a cycle" |

---

## Named Tests

- `test_valid_scope_key_accepted`
- `test_expired_scope_key_rejected`
- `test_revoked_scope_key_rejected`
- `test_rotation_grace_period_allows_old_key_5_minutes`
- `test_rotation_cycle_rejected`
- `test_revocation_is_permanent`
- `test_max_expiry_90_days_enforced`

---

## Scope

**In:**
- `ScopeKeyEnvelope` type definition
- Rotation protocol (POST /rotate)
- Revocation protocol (POST /revoke)
- Verification lookup (GET /scope-keys/:id)
- Grace period on rotation
- Cycle detection

**Out:**
- Issuer server implementation (infrastructure)
- Key storage backend (separate concern)
- Scope key issuance flow (separate spec)
- Cross-issuer federation (post-V2)
