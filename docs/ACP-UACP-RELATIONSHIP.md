# ACP and UACP Relationship

ACP (Agent Context Protocol) was an earlier internal draft for AI conversation interchange. UACP is the canonical public spec; ACP is no longer published. The `hn2/acp` repository remains private and is not part of the UACP specification.

## ACP Extension Decisions (audit 2026-05-06)

| Extension | Decision | Notes |
|---|---|---|
| memory | **Private** | Implementation-specific compounding memory semantics; not relevant to a neutral protocol |
| settings | **Drop** | Covered by UACP `metadata` and per-conversation configuration fields |
| inject | **Drop** | Proprietary injection pipeline; implementation detail, not protocol |
| sync | **Drop** | Transport/sync semantics are out of scope for a conversation data-format spec |
| team | **Absorb** | Partial overlap with UACP `privacy` and `groups` fields; tracked in follow-up |
| stream | **Drop** | Streaming transport is an implementation concern; UACP is a document format |
| vendor | **Drop** | Vendor-specific extensions belong in implementation guides, not the core spec |

No `acp.*` namespace keys are carried into UACP. Any absorbed semantics will be re-specified under the UACP namespace in follow-up issues.
