> **DEPRECATED:** This spec describes the v1 withdraw-event format which has been superseded. Use `schema/extensions/uacp-withdraw-event.schema.json` (`$id`: `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-withdraw-event`) for all new work. The v1 schema now redirects to the extensions canonical schema via `$ref`.

# Withdraw Event v1

A withdraw event stops relay of an artifact from a scope.

## §1 — Payload

```json
{
  "event_type": "withdraw",
  "artifact_id": "uuid",
  "from_scope_id": "uuid"
}
```

## §2 — Semantics

1. Withdrawal stops forwarding/replication from `from_scope_id`.
2. The artifact MUST NOT be deleted from the source scope as a result of withdrawal.
3. Implementations SHOULD rotate the scope key for remaining members when withdrawal indicates a membership change or compromise.

