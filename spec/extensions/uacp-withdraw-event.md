# uacp-withdraw-event — Withdraw Event Extension

**Status:** Optional extension  
**Version:** 0.6.0  
**Identifier:** `uacp-withdraw-event`  
**Schema:** `schema/extensions/uacp-withdraw-event.schema.json`  
**Tracking:** hn2/uacp#41

---

## Overview

The `uacp-withdraw-event` extension defines the structure of a **WithdrawEvent**: a record that signals one or more events should be treated as withdrawn from a scope.

A WithdrawEvent is wrapped in a standard signed Event envelope (see hn2/uacp#36). The envelope's `scope_id` MUST equal the scope from which content is being withdrawn.

---

## Schema

```json
{
  "type": "withdraw",
  "target_event_ids": ["<UUID v4>", ...],
  "reason": "author_retracted" | "dlp_violation" | "wrong_scope" | "admin_action",
  "withdrawn_at": <uint64>,
  "withdrawer_identity": "<base64url, 43 chars, Ed25519 public key>"
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `type` | string const `"withdraw"` | Event type discriminator |
| `target_event_ids` | array of UUID v4, minItems 1 | Events being withdrawn (at least one required) |
| `reason` | enum | Reason for withdrawal (see Reason codes) |
| `withdrawn_at` | integer >= 0 | Unix timestamp (milliseconds) when withdrawal was issued |
| `withdrawer_identity` | base64url, exactly 43 chars | Ed25519 raw public key of the withdrawing identity |

---

## Normative rules

### Withdrawal semantics

- Withdrawal does **not** delete events from existing local logs held by subscribers who already received the events.
- Relays MUST stop serving `target_event_ids` to **new** subscribers after receiving a WithdrawEvent.
- Clients SHOULD render withdrawn events as `[withdrawn]` along with the original author identity and timestamp.
- A WithdrawEvent in one scope has no effect on copies of the same content in other scopes (e.g. promoted copies). Separate WithdrawEvents must be issued per scope.

### Reason codes

| Reason | Authorized issuer |
|---|---|
| `author_retracted` | Only the original author of the target event(s) |
| `dlp_violation` | On-device DLP acting on the author's behalf |
| `wrong_scope` | Only the original author |
| `admin_action` | Scope admin only |

### Identity

`withdrawer_identity` is the raw Ed25519 public key encoded as base64url (43 characters, no padding). It MUST match the signing key of the enclosing Event envelope.

---

## Error codes

| Code | Condition |
|---|---|
| `WITHDRAWER_NOT_AUTHORIZED` | The withdrawer's identity does not match the authorization rule for the given reason (e.g. non-author attempting `author_retracted`) |
| `TARGET_NOT_IN_SCOPE` | A `target_event_id` does not exist in the scope identified by the envelope's `scope_id` |

Both errors are **semantic** — the JSON schema validates structural correctness only. Implementations MUST check authorization and target membership at the application layer.

---

## Limits

Withdrawal cannot remove events from logs of **existing subscribers** who have already received and persisted the content. This is an inherent limit of append-only, distributed log architectures. Clients and relays can suppress display and relay of withdrawn content, but cannot guarantee erasure from all prior recipients.

---

## Test scenario mapping

| Fixture | Scenario | Description |
|---|---|---|
| `01-author-retracted.json` | Scenario 15 | Author retracts a wrongly-scoped event; readers see [withdrawn] |
| `02-dlp-violation.json` | Scenario 15 (secret leak) | On-device DLP emits withdrawal |
| `03-admin-action.json` | Scenario 10 | Scope admin withdraws a flagged family event |
| `negative-01-unknown-reason.json` | Error: schema_error | Unknown reason rejected by schema |

---

## Related

- Schema: `schema/extensions/uacp-withdraw-event.schema.json`
- Test vectors: `test-vectors/extensions/withdraw-event/`
- Generation script: `scripts/generate-withdraw-vectors.js`
- Promotion event: `spec/extensions/uacp-promotion-event.md` (hn2/uacp#40)
- Signed Event envelope: hn2/uacp#36
