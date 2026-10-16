# uacp-event-payload — Encryption Envelope for Sync-Event Payloads

**Status:** Optional extension  
**Version:** 0.6.0  
**Epic:** #35  
**Architecture references:** §4.2, §11  
**Schema:** `schema/extensions/uacp-event-payload.schema.json`  
**Schema identifier:** `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-event-payload`

---

## Overview

`uacp-event-payload` defines the encryption envelope used to protect the `payload` field inside a UACP sync event. The envelope algorithm is AES-256-GCM with a 96-bit nonce, a 128-bit GCM authentication tag, and CBOR-encoded canonical Additional Authenticated Data (AAD).

This extension is separate from `uacp-encryption` (which encrypts an entire conversation object at rest). `uacp-event-payload` operates at the event level, within the sync protocol, so that individual events can be decrypted independently by authorised members without exposing the full conversation history.

---

## EncryptedPayload Format

```json
{
  "algorithm":  "AES-256-GCM",
  "nonce":      "YWJjZGVmZ2hpamts",
  "ciphertext": "4Kz...",
  "tag":        "AAECBAUGB...",
  "aad": {
    "conversation_id":  "30000000-0000-4000-8000-000000000001",
    "event_id":         "e0000000-0000-4000-8000-000000000001",
    "parent_event_id":  null,
    "scope_id":         "40000000-0000-4000-8000-000000000001",
    "author_user_id":   "10000000-0000-4000-8000-000000000001",
    "author_device_id": "20000000-0000-4000-8000-000000000001",
    "timestamp":        1700000000000
  }
}
```

### Field definitions

| Field        | Type              | Encoding              | Description |
|--------------|-------------------|-----------------------|-------------|
| `algorithm`  | string (const)    | —                     | MUST be `"AES-256-GCM"`. |
| `nonce`      | bytes(12)         | base64url, no padding | 96-bit random nonce. MUST be unique per `(scope_key, message)`. |
| `ciphertext` | bytes             | base64url, no padding | GCM ciphertext of the plaintext payload. |
| `tag`        | bytes(16)         | base64url, no padding | 128-bit GCM authentication tag. MUST NOT be truncated. |
| `aad`        | CanonicalAAD      | JSON object           | Envelope metadata. CBOR-encoded before passing to GCM. |
| `kdf`        | KDFParams         | JSON object           | Optional. Present only for passphrase-derived keys (personal scopes / device backup). Absent for shared scopes. |

---

## CanonicalAAD

```
CanonicalAAD {
  conversation_id:  UUID
  event_id:         UUID
  parent_event_id:  UUID | null
  scope_id:         UUID
  author_user_id:   UUID
  author_device_id: UUID
  timestamp:        uint64   (milliseconds since Unix epoch)
}
```

### CBOR encoding

The AAD is CBOR-encoded deterministically before being passed to AES-256-GCM. Implementations MUST encode the outer map with fields in exactly the order listed above (same convention as the sync-event CBOR encoding).

CBOR conventions:
- Outer structure: definite-length map (major type 5), 7 entries.
- Map keys: UTF-8 text strings (major type 3).
- UUID values: UTF-8 text strings in standard hyphenated lowercase format (e.g. `"30000000-0000-4000-8000-000000000001"`).
- `parent_event_id` when null: CBOR null (0xf6).
- `timestamp`: unsigned integer (major type 0). MUST fit in uint64.

Field encoding order:
1. `conversation_id`
2. `event_id`
3. `parent_event_id`
4. `scope_id`
5. `author_user_id`
6. `author_device_id`
7. `timestamp`

The CBOR bytes are passed directly as the `aad` argument to AES-256-GCM. The `aad` JSON object in the `EncryptedPayload` stores the decoded field values so receivers can reconstruct the canonical CBOR encoding and verify the tag.

---

## Nonce Requirements (normative)

