# Scope Key Envelope v1

This document defines the envelope used to distribute and rotate symmetric scope keys.

## §1 — Structure

```json
{
  "scope_id": "uuid",
  "scope_key_id": "uuid",
  "members": [
    {
      "device_id": "string",
      "encrypted_scope_key": "base64"
    }
  ],
  "created_at": "ISO 8601",
  "rotated_at": "ISO 8601 (optional)"
}
```

## §2 — Cryptography

1. `scope_key` is an AES-256 symmetric key.
2. `scope_key` MUST be encrypted per member using X25519 + HKDF (derive a shared secret; derive an encryption key via HKDF).
3. `encrypted_scope_key` is base64 of the encrypted bytes (exact envelope defined by ENCRYPTION-ENVELOPE.md).

Implementations SHOULD rotate `scope_key_id` on membership changes and after suspected compromise.

