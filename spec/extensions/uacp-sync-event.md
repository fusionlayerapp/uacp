# uacp-sync-event — Signed Event Envelope Extension

**Status:** Optional extension  
**Version:** 0.1.0  
**Identifier:** `uacp-sync-event`  
**Schema:** `schema/extensions/uacp-sync-event.schema.json`  
**Epic:** #35

---

## Overview

`uacp-sync-event` defines the signed, ordered event envelope that is the atomic unit of exchange in a UACP append-only sync log. Each event carries an encrypted payload, a vector-clock position, and an Ed25519 signature that ties the event to the device that produced it.

This extension does not define how payloads are encrypted (see `uacp-encryption`), how the sync relay fans events out, or how vector-clock conflicts are resolved at the application layer. Those are implementation concerns.

---

## Event Schema

```
Event {
  conversation_id:  UUID         // RFC 4122 v4, 128-bit
  event_id:         UUID         // RFC 4122 v4, unique per (author_device_id, conversation_id)
  parent_event_id:  UUID | null  // null only for the first event in a conversation
  vector_clock:     { [device_id: UUID]: uint64 }
  author_user_id:   UUID
  author_device_id: UUID
  timestamp:        uint64       // monotonic_ms since Unix epoch on author device
  scope_id:         UUID         // governs which keys can decrypt payload
  payload:          bytes        // AES-256-GCM ciphertext; see uacp-encryption spec
  signature:        bytes        // Ed25519(canonical_cbor(event minus signature))
}
```

In JSON interchange, `payload` and `signature` are base64url-encoded (RFC 4648 §5) without padding characters.

---

## Canonical encoding for signing

The bytes that are signed are the deterministic CBOR encoding (RFC 8949 §4.2.1) of the event **excluding the `signature` field**. Field order in the CBOR map is exactly the order listed above: `conversation_id`, `event_id`, `parent_event_id`, `vector_clock`, `author_user_id`, `author_device_id`, `timestamp`, `scope_id`, `payload`.

CBOR type mapping:

| Field | JSON type | CBOR type |
|---|---|---|
| `conversation_id` | string (UUID) | text string (major type 3) |
| `event_id` | string (UUID) | text string (major type 3) |
| `parent_event_id` | string (UUID) or null | text string or null (0xf6) |
| `vector_clock` | object | map (major type 5); keys text, values uint |
| `author_user_id` | string (UUID) | text string (major type 3) |
| `author_device_id` | string (UUID) | text string (major type 3) |
| `timestamp` | integer | unsigned integer (major type 0) |
| `scope_id` | string (UUID) | text string (major type 3) |
| `payload` | base64url string | byte string (major type 2); decode before encoding |

All CBOR integers use the minimum number of bytes. All strings use definite-length encoding. No indefinite-length encoding is permitted.

For the `vector_clock` inner map, keys MUST be sorted by UTF-8 byte length, then lexicographically (RFC 8949 §4.2.1 canonical key order).

---

## Validation rules (normative)

Implementations MUST enforce all of the following. Violations MUST return the error code shown.

1. **`INVALID_SIGNATURE`** — `signature` MUST verify against `author_device_id`'s public key. The public key MUST be certified by `author_user_id`'s identity key per the identity-key-chain spec (UACP #42). The signed bytes are the canonical CBOR of the event excluding `signature`.

2. **`MISSING_PARENT`** — `parent_event_id` MUST either be null (first event only) or reference an event already present in the local log for this conversation.

3. **`CLOCK_REGRESSION`** — `vector_clock[author_device_id]` MUST be strictly greater than the corresponding value in the parent event's `vector_clock` (or strictly greater than 0 if the parent is null).

4. **`STALE_TIMESTAMP`** — `timestamp` MUST be ≥ `parent.timestamp − 60000` (milliseconds). This tolerates up to 60 seconds of clock skew and rejects obvious replays. A null parent has no timestamp constraint.

5. **`UNAUTHORIZED_SCOPE`** — `scope_id` MUST be a scope that `author_user_id` is currently a member of. Verified at the sender before signing and re-verified by any relay or receiver that has access to scope membership data.

---

## Error codes

| Code | Condition |
|---|---|
| `INVALID_SIGNATURE` | Ed25519 signature verification failed |
| `MISSING_PARENT` | `parent_event_id` not found in local log and not null |
| `CLOCK_REGRESSION` | `vector_clock[author_device_id]` did not strictly advance |
| `STALE_TIMESTAMP` | `timestamp` is more than 60 seconds before parent timestamp |
| `UNAUTHORIZED_SCOPE` | `author_user_id` is not a member of `scope_id` |

---

## Concurrency and partial order

Two events are **concurrent** when neither event's vector clock dominates the other's. Formally, event A and event B are concurrent iff:

```
A.vector_clock[d] >= B.vector_clock[d]   // for all d with a value in both
```

is neither universally true for A→B nor universally true for B→A. Implementations MUST surface concurrent events to the application layer as a branch; they MUST NOT silently drop either event or pick one arbitrarily.

---

## Test scenario mapping

| Test | Scenarios |
|---|---|
| Single event with null parent verifies | Scenario 1 |
| Chain of events maintains vector clock order | Scenario 2 |
| Two users' events in same scope verify with separate keys | Scenario 7 |
| Offline-queued events merge on reconnect | Scenario 14 |
| Tampered payload → `INVALID_SIGNATURE` | Scenario 15 (negative) |
| Replayed event → `CLOCK_REGRESSION` | Scenario 2 (negative) |

---

## Conformance fixtures

Located in `test-vectors/extensions/sync-event/`. All fixture files are JSON with the following envelope:

```json
{
  "fixture_id": "...",
  "description": "...",
  "expected": "valid | INVALID_SIGNATURE | MISSING_PARENT | CLOCK_REGRESSION | STALE_TIMESTAMP",
  "log": [ ...prior events... ],
  "event": { ...the event under test... }
}
```

`log` is the set of events already accepted into the local log before this event is validated. It may be empty (for first-event tests). The `event` is the event being validated.

Required fixtures:

| ID | Description | Expected |
|---|---|---|
| `01-valid-first-event` | Single event, null parent, valid signature | `valid` |
| `02-valid-chain` | Six events from same device, chained | `valid` |
| `03-two-user-events` | Two users in same scope, separate device keys | `valid` |
| `04-offline-replay` | Events created during network partition, replayed on reconnect | `valid` |
| `negative-01-tampered-payload` | Valid structure, payload byte flipped, signature breaks | `INVALID_SIGNATURE` |
| `negative-02-clock-regression` | vector_clock[device] did not advance from parent | `CLOCK_REGRESSION` |
| `negative-03-missing-parent` | parent_event_id not null, not in log | `MISSING_PARENT` |

---

## Relationship to other extensions

- **`uacp-encryption`** — defines how `payload` ciphertext is constructed. `uacp-sync-event` treats `payload` as opaque bytes.
- **UACP #42** — identity + device key chain that `author_device_id` public keys chain to.
- **UACP #37** — vector clock merge semantics (how concurrent events are ordered and merged at the application layer).
- **UACP #39** — member set + scope-key envelope that `scope_id` references.

---

## Related

- Schema: `schema/extensions/uacp-sync-event.schema.json`
- Test vectors: `test-vectors/extensions/sync-event/`
- Test file: `test/sync-event.test.js`
- CONFORMANCE.md
