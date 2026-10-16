> **DEPRECATED:** This spec describes the v1 promotion-event format which has been superseded. Use `schema/extensions/uacp-promotion-event.schema.json` (`$id`: `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-promotion-event`) for all new work. The v1 schema now redirects to the extensions canonical schema via `$ref`.

# Promotion Event v1

A promotion event moves an artifact from a lower-trust scope to a higher-trust scope.

## §1 — Payload

```json
{
  "event_type": "promotion",
  "artifact_id": "uuid",
  "from_scope_id": "uuid",
  "to_scope_id": "uuid",
  "re_encrypted_body": "base64",
  "scope_key_id_used": "uuid"
}
```

## §2 — Semantics

1. Promotions are non-destructive: the source copy MUST be retained in the `from_scope_id`.
2. The promoted copy MUST be re-encrypted for the target scope key.
3. Receivers MUST validate that `scope_key_id_used` is current for `to_scope_id`, or treat the event as pending until keys are updated.

