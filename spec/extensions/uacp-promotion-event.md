# uacp-promotion-event — Promotion Event Extension

**Status:** Optional extension  
**Version:** 0.6.0  
**Identifier:** `uacp-promotion-event`  
**Schema:** `schema/extensions/uacp-promotion-event.schema.json`  
**Tracking:** hn2/uacp#40

---

## Overview

The `uacp-promotion-event` extension defines the structure of a **PromotionEvent**: a record that copies one or more events from a source scope into a destination scope, optionally replacing or supplementing them with a summary.

Promotion is **copy-with-re-encryption**, not transfer. Source events are never moved or deleted. After promotion, both the source scope and the destination scope hold copies; the source copy remains authoritative in the source scope.

A PromotionEvent is wrapped in a standard signed Event envelope (see hn2/uacp#36). The envelope's `scope_id` MUST equal `destination_scope_id`.

---

## Schema

```json
{
  "type": "promotion",
  "source_scope_id": "<UUID v4>",
  "source_event_ids": ["<UUID v4>", ...],
  "destination_scope_id": "<UUID v4>",
  "mode": "as_is" | "with_summary" | "summary_only",
  "summary_payload": "<base64url>" | null,
  "context_note": "<base64url>" | null,
  "promoted_at": <uint64>,
  "promoter_identity": "<base64url, 43 chars, Ed25519 public key>"
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `type` | string const `"promotion"` | Event type discriminator |
| `source_scope_id` | UUID v4 | Scope from which events are promoted |
| `source_event_ids` | array of UUID v4, minItems 1 | Events being promoted (at least one required) |
| `destination_scope_id` | UUID v4 | Scope receiving the promoted content |
| `mode` | enum | Controls what is emitted to the destination (see Modes) |
| `summary_payload` | base64url string or null | Encrypted summary ciphertext; required when mode is `with_summary` or `summary_only` |
| `context_note` | base64url string or null | Optional promoter annotation, encrypted to destination scope key |
| `promoted_at` | integer >= 0 | Unix timestamp (milliseconds) when promotion occurred |
| `promoter_identity` | base64url, exactly 43 chars | Ed25519 raw public key of the promoter |

---

## Normative rules

### Modes

**`as_is`**  
Source events are re-encrypted to the destination scope key and emitted as derivative events in the destination scope. `summary_payload` MAY be null. Source content is fully preserved.

**`with_summary`**  
A summary ciphertext is emitted to the destination scope AND re-encrypted source content is also emitted. `summary_payload` MUST be non-null (see MISSING_SUMMARY error).

**`summary_only`**  
Only `summary_payload` is emitted to the destination scope. The original ciphertexts stay in the source scope and are never sent to the destination. `summary_payload` MUST be non-null.

### Source event handling

- Source events are **never moved**. Promotion creates copies in the destination scope.
- If a source event is later withdrawn from the source scope, the promoted copy in the destination scope is not automatically withdrawn; a separate WithdrawEvent (hn2/uacp#41) MUST be issued against the destination scope if withdrawal there is also required.

### Identity

`promoter_identity` is the raw Ed25519 public key of the identity performing the promotion, encoded as base64url (43 characters, no padding). It MUST match the signing key of the enclosing Event envelope.

---

## Error codes

| Code | Condition |
|---|---|
| `PROMOTER_NOT_AUTHOR` | `promoter_identity` does not match the original author of at least one source event |
| `MISSING_SUMMARY` | `mode` is `with_summary` or `summary_only` but `summary_payload` is null |
| `DESTINATION_NOT_MEMBER` | The promoter is not a member of `destination_scope_id` |

Note: `MISSING_SUMMARY` is a **semantic** error — the JSON schema permits `summary_payload: null` structurally to allow the field to always be present. Implementations MUST check this constraint at the application layer.

---

## Test scenario mapping

| Fixture | Scenario | Description |
|---|---|---|
| `01-as-is-promotion.json` | Scenario 8 | PM promotes PRD as_is; designer reads it |
| `02-with-summary.json` | Scenario 2 | Opus session promotes architectural decision; Sonnet sessions decrypt |
| `03-summary-only.json` | Scenario 9 | Source team bulk-promotes artifacts to handoff scope |
| `negative-01-missing-summary.json` | Error: MISSING_SUMMARY | with_summary mode but summary_payload is null |
| `negative-02-unknown-mode.json` | Error: schema_error | Unknown mode value rejected by schema |

The `negative-01-missing-summary.json` fixture has `expected: "MISSING_SUMMARY"` and PASSES schema validation — the semantic error is checked by the application layer, not the JSON schema. The harness treats any `expected` value other than `"valid"` as an expected-failure fixture.

---

## Related

- Schema: `schema/extensions/uacp-promotion-event.schema.json`
- Test vectors: `test-vectors/extensions/promotion-event/`
- Generation script: `scripts/generate-promotion-vectors.js`
- Withdraw event: `spec/extensions/uacp-withdraw-event.md` (hn2/uacp#41)
- Signed Event envelope: hn2/uacp#36
