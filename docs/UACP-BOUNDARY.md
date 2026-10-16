# UACP Boundary: Core vs Extension vs Implementation-Specific

This document defines the canonical boundary between what belongs in UACP core,
what belongs in optional extensions, and what is implementation-specific and out
of UACP scope entirely.

---

## The three categories

### Core (UACP spec, this repo)

Core defines the conversation document format only. It is vendor-neutral and
implementation-agnostic. No product opinions, no storage opinions.

**What is core:**
- Conversation object shape (`uacp` field, `id`, `tool`, `messages[]`)
- Message roles (`user`, `assistant`, `system`, `tool`)
- Content block types (`text`, `image`, `code`, `thinking`, `artifact_ref`, `audio`, `video`, `pdf`, `latex`)
- Tool calls and tool results (`tool_calls`, `call_id`, `name`, `arguments`)
- Citations (`citations[]` on assistant messages)
- Attachments (`attachments[]` on messages)
- Branching (`parent_id` on messages, `branches` on conversation)
- Artifacts (`artifacts[]` on assistant messages)
- Reasoning content blocks (`type: "thinking"`)
- Provenance (`provenance`, `confidence`, `provenance_source`)
- Redactions metadata (`redactions` object)
- Extensibility hook: `extensions[]` array and freeform `metadata` objects
- Versioning and version negotiation semantics
- Export bundle format (`uacp_export`)
- Context injection format (`uacp_context`)

**Examples of core test vectors:**
- `test-vectors/01-minimal-chat.uacp.json` — bare minimum required fields
- `test-vectors/07-extended-thinking.uacp.json` — thinking block, no extension needed
- `test-vectors/14-tool-call-correlation.uacp.json` — tool call pair

---

### Extension (optional, declared in `extensions[]`)

Extensions are optional capabilities that implementations may adopt. They are
defined in `spec/extensions/` and may have schemas in `schema/extensions/`.

A document declares which extensions it uses via the top-level `extensions` array:

```json
{ "extensions": ["uacp-encryption"] }
```

**What is an extension:**

| Extension | What it adds |
|-----------|-------------|
| `uacp-encryption` | AES-256-GCM envelope wrapping a conversation for at-rest/in-transit encryption. |
| `uacp-vault-envelope` | Multi-recipient encrypted container wrapping one or more UACP bundles under a shared, per-recipient-wrapped content key. Crypto-agnostic: key-wrap and content-cipher algorithms are declared identifiers, not fixed by the spec. |

**Rule:** an extension adds meaning or structure that is useful to many implementations but not required by all. It MUST NOT leak into core.

**Examples of extension test vectors:**
- `test-vectors/extensions/encryption/01-encrypted-envelope.uacp.json`
- `test-vectors/extensions/vault-envelope/01-two-recipients-two-bundles.uacp.json`

---

### Implementation-specific (out of UACP scope entirely)

Implementation-specific concerns belong in the product's own profile document,
not in UACP. UACP provides the `metadata` extension hook for implementation-specific
data to travel alongside conversations.

**Examples of implementation-specific concerns:**

| Concern | Where it belongs |
|---------|-----------------|
| FusionLayer's Smart/Private/Incognito privacy modes | FusionLayer profile doc. Store as `metadata."com.fusionlayer.privacy_mode": "smart"` |
| FusionLayer's encryption key derivation policy | FusionLayer internal spec |
| ChatGPT's Temporary Chat mode | OpenAI's own UACP profile (if they adopt UACP) |
| Vendor-specific routing (which model to use for this conversation) | Implementation config, not UACP |
| Cost optimization policy | Runtime / implementation config |
| Multi-model debate/council execution strategy | Orchestration layer, not UACP |
| Access control lists / sharing permissions | Product layer |

**Rule:** if a rule requires knowledge of product runtime state, business rules, or vendor-specific semantics to validate, it does not belong in UACP.

---

## Decision rule

> If a rule can be validated from a standalone UACP JSON document alone, it belongs in UACP.
>
> If a rule depends on runtime execution decisions, product policy, or vendor-specific state — it belongs outside UACP.

When in doubt, keep the field in core (conservative choice) and file a sub-issue.
Extension placement is reversible; removing from core is a breaking change.

---

## Metadata namespace guidance

Implementations place product-specific data in `metadata` using namespaced keys:

```json
"metadata": {
  "uacp_privacy.level": "personal",
  "com.fusionlayer.privacy_mode": "smart",
  "com.acme.ticket_id": "ACME-4821",
  "cursor.workspace": "/home/user/project"
}
```

- `uacp.*` — reserved for the UACP spec itself
- `uacp_<extension>.*` — reserved for official UACP extensions (e.g. `uacp_encryption.*`). `uacp_privacy.*` is reserved by the privacy metadata convention (see README §10).
- `com.vendor.*` — recommended pattern for vendor-specific fields
- Bare `tool.key` patterns (e.g. `cursor.workspace`) — tolerated for legacy compat but reverse-domain preferred

Extension schemas for `uacp_*` namespaces are defined in `spec/extensions/`.
