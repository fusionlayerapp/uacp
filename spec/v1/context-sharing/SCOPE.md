# Scope v1

Scopes group artifacts and events under a governance policy. A scope is identified by a stable `scope_id` and includes metadata used for access control and key distribution.

## §1 — Scope Identifier

```json
{
  "scope_id": "uuid",
  "scope_type": "personal|team|corporate|family",
  "governance_preset": "solo|duo|household|team|organization|public",
  "owner_did": "did:key:... or did:web:..."
}
```

## §2 — Governance Presets

All presets define:

1. Who can add members.
2. Who can promote/withdraw artifacts between scopes.
3. Whether membership changes require multi-party approval.

Preset semantics:

| Preset | Summary |
|---|---|
| `solo` | Single owner. Only `owner_did` can add/remove members and approve promotions. |
| `duo` | Two-party shared scope. Either party can propose changes; both SHOULD confirm structural changes. |
| `household` | Family/household governance. One or more guardians act as administrators; dependents may have restricted rights. |
| `team` | Small team. Admins manage membership; members can propose promotions. |
| `organization` | Larger org. Central admin approval for membership and structural changes. |
| `public` | Readable by anyone. Write requires explicit capability; membership is open by policy. |

