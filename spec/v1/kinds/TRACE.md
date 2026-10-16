# UACP-Trace — Kind Specification v1

**Kind:** `trace`
**Schema version:** 1
**Status:** Moved — `trace` was removed from UACP-Core kinds in v0.2 (per ADR 0038). This file is
preserved as a starting point for the standalone UACP-Trace spec. See [uacp#79](https://github.com/hn2/uacp/issues/79)
for the investigation into whether UACP-Trace should profile OpenTelemetry or be authored from scratch.

---

## §1 — Kind and Version

| Field           | Value   |
|-----------------|---------|
| kind            | `trace` |
| schema_version  | 1       |
| uacp_version    | 1       |

---

## §2 — Purpose

A `trace` artifact records operational telemetry for a single AI tool invocation — what tool ran, what command, how long it took, how many tokens it used, and under what privacy mode. Traces enable cross-vendor observability, usage analytics, and cost attribution without sharing prompt content.

**Scope:** Operational telemetry only. `trace` does NOT contain prompt text, responses, or user data. For audit events with hash-chain integrity, see the context-sharing `signed-event-envelope` spec.

---

## §3 — Body Schema

```jsonc
{
  "tool": "string (required) — tool or vendor name",
  "command": "string (optional) — sub-command or operation name",
  "model": "string (optional) — model identifier used",
  "duration_ms": "integer (required) — wall-clock duration in milliseconds",
  "tokens_in": "integer (optional) — input token count",
  "tokens_out": "integer (optional) — output token count",
  "privacy_mode": "string (required) — 'smart' | 'private' | 'incognito'",
  "session_id": "string (optional) — opaque session identifier, non-PII"
}
```

### Field rules

| Field        | Type    | Required | Constraints                                         |
|--------------|---------|----------|-----------------------------------------------------|
| tool         | string  | YES      | ≤128 chars — tool or vendor name                    |
| command      | string  | NO       | ≤256 chars — CLI subcommand or API method name      |
| model        | string  | NO       | ≤128 chars — model identifier as reported by vendor |
| duration_ms  | integer | YES      | ≥ 0                                                 |
| tokens_in    | integer | NO       | ≥ 0                                                 |
| tokens_out   | integer | NO       | ≥ 0                                                 |
| privacy_mode | string  | YES      | `smart`, `private`, or `incognito`                  |
| session_id   | string  | NO       | ≤128 chars, opaque, MUST NOT contain PII            |

### Privacy mode values

| Value       | Meaning                                                                         |
|-------------|---------------------------------------------------------------------------------|
| `smart`     | Trace is stored and used for crowd intelligence (opted in)                      |
| `private`   | Trace is stored for personal analytics only (not shared)                        |
| `incognito` | Trace MUST NOT be stored or transmitted. Implementations MUST drop incognito traces. |

---

## §4 — OpenTelemetry Mapping

`trace` artifacts can be translated to OpenTelemetry spans:

| UACP field   | OpenTelemetry attribute           |
|--------------|-----------------------------------|
| `tool`       | `service.name`                    |
| `command`    | `span.name`                       |
| `model`      | `db.system` (or `gen_ai.request.model`) |
| `duration_ms`| Span duration                     |
| `tokens_in`  | `gen_ai.usage.input_tokens`       |
| `tokens_out` | `gen_ai.usage.output_tokens`      |
| `session_id` | `session.id`                      |

---

## §5 — Complete Example

```yaml
uacp_version: 1
kind: trace
id: 5e6f7a8b-9cde-4f01-2345-6789abcdef01
schema_version: 1
version: 1.0.0
author: "system"
created_at: "2026-05-16T09:00:00Z"
description: Trace for fl recall command
tags:
  - telemetry
  - cli
signature: "sha256:7c4a8d5e6f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c"
body:
  tool: "fusionlayer-cli"
  command: "recall"
  model: null
  duration_ms: 143
  tokens_in: null
  tokens_out: null
  privacy_mode: smart
  session_id: "sess_a1b2c3d4"
```

---

## §6 — Notes

- Implementations MUST drop `trace` artifacts where `privacy_mode` is `incognito`. The engine MUST NOT persist, transmit, or log them.
- `session_id` MUST be opaque and MUST NOT encode user identity or PII. Use a random UUID or a hashed session token.
- `model` SHOULD use the vendor's canonical model identifier (e.g., `claude-sonnet-4-6`, `gpt-4o`).
- Trace is operational telemetry, NOT an audit event. For tamper-evident audit records, use the hash-chain mechanism in the context-sharing spec.
- Implementations SHOULD batch trace emissions (e.g., buffer for up to 10 seconds) rather than emitting on every call to reduce latency impact.
- If the trace endpoint is unavailable, implementations MUST drop the trace silently. Trace emission MUST NEVER block or fail the primary operation.
