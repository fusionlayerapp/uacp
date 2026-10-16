# UACP Audit Event — Normative Specification

**Schema ID:** `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-audit-event`  
**Status:** Draft  
**Issue:** hn2/uacp#44

---

## 1. Overview

An `AuditEvent` records a single metadata event within a scope. AuditEvents are chained by SHA-256 hash so that any tampering with a prior event invalidates all subsequent entries in the scope's audit chain.

AuditEvents MUST be wrapped in a signed Event envelope (see `uacp-sync-event`) before transmission. The audit event is the `payload` of the envelope (AES-256-GCM encrypted to the scope's **admin role** key).

---

## 2. Fields

| Field | Type | Description |
|---|---|---|
| `type` | `"audit"` | Constant; identifies the event kind. |
| `scope_id` | UUID v4 | The scope this audit entry concerns. |
| `subject_user_id` | UUID v4 | The user whose action triggered this entry. |
| `action` | enum | See §3. |
| `metadata` | AuditMetadata | Metadata about the action. MUST NOT include content. |
| `prev_audit_hash` | base64url(43 chars) | SHA-256 of the previous AuditEvent CBOR bytes. Genesis entry uses 43 base64url characters encoding 32 zero bytes. |
| `timestamp` | uint64 | Unix epoch milliseconds. |
| `observer_id` | UUID v4 | Identity of the relay or on-device observer that recorded this entry. |

### 2.1 AuditMetadata

| Field | Type | Description |
|---|---|---|
| `vendor` | string \| null | AI vendor name (e.g., `"openai"`). |
| `token_count` | uint32 \| null | Token count for `ai_prompt_sent` events. |
| `redaction_count` | uint32 \| null | Number of redactions for `dlp_redaction` events. |

AuditMetadata MUST NOT contain message content, prompt text, response text, or any field that reveals user-generated content.

---

## 3. Action Enum

| Value | Meaning |
|---|---|
| `ai_prompt_sent` | Subject sent a prompt to an AI vendor. |
| `dlp_redaction` | Data Loss Prevention filter redacted content. |
| `scope_member_added` | Subject was added to the scope. |
| `scope_member_removed` | Subject was removed from the scope. |
| `promotion` | A message was promoted into the scope. |
| `withdraw` | A promoted message was withdrawn. |
| `legal_hold_invoked` | Legal hold was applied to the scope. |
| `guardrail_triggered` | A guardrail rule fired for subject's activity. |

---

## 4. Hash-Chain Construction

### 4.1 Canonical CBOR encoding

An `AuditEvent` MUST be CBOR-encoded (RFC 8949 deterministic mode, §4.2.1) to produce its canonical bytes before hashing. Fields are serialized in the order listed in §2 (type, scope_id, subject_user_id, action, metadata, prev_audit_hash, timestamp, observer_id).

`prev_audit_hash` is encoded as a CBOR byte string (major type 2) of length 32.

### 4.2 Chain genesis

The first AuditEvent in a scope's chain sets `prev_audit_hash` to the 32-byte zero value, base64url-encoded as `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.

### 4.3 Chaining

Given a chain `[E0, E1, …, En]`, for all `i ≥ 1`:

```
E[i].prev_audit_hash = base64url( SHA-256( CBOR(E[i-1]) ) )
```

---

## 5. Normative Rules

### AUDIT_HASH_CHAIN_BROKEN

An implementation MUST reject the chain if for any event at position `i ≥ 1`:

```
base64url( SHA-256( CBOR(E[i-1]) ) ) ≠ E[i].prev_audit_hash
```

### AUDIT_CONTAINS_CONTENT

An implementation MUST reject an AuditEvent whose `metadata` contains any field not listed in §2.1 (enforced by `unevaluatedProperties: false` in the schema).

---

## 6. Access Control

- **Admin role members** see all AuditEvents for the scope (decrypted from the scope admin key envelope).
- **Ordinary members** see only AuditEvents where `subject_user_id` matches their own user ID.
- The legal-hold flow (FusionLayer, separate issue) is required to surface AuditEvent content to compliance officers outside the scope's admin set.

---

## 7. Conformance Fixtures

| Fixture | Expected | Scenario |
|---|---|---|
| `01-genesis-entry.json` | valid | Chain genesis event for `mobile-team` scope |
| `02-chained-entry.json` | valid | Second entry with correct `prev_audit_hash` |
| `03-guardrail-triggered.json` | valid | Family scope `guardrail_triggered` (Scenario 10) |
| `04-compliance-chain.json` | valid | Multi-entry chain walkable by compliance officer (Scenario 11) |
| `05-broken-chain.json` | schema_error | `prev_audit_hash` wrong length → schema rejects |
| `06-content-in-metadata.json` | schema_error | Extra field in metadata → `unevaluatedProperties` rejects |

---

## 8. Test Scenario Mapping

| Scenario | Fixture |
|---|---|
| Scenario 8 — Robert sees aggregate audit metadata | `02-chained-entry.json` |
| Scenario 10 — parents see `guardrail_triggered` | `03-guardrail-triggered.json` |
| Scenario 11 — Mike walks audit chain, verifies no gaps | `04-compliance-chain.json` |
| Negative: bad prev_hash → chain broken | `05-broken-chain.json` |
