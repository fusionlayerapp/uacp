# uacp-encryption — Encrypted Envelope Extension

**Status:** Optional extension  
**Version:** 0.5.0  
**Identifier:** `uacp-encryption`  
**Schema:** `schema/extensions/uacp-encryption.schema.json`

---

## Overview

`uacp-encryption` is an optional UACP extension that defines an envelope format for encrypting UACP Conversation Objects at rest or in transit.

Encryption is NOT a core UACP concern. Implementations that do not encrypt at the UACP layer never use this format. Implementations that do encrypt may choose their own approach; this extension provides a canonical, interoperable envelope format.

---

## Encrypted Envelope Format

When a conversation is encrypted, it is wrapped in an envelope object:

```json
{
  "uacp_encrypted": "0.5.0",
  "algorithm": "aes-256-gcm",
  "iv": "a1b2c3d4e5f60708090a0b0c",
  "auth_tag": "112233445566778899aabbccddeeff00",
  "ciphertext": "...",
  "aad": "",
  "key_derivation": {
    "method": "argon2id+hkdf",
    "salt": "dGVzdC1zYWx0LTE2Yg",
    "argon2id": { "m": 65536, "t": 3, "p": 1, "output_length": 32 },
    "hkdf":     { "hash": "sha256", "output_length": 32 },
    "info":     "uacp-key-v1"
  }
}
```

The envelope is a top-level object distinct from a conversation object. Its presence is signaled by the `uacp_encrypted` field.

---

## Field requirements (normative)

- `uacp_encrypted` — semver string identifying the UACP version of the inner conversation.
- `algorithm` — MUST be `"aes-256-gcm"`.
- `iv` — lowercase hex, exactly 24 characters (12 bytes / 96 bits). Implementations MUST use a fresh, uniformly random IV per `(key, ciphertext)` pair. Reuse is a critical security defect.
- `auth_tag` — lowercase hex, exactly 32 characters (16 bytes / 128 bits). Full GCM tag, not truncated.
- `ciphertext` — lowercase hex, non-empty.
- `aad` — lowercase hex. If omitted or empty, implementations MUST use, as AAD, the UTF-8 bytes of: `uacp_encrypted + ":" + key_derivation.info` (e.g. `"0.5.0:uacp-key-v1"`). This binds envelope metadata to the plaintext and prevents downgrade.
- `key_derivation.salt` — base64url (RFC 4648 §5); decoded length MUST be ≥ 16 bytes.
- `key_derivation.argon2id.{m, t, p, output_length}` — MUST be `{65536, 3, 1, 32}`. A future version that changes these MUST also change `info`.
- `key_derivation.hkdf.hash` — MUST be `"sha256"`. `output_length` MUST be `32`.
- `key_derivation.info` — MUST be `"uacp-key-v1"` for this extension version.

---

## Key derivation

```
master_key  = argon2id(passphrase, salt, m=65536, t=3, p=1, output=32)
content_key = HKDF-SHA256(ikm=master_key, salt=salt, info="uacp-key-v1", L=32)
ciphertext || auth_tag = AES-256-GCM(key=content_key, iv=iv, aad=aad, plaintext=JCS(conversation))
```

The `ciphertext` decrypts to a **canonicalized** UACP Conversation Object (JCS — RFC 8785: UTF-8, sorted keys, no insignificant whitespace) so that byte-level round-trip is deterministic.

Implementations MUST NOT pad plaintext. Implementations SHOULD NOT leak message count via envelope size; if padding is desired it MUST be applied to the canonicalized plaintext before encryption.

---

## Conformance

To conform to the `uacp-encryption` extension:

- All encrypted envelopes emitted by the implementation MUST satisfy the field requirements above.
- Implementations MUST validate envelopes against `schema/extensions/uacp-encryption.schema.json`.
- Implementations SHOULD declare extension support in their conformance documentation.

---

## Relationship to core conformance levels

| Level | Encryption requirement |
|-------|------------------------|
| L1 | No requirement. Implementations need not support encryption. |
| L2 | No requirement. |
| L3 | If the implementation emits encrypted envelopes, they MUST conform to this extension. |

Encryption is not required for any conformance level. It is an opt-in capability.

---

## Related

- Schema: `schema/extensions/uacp-encryption.schema.json`
- Test vectors: `test-vectors/extensions/encryption/`
- Privacy classification: see "Privacy metadata convention" in README §10.
- CONFORMANCE.md
