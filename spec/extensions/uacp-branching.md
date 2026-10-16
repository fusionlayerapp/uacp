# uacp-branching — Conversation Branching Extension

**Status:** Draft  
**Version:** 0.3.0  
**Identifier:** `uacp-branching`  
**Spec track:** v0.3.1

---

## Overview

`uacp-branching` models non-linear conversation trees: scenarios where a user edits a prior message or regenerates a response, producing divergent conversation threads from a shared ancestor.

This pattern appears in ChatGPT (message edit + regenerate), Claude (edit message), and similar interfaces. Core UACP represents a linear sequence; this extension preserves the full tree.

---

## Message-level fields

Two optional fields are added to each message object when this extension is active:

| Field | Type | Description |
|---|---|---|
| `branch_parent_id` | string | `id` of the message this branch diverges from. Omit for root messages and linear sequences. |
| `branch_label` | string | Human-readable label for this branch (e.g. `"v2"`, `"shorter"`, `"attempt-3"`). Optional. |

---

## Tree invariants

1. Every `branch_parent_id` value **must** reference a message `id` that exists in the same `messages` array.
2. The graph formed by `branch_parent_id` pointers **must** be acyclic (a forest of trees with shared roots).
3. A message without `branch_parent_id` is either a root or a linear continuation of the immediately preceding message (consumers may infer structure from positional ordering).

---

## Validation

Implementations that claim `uacp-branching` conformance **must** reject documents where:
- Any `branch_parent_id` value does not match an existing message `id`.
- Any cycle exists in the `branch_parent_id` → `id` graph.

---

## Example: ChatGPT-style edit and regenerate

```json
{
  "uacp": "0.3.0",
  "id": "conv-branch-001",
  "tool": "chatgpt",
  "extensions": ["uacp-branching"],
  "messages": [
    { "id": "m1", "role": "user",      "content": "What is 2+2?" },
    { "id": "m2", "role": "assistant", "content": "4" },
    { "id": "m3", "role": "user",      "content": "What is 2+3?",
      "branch_parent_id": "m1", "branch_label": "edited-question" },
    { "id": "m4", "role": "assistant", "content": "5",
      "branch_parent_id": "m2", "branch_label": "edited-question" }
  ]
}
```

---

## Example: Multiple regenerations

```json
{
  "uacp": "0.3.0",
  "id": "conv-branch-regen",
  "tool": "claude",
  "extensions": ["uacp-branching"],
  "messages": [
    { "id": "m1", "role": "user",      "content": "Write a haiku about rain." },
    { "id": "m2", "role": "assistant", "content": "Soft drops on the glass / silver lines race each other / the garden drinks deep",
      "branch_label": "attempt-1" },
    { "id": "m3", "role": "assistant", "content": "Rain taps the window / puddles mirror the grey sky / frogs wake and rejoice",
      "branch_parent_id": "m1", "branch_label": "attempt-2" }
  ]
}
```

---

## Extension declaration

Documents using branching fields **should** include `"uacp-branching"` in the top-level `extensions` array:

```json
{ "extensions": ["uacp-branching"] }
```

Consumers that do not understand this extension **may** treat all messages as a flat linear sequence (ignoring `branch_parent_id` / `branch_label`).
