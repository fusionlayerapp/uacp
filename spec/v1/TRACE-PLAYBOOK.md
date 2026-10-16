# TRACE and PLAYBOOK Semantics v1

This document specifies the TRACE instrumentation event and the PLAYBOOK error-handling rule shape for UACP implementations. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## §1 — TRACE Event

A TRACE event captures a single span of UACP processing. It is used for distributed tracing across producers, consumers, and processors.

### §1.1 — Shape

```json
{
  "type": "TRACE",
  "trace_id": "<uuid>",
  "parent_trace_id": "<uuid>|null",
  "span_kind": "PRODUCER|CONSUMER|PROCESSOR",
  "operation": "<string>",
  "duration_ms": 42,
  "status": "OK|ERROR|TIMEOUT",
  "attributes": {}
}
```

### §1.2 — Field Definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | REQUIRED | MUST be the literal string `"TRACE"`. |
| `trace_id` | UUID string | REQUIRED | Unique identifier for this span. |
| `parent_trace_id` | UUID string or `null` | REQUIRED | UUID of the parent span; `null` for root spans. |
| `span_kind` | enum | REQUIRED | One of `PRODUCER`, `CONSUMER`, or `PROCESSOR`. |
| `operation` | string | REQUIRED | Human-readable name of the operation being traced. MUST NOT be empty. Maximum 256 characters. |
| `duration_ms` | integer | REQUIRED | Wall-clock duration in milliseconds. MUST be ≥ 0. |
| `status` | enum | REQUIRED | One of `OK`, `ERROR`, or `TIMEOUT`. |
| `attributes` | object | REQUIRED | Arbitrary key-value metadata. MAY be an empty object `{}`. All keys MUST be strings. |

### §1.3 — Span Kind Semantics

- `PRODUCER`: The span represents the creation or emission of a UACP event.
- `CONSUMER`: The span represents the receipt and processing of a UACP event by a downstream handler.
- `PROCESSOR`: The span represents an intermediate transformation or routing step.

### §1.4 — Error Status Requirement

When `status` is `ERROR`, the `attributes` object MUST contain an `"error"` key whose value is a non-empty string UACP error code. Implementations MUST reject TRACE events with `status: "ERROR"` that omit the `"error"` attribute.

### §1.5 — Circular Parent Reference Prohibition

A TRACE event MUST be rejected if its `trace_id` appears in the `parent_trace_id` chain of any ancestor span already known to the receiver. Implementations MUST detect and reject circular parent references with error code `CIRCULAR_TRACE_PARENT`. The rejection MUST occur before any storage or forwarding of the event.

## §2 — PLAYBOOK Error-Handling Rules

A PLAYBOOK rule specifies how a UACP pipeline node responds to errors during event processing.

### §2.1 — Shape

```json
{
  "on_error": "ABORT|RETRY|SKIP|COMPENSATE",
  "max_retries": 3,
  "compensation_event_type": "CONTEXT_REVOKED"
}
```

### §2.2 — Field Definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `on_error` | enum | REQUIRED | One of `ABORT`, `RETRY`, `SKIP`, or `COMPENSATE`. |
| `max_retries` | integer | OPTIONAL | Only meaningful when `on_error` is `RETRY`. MUST be ≥ 1 when present. Defaults to `3` when `on_error` is `RETRY` and this field is absent. |
| `compensation_event_type` | string | CONDITIONAL | REQUIRED when `on_error` is `COMPENSATE`. MUST be a valid UACP event type (core or registered custom kind). |

### §2.3 — Action Semantics

**ABORT**: The pipeline halts immediately. No further processing or retry occurs. The error is propagated to the caller.

**RETRY**: The failing operation is retried up to `max_retries` times. When `max_retries` is absent, implementations MUST default to `3`. After exhausting retries the pipeline MUST fall back to `ABORT` semantics.

**SKIP**: The failing event is discarded and the pipeline continues with the next event. No error is propagated.

**COMPENSATE**: The pipeline emits a compensation event of type `compensation_event_type` and then halts. The compensation event MUST be a valid UACP event and MUST be successfully enqueued before the current pipeline halts.

### §2.4 — COMPENSATE Validation

When `on_error` is `COMPENSATE`, implementations MUST validate that `compensation_event_type` is a known UACP event type (either a core kind or a registered custom kind per `CUSTOM-KINDS.md`). If the value is not a recognised event type, implementations MUST reject the PLAYBOOK rule at configuration time with error code `INVALID_COMPENSATION_TYPE`.

### §2.5 — RETRY Default

Implementations MUST treat an absent `max_retries` field as equivalent to `max_retries: 3` when `on_error` is `RETRY`. Implementations MUST NOT interpret an absent `max_retries` as unlimited retries.

## §3 — Error Codes

| Code | Description |
|---|---|
| `CIRCULAR_TRACE_PARENT` | A TRACE event's parent chain forms a cycle. |
| `INVALID_COMPENSATION_TYPE` | The `compensation_event_type` in a PLAYBOOK rule is not a valid UACP event type. |

## §4 — Test Vectors

Conformance implementations MUST pass all cases in `conformance/vectors/trace-playbook.json`. The five named cases are:

| Vector name | Description |
|---|---|
| `test_trace_span_tree_accepted` | A root span (null parent) and two child spans with valid parent references. All three MUST be accepted. |
| `test_circular_trace_parent_rejected` | Span A has parent B; span B has parent A. Result: rejected, error `CIRCULAR_TRACE_PARENT`. |
| `test_playbook_retry_uses_default_3_when_unset` | PLAYBOOK with `on_error: "RETRY"` and no `max_retries` field. Implementation MUST apply exactly 3 retries before aborting. |
| `test_playbook_compensate_emits_compensation_event` | PLAYBOOK with `on_error: "COMPENSATE"` and `compensation_event_type: "CONTEXT_REVOKED"`. On error, a `CONTEXT_REVOKED` event MUST be emitted before the pipeline halts. |
| `test_trace_error_status_requires_error_attribute` | TRACE event with `status: "ERROR"` and no `"error"` key in `attributes`. Result: rejected. |

## §5 — Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-17 | Initial spec. |
