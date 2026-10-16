# Audit Hash Chain v1

This document defines a tamper-evident hash chain over signed events. It is intended for audit logging and forensic verification.

## §1 — Structure

Each audit chain entry contains:

| Field | Type | Notes |
|---|---|---|
| `event_id` | UUID string | The underlying event identifier. |
| `prev_hash` | hex string | SHA-256 of the previous canonical event JSON. Genesis uses 64 zeroes. |
| `canonical_event_json` | string | Canonical JSON string of the signed event (with signature). |
| `hash` | hex string | SHA-256 of `canonical_event_json`. |

Genesis rule:

`prev_hash = "0000000000000000000000000000000000000000000000000000000000000000"`

## §2 — Tamper Detection

Any modification of a past event changes its hash, which breaks verification of all subsequent entries. Verifiers MUST fail the chain if any link does not match.