- Nonces MUST be 96-bit (12 bytes) uniformly random values.
- Nonces MUST be unique per `(scope_key, message)`. Nonce reuse under the same key is a critical security defect.
- Receivers MUST track observed nonces and reject any ciphertext with a duplicate nonce (`NONCE_REUSE_DETECTED`).
- Nonces are stored and transmitted as base64url-encoded strings without padding (exactly 16 characters).

---

## GCM Tag Handling (normative)

- The GCM authentication tag MUST be 128 bits (16 bytes). Tag truncation is not permitted.
- Implementations MUST reject any ciphertext where GCM tag verification fails (`DECRYPT_FAILED`).
- GCM tag verification implicitly covers both the ciphertext and the AAD. A tampered ciphertext or mismatched AAD will both cause tag failure.

---

## Key Derivation

### Shared scopes

For shared scopes, the scope key is a 256-bit symmetric key distributed to each authorised member via X25519-AES256GCM key encapsulation. See the member-set specification (issue #39) for key distribution details. No `kdf` field is present in the envelope.

### Personal scopes and device backup (passphrase-derived keys)

When a scope key is derived from a user passphrase, Argon2id is used:

```
scope_key = Argon2id(passphrase, salt, m=262144, t=3, p=4, output=32)
```

Parameters:
- `m` = 262144 KiB (256 MiB memory cost)
- `t` = 3 (iterations)
- `p` = 4 (parallelism)
- Output length: 32 bytes (256 bits)
- Salt: 16 random bytes, stored base64url (without padding, 22 characters) in the `kdf.salt` field.

The `kdf` object MUST be stored alongside the `EncryptedPayload` when a passphrase-derived key is used, so the receiver can reproduce the key derivation.

Floor enforcement: implementations MUST reject Argon2id parameters below the floor (`KDF_PARAMS_REJECTED`):
- `m` < 262144
- `t` < 3
- `p` < 4

---

## AAD Mismatch Detection

Before attempting decryption, implementations SHOULD compare the `aad` fields against the enclosing sync event's metadata fields. If any field differs (e.g. `scope_id` in the payload `aad` does not match the event's `scope_id`), implementations MUST reject with `AAD_MISMATCH` without proceeding to decryption.

Even without pre-decryption checking, a mismatched AAD will cause GCM tag verification to fail, since the computed canonical CBOR will differ from the bytes used during encryption.

---

## Error Codes

| Code                   | Condition |
|------------------------|-----------|
| `DECRYPT_FAILED`       | GCM authentication tag verification failed (tampered ciphertext or mismatched AAD). |
| `NONCE_REUSE_DETECTED` | The same nonce has been observed previously under the same scope key. |
| `AAD_MISMATCH`         | The `aad` fields in the envelope do not match the enclosing event's metadata fields. Detected before decryption. |
| `KDF_PARAMS_REJECTED`  | Argon2id parameters are below the required floor. |

---

## Conformance Test Scenarios

| Scenario | Description |
|----------|-------------|
| Scenario 1  | Encrypt/decrypt round-trip using a scope key (private scope). |
| Scenario 7  | Payload encrypted once; two members each decrypt independently using the same shared scope key. |
| Scenario 14 | Ciphertext created at timestamp T; decryption at T+3 600 000 ms succeeds. Decryption is timestamp-independent. |
| Negative 1  | Flipping one byte in `ciphertext` causes `DECRYPT_FAILED`. |
| Negative 2  | Swapping `aad.scope_id` with a different UUID causes `AAD_MISMATCH` (detected before decryption). |

---

## Related

- Schema: `schema/extensions/uacp-event-payload.schema.json`
- Test vectors: `test-vectors/extensions/event-payload/`
- Generation script: `scripts/generate-event-payload-vectors.js`
- Older conversation-level encryption: `schema/extensions/uacp-encryption.schema.json`
- Member-set key distribution: issue #39
- Sync event format: `spec/extensions/uacp-sync-event.md`
- `CONFORMANCE.md`
