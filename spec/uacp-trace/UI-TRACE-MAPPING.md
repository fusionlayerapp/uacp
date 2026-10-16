# UACP-Trace UI Mapping Guide

**Status:** Normative guidance (v1, 2026-06)
**Tracked by:** [hn2/uacp#88](https://github.com/hn2/uacp/issues/88)
**Applies to:** Workbench / chat GUIs that visualise execution traces alongside AI responses.

---

## Purpose

UACP-Trace defines the wire format (OTel gen_ai spans + `uacp.*` extension attributes,
§2–§6 of [UACP-TRACE.md](./UACP-TRACE.md)). Products like Inkfold and FusionLayer
Workbench further decompose each request into **pipeline stages** (classify, route,
generate, evaluate, …) that a trace drawer must render.

This document defines:
1. The minimal UI-facing fields a trace drawer MUST support.
2. How internal orchestrator stage objects map to UACP-Trace span attributes.
3. Fanout / grouping conventions for multi-perspective evaluation pipelines.
4. Privacy-mode rendering rules.

---

## §1 — Minimal UI-Facing Fields

A conforming trace drawer MUST support the following logical fields per stage row.
Implementations MAY add columns; they MUST NOT omit the required ones.

| Field | Required | Source | Description |
|-------|----------|--------|-------------|
| `stage` | REQUIRED | stage object `.stage` or `.label` | Machine-readable stage key (see §2). |
| `label` | REQUIRED | derived (see §2) | Human-readable name for the stage. |
| `status` | REQUIRED | stage object `.status` or derived | `running`, `done`, `skipped`, `failed`. |
| `model` | RECOMMENDED | stage object `.model` or trace `.model` | Model identifier (`vendor:model-id` format). |
| `vendor` | RECOMMENDED | derived from `model` | The AI system (`gen_ai.system` equivalent). |
| `tokens_in` | RECOMMENDED | stage `.tokens_in` or trace `.tokens_in` | Input token count for this stage. |
| `tokens_out` | RECOMMENDED | stage `.tokens_out` or trace `.tokens_out` | Output token count for this stage. |
| `cost` | RECOMMENDED | stage `.cost` or trace `.total_cost_usd` | Monetary cost in USD for this stage. |
| `duration_ms` | RECOMMENDED | stage `.duration_ms` or span duration | Wall-clock time for this stage in ms. |
| `privacy_mode` | REQUIRED | trace `.mode` | `smart`, `private`, or `incognito`. |

### Summary totals

The trace drawer SHOULD show aggregate totals per conversation turn:

| Aggregate | Source |
|-----------|--------|
| Total tokens | `trace.total_tokens` (= `tokens_in + tokens_out` across all generate stages) |
| Total cost | `trace.total_cost_usd` |
| Total latency | `trace.latency_ms` or `(completed_at – started_at)` in ms |

---

## §2 — Stage Labels

Each pipeline stage has a canonical `stage` key and a human-readable `label`. The
mapping below covers all stages emitted by the FusionLayer reference orchestrator.
Products implementing their own orchestrators SHOULD reuse these keys for
cross-product consistency; they MAY extend with product-specific keys.

### Primary pipeline stages

| `stage` key | Label | Description |
|-------------|-------|-------------|
| `classify` | Classify prompt | Intent classification — sets task class, complexity, stakes. |
| `policy_pre` | Apply policy | Pre-generation operator checks (DLP, injection scan, blocklist). |
| `retrieve` | Retrieve memory | Context retrieval from UACP memory store. |
| `route` | Route to model | Model selection / bandit routing. |
| `plan` | Build execution plan | Multi-step plan generation for complex tasks. |
| `injection_scan` | Scan prompt injection | Dedicated injection detection pass. |
| `redact` | Redact prompt | Prompt-side redaction (PII, confidential patterns). |
| `policy_block` | Block by policy | Request blocked before generation. |
| `cache_hit` | Use cached response | Response served from cache — no model call made. |
| `execute` | Call model | The primary model call. |
| `execute_error` | Model call failed | Model call returned an error. |
| `evaluate` | Evaluate response | Quality / grounding evaluation of the response. |
| `accept` | Accept response | Response accepted, passed all checks. |
| `policy_post` | Redact response | Post-generation response redaction. |
| `policy_response_block` | Block response by policy | Response blocked after generation. |
| `escalate` | Escalate model | Re-routed to a stronger model. |
| `auto_upgrade` | Check auto-upgrade | Evaluated whether model upgrade is warranted. |
| `save` | Save history | Persist conversation to UACP memory. |
| `generate` | Generate response | Alias for `execute` in simple pipeline variants. |
| `give_up` | Stop execution | Execution halted — no acceptable response produced. |

### Fusion pipeline sub-stages

These appear nested under an `execute` / `generate` parent when the Teller-Ulam fusion
strategy is active:

| `stage` key | Label |
|-------------|-------|
| `draft` / `draft_(teller)` | Draft (Teller) |
| `critique` / `critique_(ulam)` | Critique (Ulam) |
| `refine` | Refine |

### Multi-step pipeline sub-stages

| `stage` key | Label |
|-------------|-------|
| `planner` | Planner |
| `executor` | Executor |
| `verifier` | Verifier |
| `synthesizer` | Synthesizer |

### Council / fanout sub-stages

When a council strategy runs multiple perspectives in parallel, each member span shares
the same `uacp.fanout_id`. The `stage` key is `council_member`; the label is derived
from the member's vendor/model (e.g., `"Anthropic · claude-opus-4-8"`).

---

## §3 — UACP-Trace Span Mapping

The internal stage objects used by FusionLayer-compatible orchestrators map to OTel
gen_ai + `uacp.*` attributes as follows:

| Stage field | OTel / UACP-Trace attribute | Notes |
|-------------|----------------------------|-------|
| `stage` | span name (suffix) | Concatenate as `gen_ai.{stage}` or use as span display name. |
| `status` | OTel span status | `done` → `OK`, `failed` → `ERROR`, `skipped` → `UNSET`. |
| `model` | `gen_ai.request.model` | May include vendor prefix (`anthropic:claude-sonnet-4-6`). |
| `vendor` (derived) | `gen_ai.system` | Strip before the first `:` in `model`. |
| `tokens_in` | `gen_ai.usage.input_tokens` | Per-stage; omit if null. |
| `tokens_out` | `gen_ai.usage.output_tokens` | Per-stage; omit if null. |
| `cost` | `uacp.cost_usd` *(informative)* | Not in OTel core — store as a custom attribute. |
| `duration_ms` | OTel span duration | Set `startTime + duration_ms` as `endTime`. |
| `mode` (trace-level) | `uacp.privacy_mode` | `smart`, `private`, or `incognito`. |
| `fanout_id` | `uacp.fanout_id` | Shared UUID across all council-member spans. |
| `request_id` | `uacp.session_id` | Correlates spans to the originating request. |
| `conversation_id` | `uacp.artifact_id` | Links spans to the UACP conversation artifact. |
| `operator_chain[].operator_id` | Custom attribute `uacp.operator_id` | Each operator gets its own child span. |

---

## §4 — Rendering Rules by Privacy Mode

Trace drawer behaviour MUST vary by `uacp.privacy_mode`:

### `smart` mode

Full trace display. Show all stages, all fields, full `detail` text (prompt snippet,
verdict reason, error messages). Persist to UACP artifact store.

### `private` mode

Show stage topology and timing; SUPPRESS content:
- Hide `detail` text containing prompt/response fragments.
- Show token counts and cost (non-content metrics).
- Label the trace header: *"Private mode — content not stored."*

### `incognito` mode

Show only a tombstone row in the UI:
- Label: *"Incognito — trace discarded."*
- `status` = `incognito-discarded`
- Do NOT render per-stage rows.
- Do NOT persist to UACP artifact store.

---

## §5 — Stage Object Shape (Reference)

Internal orchestrators SHOULD produce stage objects with the following shape.
This is the normalised form accepted by UACP-Trace-compatible trace drawers:

```json
{
  "stage": "execute",
  "label": "Call model",
  "status": "done",
  "model": "anthropic:claude-sonnet-4-6",
  "tokens_in": 1240,
  "tokens_out": 387,
  "cost": 0.00311,
  "duration_ms": 1842,
  "detail": "claude-sonnet-4-6 · 1240 in / 387 out · $0.00311"
}
```

For fanout / council stages, add:

```json
{
  "stage": "council_member",
  "label": "Anthropic · claude-opus-4-8",
  "fanout_id": "a3f2e1c0-...",
  "status": "done",
  "model": "anthropic:claude-opus-4-8",
  "tokens_in": 980,
  "tokens_out": 214,
  "cost": 0.00762,
  "duration_ms": 2310
}
```

Operator chain entries are a parallel structure:

```json
{
  "operator_id": "builtin:empty-answer-block",
  "started_at": "2026-06-17T11:00:00.000Z",
  "duration_ms": 1,
  "input_hash": "sha256:e3b0c44298fc1c...",
  "output_hash": "sha256:44136fa355ba..."
}
```

---

## §6 — Aggregate Display Example

A trace drawer for a single conversation turn SHOULD display:

```
▸ Classify prompt         done    2ms
▸ Apply policy            done    0ms
▸ Retrieve memory         done   18ms
▸ Route to model          done    1ms
▸ Call model              done  1842ms   claude-sonnet-4-6 · 1240 in / 387 out · $0.00311
▸ Evaluate response       done    4ms    score 0.92
▸ Accept response         done    0ms
▸ Save history            done    6ms

  Total  1873ms  1627 tokens  $0.00311  smart mode
```

---

## Annex A — Change History

| Version | Date       | Summary |
|---------|------------|---------|
| v1      | 2026-06-17 | Initial UI mapping guide. Defines stage labels, stage-to-OTel mapping, privacy-mode rendering rules, and stage object shape. Resolves [#88](https://github.com/hn2/uacp/issues/88). |
