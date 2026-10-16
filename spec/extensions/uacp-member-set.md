# uacp-member-set — Member Set and Scope Key Envelope Extension

**Status:** Optional extension  
**Version:** 0.6.0  
**Identifier:** `uacp-member-set`  
**Schema:** `schema/extensions/uacp-member-set.schema.json`

---

## Overview

`uacp-member-set` defines a versioned, cryptographically signed membership roster for a UACP scope. It carries the current set of members, their roles, and a scope key encrypted to each member via X25519 key exchange. Every membership change (add or remove) produces a new MemberSet with an incremented version and a freshly rotated scope key.

---

## Data Types

### MemberSet

The top-level object.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope_id` | UUID v4 | yes | Identifies the scope this membership applies to. |
| `members` | array of Member | yes | Current member list. At least one member required. |
| `scope_key` | ScopeKeyEnvelope | yes | Scope key encrypted to each current member. |
| `version` | uint64 | yes | Monotonically increasing counter. Starts at 0. |
| `signature` | bytes(64), base64url | yes | Ed25519 signature by the scope admin's identity key over canonical CBOR of all fields except `signature`. |

### Member

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identity_public_key` | bytes(32), base64url | yes | Ed25519 public key of the member (used for signature verification). |
| `role` | string enum | yes | One of: `owner`, `admin`, `lead`, `member`, `guest`, `parent`, `child`, `external`. |
| `joined_at` | uint64 | yes | Unix timestamp in milliseconds when the member joined. |
| `joined_via_event_id` | UUID v4 | yes | ID of the event that caused this member to join the scope. |

### ScopeKeyEnvelope

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `algorithm` | string | yes | MUST be `"X25519-AES256GCM"`. |
| `encrypted_key_per_member` | array of EncryptedKeyEntry | yes | One entry per member. At least one entry required. |

### EncryptedKeyEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient_identity_key` | bytes(32), base64url | yes | X25519 public key of the recipient (used for key exchange). |
| `ciphertext` | bytes, base64url | yes | AES-256-GCM encrypted scope key (32 bytes plaintext → 32 bytes ciphertext + 16 bytes auth tag appended). |
| `nonce` | bytes(12), base64url | yes | AES-256-GCM nonce (12 bytes, 16 base64url chars). |

---

## Role Enumeration (normative)

The `role` field MUST be exactly one of these eight values:

| Value | Meaning |
|-------|---------|
| `owner` | Scope creator; full control including deletion. |
| `admin` | Can add/remove members and rotate scope key. |
| `lead` | Can add members but cannot remove or rotate. |
| `member` | Standard participant with read/write access to scope events. |
| `guest` | Read-only access; cannot rotate scope key or add members. |
| `parent` | Used in hierarchical scope relationships; parent scope member. |
| `child` | Used in hierarchical scope relationships; child scope member. |
| `external` | Cross-organization participant with limited access. |

---

## Key Type Distinction (normative)

Each identity maintains **two separate key pairs**:

1. **Ed25519 identity key pair** — used for signing MemberSet and other UACP events. The `identity_public_key` field in `Member` refers to this key.
2. **X25519 exchange key pair** — used for X25519 Diffie-Hellman key exchange. The `recipient_identity_key` field in `EncryptedKeyEntry` refers to this key.

Both key types are 32 bytes on Curve25519, hence both use `bytes(32)` in the type description. Implementations MUST NOT confuse or reuse these key pairs.

---

## Scope Key Encryption: X25519-AES256GCM

To encrypt a 32-byte scope key for a recipient:

1. Generate an ephemeral X25519 key pair `(ephemeral_priv, ephemeral_pub)`.
2. Compute ECDH shared secret: `shared = X25519(ephemeral_priv, recipient_x25519_pub)`.
3. Derive AES key: `aes_key = HKDF-SHA256(ikm=shared, salt="", info="uacp-scope-key-v1", L=32)`.
4. Generate a random 12-byte nonce.
5. Encrypt: `ciphertext || auth_tag = AES-256-GCM(key=aes_key, nonce=nonce, plaintext=scope_key)`.
6. Store `ciphertext || auth_tag` (48 bytes total) as `ciphertext`, nonce as `nonce`, and `ephemeral_pub` raw bytes prepended to `ciphertext` or communicated out-of-band.

**Implementation note:** The `ciphertext` field in `EncryptedKeyEntry` carries `ephemeral_pub_bytes(32) || gcm_ciphertext(32) || auth_tag(16)` = 80 bytes total. The recipient recovers `ephemeral_pub` from the first 32 bytes of `ciphertext` to perform ECDH.

To decrypt:

1. Extract `ephemeral_pub` from the first 32 bytes of `ciphertext`.
2. Compute `shared = X25519(recipient_priv, ephemeral_pub)`.
3. Derive `aes_key` using HKDF-SHA256 as above.
4. Decrypt `AES-256-GCM(key=aes_key, nonce=nonce, ciphertext=ciphertext[32:48], auth_tag=ciphertext[48:])`.

---

## Signing: Canonical CBOR Field Order

The MemberSet signature covers the canonical CBOR encoding of all fields **except** `signature`. CBOR field order for the outer map (listed):

1. `scope_id` — text string (UUID)
2. `members` — array of maps, each in field order: `identity_public_key` (bytes), `role` (text), `joined_at` (uint), `joined_via_event_id` (text)
3. `scope_key` — map in field order: `algorithm` (text), `encrypted_key_per_member` (array of maps, each in field order: `recipient_identity_key` (bytes), `ciphertext` (bytes), `nonce` (bytes))
4. `version` — uint

Implementations MUST use definite-length CBOR encoding. The signature is computed over this CBOR byte sequence using the scope admin's Ed25519 private key, producing a 64-byte signature stored as base64url (86 chars).

---

## Membership Change and Key Rotation (normative)

When any membership change occurs (member added, removed, or role changed):

1. Generate a new random 32-byte scope key.
2. Encrypt the new scope key to each **remaining** member using X25519-AES256GCM.
3. Increment `version` by 1.
4. Update `members` to reflect the new roster.
5. Sign the new MemberSet.

**Removed members CANNOT decrypt events encrypted after their removal** because they do not receive an encrypted key entry in the new MemberSet.

---

## Error Codes

| Code | Meaning |
|------|---------|
| `MEMBERSET_VERSION_REGRESSION` | Received a MemberSet with `version` ≤ the last known version for that scope. Indicates replay attack or stale data. |
| `MEMBERSET_SIG_INVALID` | Ed25519 signature verification failed. |
| `MEMBERSET_KEY_COUNT_MISMATCH` | `encrypted_key_per_member.length` ≠ `members.length`. |
| `MEMBERSET_DECRYPT_FAILED` | AES-256-GCM decryption of the scope key failed (wrong key or corrupted ciphertext). |
| `UNKNOWN_ROLE` | `role` field contains a value not in the normative enum. (Schema rejects this.) |

---

## Scenario Mapping

| Scenario | Description | Fixture |
|----------|-------------|---------|
| 7 | Two-member scope; both members can decrypt scope key | `01-two-member-scope.json` |
| 8 | Five-member team scope; version increment on add | `02-five-member-team.json`, `03-team-version-increment.json` |
| 9 | Read-only handoff; guest role cannot rotate scope key | `05-read-only-handoff.json` |
| 10 | Family scope with parent/child roles | `04-family-parent-child.json` |

---

## Related

- Schema: `schema/extensions/uacp-member-set.schema.json`
- Test vectors: `test-vectors/extensions/member-set/`
- Generation script: `scripts/generate-member-set-vectors.js`
- CONFORMANCE.md
