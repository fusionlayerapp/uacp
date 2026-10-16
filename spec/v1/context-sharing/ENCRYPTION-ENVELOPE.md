# Encryption Envelope v1

This document defines the encryption envelope used for encrypted payloads in context sharing.

## §1 — Algorithms

1. Symmetric encryption: AES-256-GCM.
2. Key exchange: X25519 ECDH for device-to-device shared secrets.
3. Password-derived keys (when used): Argon2id.

## §2 — Envelope

```json
{
  "algorithm": "AES-256-GCM",
  "kdf": "Argon2id",
  "iv": "base64 (12 bytes)",
  "ciphertext": "base64",
  "auth_tag": "base64 (16 bytes)",
  "kdf_params": {
    "time": 3,
    "memory": 65536,
    "parallelism": 1,
    "salt": "base64"
  }
}
```

Rules:

1. `iv` MUST be 12 bytes before base64 encoding.
2. `auth_tag` MUST be 16 bytes before base64 encoding.
3. KDF parameters MUST be recorded exactly for decryption.

