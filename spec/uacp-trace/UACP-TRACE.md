# UACP-Trace Specification v2 (Draft)

**Universal AI Context Protocol — Trace Specification**

> **Status:** Draft v2 — OTel gen_ai profile + `uacp.*` extension layer.
> Supersedes the `trace` kind that was part of UACP-Core v1 (now removed in UACP-Core v0.2 per ADR 0038).
> Tracked in [hn2/uacp#82](https://github.com/hn2/uacp/issues/82).

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals.

---

## §1 — Overview

UACP-Trace defines how AI execution traces are represented and transmitted in a way that
is interoperable with UACP context artifacts and compliant with the UACP privacy model.

UACP-Trace is a **profile of OpenTelemetry gen_ai semantic conventions** — it reuses the
OTel span model and the `gen_ai.*` attribute namespace, and adds a thin `uacp.*` extension
layer that binds traces to the UACP identity and privacy model.

### Why OTel gen_ai (not from scratch)

- 40+ auto-instrumentations already emit `gen_ai.*` spans from LangChain, LlamaIndex,
  CrewAI, Claude Agent SDK, OpenAI SDK, and others. Vendors get UACP-Trace at near-zero
  instrumentation cost.
- The gen_ai semantic conventions are now in OpenTelemetry governance (contributed by
  Traceloop), meaning they evolve via the OTel RFC process with broad industry review.
- APM backends (Datadog, Grafana, Dynatrace) are converging on `gen_ai.*`; a UACP-Trace
  collector can ingest from any of these backends without a custom receiver.

### Scope

UACP-Trace describes:
- The required and optional `uacp.*` attributes on OTel gen_ai spans
- The privacy enforcement pattern (incognito/private/smart modes)
- The collector configuration for attribute redaction

UACP-Trace does NOT describe:
- Context payloads (memory, policy, persona, etc.) — see UACP-Core
- Operator/action descriptions — see AAP
- Capture provenance — see Capture-Manifest

---

## §2 — Base: OTel gen_ai Semantic Conventions

A UACP-Trace span MUST be a valid OpenTelemetry span with at minimum:

- `gen_ai.system` — the AI system (e.g., `openai`, `anthropic`, `gemini`)
- `gen_ai.operation.name` — the operation (e.g., `chat`, `embeddings`, `rerank`)
- `gen_ai.request.model` — the model identifier

Implementations SHOULD also include:
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.response.model`
- `gen_ai.prompt.*` / `gen_ai.completion.*` (when `uacp.privacy_mode = smart`)

For the full normative reference, see the
[OTel gen_ai semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

---

## §3 — UACP Extension Attributes

The following attributes extend OTel gen_ai spans. Attributes marked **REQUIRED** MUST
appear on every span that claims UACP-Trace compliance.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `uacp.privacy_mode` | enum string | REQUIRED | Privacy mode: `smart`, `private`, or `incognito`. Drives trace content and redaction behavior (see §4). |
| `uacp.subject` | string | REQUIRED | Opaque DID-style owner identifier (same semantics as UACP-Core `subject` field). |
| `uacp.audience` | string[] | REQUIRED | List of principals authorized to read this trace. Empty = subject-only. `["*"]` = public. |
| `uacp.scope` | string | REQUIRED | Scope label from UACP-Core Annex A (`individual`, `family`, `team`, `group`, `corporate`, `public`). Informational; `audience` is enforced. |
| `uacp.artifact_id` | string | optional | UACP artifact UUID/URN that this span produced or consumed. Used to link trace spans to UACP context artifacts. |
| `uacp.session_id` | string | optional | Session identifier. Maps to `traceloop.association.properties.session_id` for compatibility with OpenInference/Traceloop consumers. |
| `uacp.fanout_id` | string | optional | Groups sibling parallel-eval spans (e.g., multi-perspective evaluation runs). All spans in a fanout group share the same `uacp.fanout_id`. See §5. |
| `uacp.sensitive` | boolean | optional | When `true`, the OTel Collector MUST strip all `llm.input_messages.*` and `llm.output_messages.*` attributes before exporting. Set automatically by the privacy enforcement pattern (see §4). |

---

## §4 — Privacy Enforcement Pattern

UACP-Trace defines three enforcement levels corresponding to UACP privacy modes:

### `smart` mode (default)

Full content retention. Crowd-wisdom pipeline eligible.

```
uacp.privacy_mode = "smart"
uacp.sensitive = false (or absent)
TraceConfig: hide_inputs=False, hide_outputs=False
```

### `private` mode

Topology retained; content stripped. No crowd-wisdom contribution.

```
uacp.privacy_mode = "private"
uacp.sensitive = false (or absent)
TraceConfig: hide_inputs=True, hide_outputs=True
```

Content attributes (`gen_ai.prompt.*`, `gen_ai.completion.*`, `llm.input_messages.*`,
`llm.output_messages.*`) MUST NOT be set when `uacp.privacy_mode = "private"`.

### `incognito` mode

Nothing persists. No trace export permitted.

```
uacp.privacy_mode = "incognito"
uacp.sensitive = true
TraceConfig: hide_inputs=True, hide_outputs=True
```

When `uacp.sensitive = true`, the UACP-Trace collector processor MUST:
1. Strip all attributes matching `llm.input_messages.*` and `llm.output_messages.*`
2. Strip all attributes matching `gen_ai.prompt.*` and `gen_ai.completion.*`
3. Set span status to `UNSET` (not `OK`) to prevent downstream analysis

---

## §5 — Fanout Spans (parallel evaluation)

When multiple model calls are made in parallel for the same user request (e.g., a
multi-perspective eval pipeline), each span SHOULD carry the same `uacp.fanout_id`.

Proposed upstream: `gen_ai.operation.name = "parallel_eval"` — a new value for the
OTel gen_ai operation name enum. File in `open-telemetry/semantic-conventions`.

```
gen_ai.operation.name = "parallel_eval"
uacp.fanout_id = "<shared-uuid-for-this-eval-group>"
```

---

## §6 — OTel Collector Configuration

Implementations SHOULD deploy an OTel Collector with a UACP-Trace processor that:

1. For each span: check `uacp.sensitive`
2. If `true`: apply the redaction filter

Reference processor config (YAML):

```yaml
processors:
  uacp_trace_redact:
    patterns:
      - attribute_pattern: "^llm\\.input_messages\\."
      - attribute_pattern: "^llm\\.output_messages\\."
      - attribute_pattern: "^gen_ai\\.prompt\\."
      - attribute_pattern: "^gen_ai\\.completion\\."
    condition: 'attributes["uacp.sensitive"] == true'
```

---

## §7 — UI-Facing Mapping (workbench trace panels)

This section defines a **minimal, stable mapping** from UACP-Trace spans to the fields a
product GUI presents in a workbench trace panel (for example, the Inkfold trace drawer).
The wire format remains OTel gen_ai spans (§2–§3); this mapping is the recommended
projection of those spans onto a UI model so that different products render trace data
consistently.

UI mapping is **informative** for compliance — a span that satisfies §2–§4 is compliant
regardless of how a product chooses to display it. Products SHOULD, however, follow this
mapping so that traces remain legible across UACP-aware surfaces and so that no field is
derived from privacy-redacted content.

### §7.1 — UI field model

A trace panel SHOULD present each span as a row with the following display fields. The
**Source** column gives the canonical span attribute (or span property) the UI reads;
the **Derivation** column describes any computation. UIs MUST NOT read prompt/completion
content for any of these fields, so the panel is renderable in every privacy mode (§4).

| UI field | Type | Source attribute / property | Derivation |
|----------|------|-----------------------------|------------|
| `stage` | string | `gen_ai.operation.name` | Display label for the step (e.g. `chat`, `embeddings`, `rerank`, `parallel_eval`). MAY be overridden by a product-supplied span name when more descriptive. |
| `model` | string | `gen_ai.response.model` ?? `gen_ai.request.model` | Prefer the response model (what actually ran); fall back to the requested model. |
| `vendor` | string | `gen_ai.system` | The AI system/provider (e.g. `openai`, `anthropic`, `gemini`). Render as the "vendor" or "system" chip. |
| `tokens_in` | integer | `gen_ai.usage.input_tokens` | Omit the figure when absent (do not display `0`). |
| `tokens_out` | integer | `gen_ai.usage.output_tokens` | Omit the figure when absent. |
| `tokens_total` | integer | — | `tokens_in + tokens_out` when both present; otherwise omit. |
| `latency_ms` | number | OTel span `end_time − start_time` | Span duration in milliseconds. This is the only timing source; there is no `latency` attribute. |
| `cost` | object | `gen_ai.usage.*` + product price table | OPTIONAL, product-computed. See §7.2 — cost is never carried on the span. |
| `privacy_mode` | enum string | `uacp.privacy_mode` | One of `smart` \| `private` \| `incognito`. Drives the content-visibility affordance (§7.3). |
| `subject` | string | `uacp.subject` | Opaque owner id; render as an avatar/owner badge, not raw. |
| `fanout_id` | string | `uacp.fanout_id` | Grouping key — spans sharing a value render as one collapsible parallel-eval group (§7.4). |
| `artifact_id` | string | `uacp.artifact_id` | Deep-link target to the UACP context artifact this span produced or consumed. |
| `session_id` | string | `uacp.session_id` | Groups spans belonging to one conversation/session. |
| `status` | enum string | OTel span status | `ok` \| `error` \| `unset`. Note: `incognito` spans are forced to `unset` (§4); a UI MUST NOT render `unset` as an error. |

### §7.2 — Cost is derived, never transported

Cost MUST NOT be set as a span attribute. UACP-Trace deliberately carries token counts
(`gen_ai.usage.*`) but not money: prices change, vary per contract, and differ per
currency, so a frozen cost on a span would be wrong the moment a price sheet changes.

A product that displays cost SHOULD compute it at render time:

```
cost.amount   = input_tokens  * price_table[vendor][model].input_per_token
              + output_tokens * price_table[vendor][model].output_per_token
cost.currency = price_table[vendor][model].currency   # e.g. "USD"
cost.estimated = true   # always true for a UI-derived figure
```

When `tokens_in`/`tokens_out` are absent (e.g. `private`/`incognito` spans that still
expose usage, or providers that omit usage), the UI MUST omit cost rather than display a
zero or partial figure.

### §7.3 — Privacy-mode rendering

The panel's content affordance (whether a span row can expand to show prompt/completion
text) is driven entirely by `uacp.privacy_mode` and `uacp.sensitive` (§4). UIs MUST NOT
attempt to display content that the privacy model strips:

| `privacy_mode` | Content expansion | Metrics row (model, tokens, latency, vendor) |
|----------------|-------------------|----------------------------------------------|
| `smart` | Show prompt/completion when present | Always shown |
| `private` | Hidden — render a "content hidden (private)" placeholder | Always shown (topology + metrics are retained) |
| `incognito` | Hidden — render a "not retained (incognito)" placeholder | Shown only if the span was exported at all; many incognito spans never reach the UI |

Because every metrics field in §7.1 derives from non-content attributes or span timing,
the **metrics row is always renderable**, including for `private` and `incognito` spans.
This is the property that lets a workbench show a full execution timeline without leaking
content.

### §7.4 — Fanout / grouping

Spans that share a `uacp.fanout_id` represent one parallel-evaluation group (§5). A trace
panel SHOULD render them as a single collapsible node:

- **Group header:** the `stage` (typically `parallel_eval`), the count of child spans, and
  aggregate metrics — summed `tokens_total`, summed `cost`, and **max** `latency_ms`
  (wall-clock of the slowest branch, since branches run in parallel).
- **Children:** one row per sibling span, each with its own `model`/`vendor`/token/latency
  fields from §7.1.

Spans without a `uacp.fanout_id` render as ordinary single rows. Nesting beyond the
parent/child + fanout-group structure SHOULD follow the OTel span parent/child graph
(`parent_span_id`).

### §7.5 — Product mapping guidance (Inkfold and similar)

Products that already emit an internal orchestrator trace (e.g. Inkfold's trace drawer)
SHOULD map their internal model to UACP-Trace as the integration boundary rather than
inventing a parallel vocabulary:

1. **Emit OTel gen_ai spans** with the `uacp.*` attributes from §3 at the orchestrator
   layer — one span per model/tool call.
2. **Project, don't store.** Build the UI view-model from the §7.1 mapping at render time.
   Internal fields that have no §7.1 counterpart (e.g. a product-specific step label) MAY
   be kept as a UI-only annotation but MUST NOT be required for another product to render
   the trace.
3. **Derive cost in the product**, per §7.2, using the product's own price table; never
   persist cost on the span.
4. **Honor privacy at the source.** Set `uacp.privacy_mode`/`uacp.sensitive` per §4 when
   the span is created, so the collector (not the UI) is the redaction authority. The UI
   then needs only to read `privacy_mode` to choose the affordance in §7.3.

This keeps execution traces out of UACP-Core (context artifacts only) while giving every
product a common, content-safe projection for its trace panel.

---

## §8 — OpenInference Compatibility (informative)

For consumers using Arize Phoenix or other OpenInference-aware platforms, emit the
following optional compatibility attribute:

```
openinference.span.kind = "LLM"  # or RERANKER, GUARDRAIL, EVALUATOR as appropriate
```

This is informational and does not affect UACP-Trace compliance.

---

## §9 — Migration from UACP-Core v1 trace kind

The UACP-Core v1 `trace` kind had the following fields:

| v1 field | UACP-Trace v2 mapping |
|----------|-----------------------|
| `tool` | `gen_ai.system` |
| `command` | `gen_ai.operation.name` |
| `model` | `gen_ai.request.model` |
| `duration_ms` | OTel span duration |
| `tokens_in` | `gen_ai.usage.input_tokens` |
| `tokens_out` | `gen_ai.usage.output_tokens` |
| `privacy_mode` | `uacp.privacy_mode` |
| `session_id` | `uacp.session_id` |

All v1 fields map cleanly to v2. No information is lost in migration.

---

## §9b — Reference Implementation Sketch (informative)

The following Python sketch shows how to instrument a UACP-aware LLM call using the
OTel Python SDK. It is informative only — implementations MAY differ in language or SDK.

```python
from opentelemetry import trace
from opentelemetry.semconv._incubating.attributes import gen_ai_attributes as GenAI

tracer = trace.get_tracer("fusionlayer.uacp-trace", "2.0.0")

def call_llm(prompt: str, model: str, uacp_ctx: dict) -> str:
    privacy_mode = uacp_ctx.get("privacy_mode", "smart")

    with tracer.start_as_current_span("gen_ai.execute") as span:
        # OTel gen_ai base attributes
        span.set_attribute(GenAI.GEN_AI_SYSTEM, "openai")
        span.set_attribute(GenAI.GEN_AI_OPERATION_NAME, "chat")
        span.set_attribute(GenAI.GEN_AI_REQUEST_MODEL, model)

        # uacp.* extension attributes
        span.set_attribute("uacp.privacy_mode", privacy_mode)
        span.set_attribute("uacp.subject", uacp_ctx["subject"])
        span.set_attribute("uacp.audience", uacp_ctx.get("audience", []))
        span.set_attribute("uacp.scope", uacp_ctx.get("scope", "individual"))

        if uacp_ctx.get("artifact_id"):
            span.set_attribute("uacp.artifact_id", uacp_ctx["artifact_id"])
        if uacp_ctx.get("session_id"):
            span.set_attribute("uacp.session_id", uacp_ctx["session_id"])

        # Privacy enforcement
        if privacy_mode == "incognito":
            span.set_attribute("uacp.sensitive", True)
            # Collector config drops gen_ai.prompt / gen_ai.completion for sensitive spans
        # (private mode: collector config hides inputs only; no span-level flag needed)

        response = _do_llm_call(prompt, model)

        span.set_attribute(GenAI.GEN_AI_USAGE_INPUT_TOKENS, response.usage.input_tokens)
        span.set_attribute(GenAI.GEN_AI_USAGE_OUTPUT_TOKENS, response.usage.output_tokens)

        return response.content
```

Fanout span (parallel eval) example:

```python
fanout_id = str(uuid.uuid4())
for perspective in perspectives:
    with tracer.start_as_current_span("gen_ai.execute") as span:
        span.set_attribute(GenAI.GEN_AI_OPERATION_NAME, "parallel_eval")
        span.set_attribute("uacp.fanout_id", fanout_id)
        span.set_attribute("uacp.privacy_mode", privacy_mode)
        # ... rest of attributes
```

---

## §10 — Upstream RFC Candidates

The following additions are proposed for upstream OpenTelemetry governance:

1. **`gen_ai.operation.name = "parallel_eval"`** — file in `open-telemetry/semantic-conventions`
   for fanout/multi-perspective evaluation topology.

2. **Per-attribute sensitivity classification** — propose a `gen_ai.attribute.sensitivity`
   metadata standard that enables collector-side attribute stripping without global
   `hide_inputs=True`. This is more surgical than TraceConfig suppression.

---

## Annex A — Change History

| Version | Date       | Summary |
|---------|------------|---------|
| v1      | 2026-05-09 | Initial `trace` kind in UACP-Core (fields: tool, command, model, duration_ms, tokens_in/out, privacy_mode, session_id). |
| v2      | 2026-05-21 | Moved out of UACP-Core into standalone UACP-Trace spec. Rebased on OTel gen_ai profile + `uacp.*` extension layer per ADR 0038 investigation ([#79](https://github.com/hn2/uacp/issues/79)). |
| v2.1    | 2026-06-15 | Added §7 UI-facing mapping for workbench trace panels (stage/model/vendor/tokens/latency/cost/privacy/fanout), cost-is-derived rule, privacy-mode rendering, and product mapping guidance ([#88](https://github.com/hn2/uacp/issues/88)). |
