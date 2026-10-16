# UACP Ed25519 Signing Sub-Spec — U1

**Issue:** hn2/uacp#69  
**Status:** Spec — V2 feature, implementation tracked separately

---

## Overview

UACP v2 requires Ed25519 author verification for context-sharing events. Vendors and operators publishing UACP events must sign them with registered keys. This spec defines the signing format, key registry protocol, and validation rules.

---

## Signed Event Shape

```json
{
  "type": "CONVERSATION",
  "schema_version": "2.0",
  "signature": {
    "alg": "ed25519",
    "key_id": "<key_id>",
    "value": "<base64url Ed25519 signature>"
  }
}
```

The `signature.value` field is the Ed25519 signature over the canonical JSON bytes of the event **with the `signature` field removed** (sign the payload only).

Canonical JSON: RFC 8785 (JSON Canonicalization Scheme — JCS). All implementations MUST use JCS before signing or verifying.

---

## API

```
// Publisher
sign_event(event: UACPEvent, private_key_hex: string) → UACPEvent (with signature added)

// Verifier
verify_event(event: UACPEvent, key_registry_url: string) → VerifyResult

// Key Registry
GET <key_registry_url>/keys/:key_id
→ 200 { key_id, public_key_hex, owner_did, revoked, revoked_at? }
→ 404 { error: "KEY_NOT_FOUND" }
```

---

## Schema / Types

```typescript
interface UACPSignature {
  alg: 'ed25519';
  key_id: string;
  value: string;     // base64url(Ed25519 signature)
}

interface SigningKey {
  key_id: string;          // opaque identifier, URL-safe
  public_key_hex: string;  // 32-byte Ed25519 public key, lowercase hex
  owner_did: string;       // DID of the key owner (vendor or operator)
  revoked: boolean;
  revoked_at?: string;     // ISO 8601, present only if revoked: true
}

interface VerifyResult {
  valid: boolean;
  key_id?: string;
  reason?: 'SIGNATURE_INVALID' | 'KEY_REVOKED' | 'KEY_NOT_FOUND' | 'SIGNATURE_REQUIRED' | 'UNKNOWN_ALGORITHM';
}
```

---

## Validation Rules

1. Parse `signature.alg` — if unknown, reject with `UNKNOWN_ALGORITHM` (never ignore future values)
2. Look up `signature.key_id` in the key registry — if 404, reject with `KEY_NOT_FOUND`
3. Check `revoked` — if true, reject with `KEY_REVOKED` (no fallback)
4. Compute canonical JSON of event with `signature` field removed (JCS)
5. Verify Ed25519 signature — if fails, reject with `SIGNATURE_INVALID`

---

## Backwards Compatibility

| Mode | Missing `signature` field |
|------|--------------------------|
| V1 compatibility | Accepted (unsigned events valid) |
| V2 strict mode | Rejected with `SIGNATURE_REQUIRED` |

Consumers MUST advertise their mode via the `X-UACP-Mode: v1-compat | v2-strict` header (or equivalent negotiation mechanism per version negotiation spec).

---

## Key Registry Availability

| Registry state | V1 compat behavior | V2 strict behavior |
|---------------|-------------------|-------------------|
| Reachable | Verify normally | Verify normally |
| Unreachable | Fail open (accept event) | Fail closed (reject event) |

Registry timeout: 2 seconds maximum. Cache registry responses for 60 seconds.

---

## Error Model

| Code | HTTP | Message |
|------|------|---------|
| `SIGNATURE_INVALID` | 400 | "Event signature verification failed" |
| `KEY_REVOKED` | 400 | "Signing key has been revoked" |
| `KEY_NOT_FOUND` | 400 | "Signing key not found in registry" |
| `SIGNATURE_REQUIRED` | 400 | "Event signature is required in strict mode" |
| `UNKNOWN_ALGORITHM` | 400 | "Unknown signing algorithm" |

---

## Named Tests

- `test_valid_ed25519_signature_accepts_event`
- `test_tampered_event_rejects`
- `test_revoked_key_rejects_event`
- `test_missing_signature_accepted_in_v1_mode`
- `test_missing_signature_rejected_in_v2_strict`
- `test_unknown_algorithm_rejects`
- `test_registry_unreachable_fails_open_v1_fails_closed_v2`

---

## Scope

**In:**
- Signing function (publisher side)
- Verification function (receiver side)
- Key registry GET protocol
- Error codes and messages

**Out:**
- Key generation tooling (separate issue)
- Key registry server implementation (infrastructure)
- DID resolution (integration point, not core UACP)
- Operator onboarding flow

---

*V2 feature. Do not implement in V1 paths.*
