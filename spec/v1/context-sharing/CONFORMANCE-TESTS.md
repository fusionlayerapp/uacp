# Context Sharing Conformance Tests v1

This document defines minimal fixtures for interop testing.

## §1 — Valid Signed Event Envelopes

Provide 5 valid examples (one per governance preset):

1. `solo` — promotion event
2. `duo` — withdraw event
3. `household` — scope-key-envelope distribution
4. `team` — promotion event
5. `organization` — withdraw event

## §2 — Invalid Examples

Provide 3 invalid examples with expected validation errors:

1. Missing required field (e.g. `signature`)
2. Invalid `vector_clock` counter (negative)
3. Signature verification failure

## §3 — Vector Clock Merge Fixture

Merge example:

`(A:3,B:1) + (A:2,B:4) → (A:3,B:4)`

## §4 — Promotion Round-Trip Fixture

1. Create an artifact body in `from_scope_id`.
2. Re-encrypt to `to_scope_id` using `scope_key_id_used`.
3. Verify recipients can decrypt and verify the envelope signature.

## §5 — Hash Chain Fixture

Provide a 3-event chain with correct hashes shown:

1. Entry 1 uses genesis `prev_hash = 64×0`.
2. Entry 2 `prev_hash = hash(entry_1.canonical_event_json)`.
3. Entry 3 `prev_hash = hash(entry_2.canonical_event_json)`.

