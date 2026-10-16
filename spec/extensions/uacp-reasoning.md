# uacp-reasoning — Reasoning Blocks Extension

**Status:** Draft  
**Version:** 0.3.0  
**Identifier:** `uacp-reasoning`  
**Spec track:** v0.3.2

---

## Overview

`uacp-reasoning` captures extended-thinking or chain-of-thought content produced by models that expose internal reasoning traces. Examples include Claude's extended thinking mode and OpenAI's o-series reasoning tokens.

Reasoning content is distinct from the visible response: it represents the model's internal scratchpad and may or may not be surfaced to the user depending on the tool and model configuration.

---

## Content block type: `thinking`

A `thinking` content block carries reasoning content inline alongside other content blocks.

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"thinking"` | yes | Identifies this as a thinking block. |
| `text` | string | yes | The reasoning content. May be empty string if the model returned a zero-length thinking block. |
| `model_visibility` | `"visible"` \| `"hidden"` | no | Whether the model's interface surfaced this to the user. Default `"hidden"`. |
| `tokens` | integer | no | Token count for this reasoning block, if reported by the vendor. |

---

## Message-level field: `reasoning`

Alternatively, reasoning content may be captured at the message level as a standalone object (for implementations that store thinking separately from structured content blocks):

| Field | Type | Description |
|---|---|---|
| `reasoning` | object | Top-level reasoning object. |
| `reasoning.content` | string | Full reasoning trace text. |
| `reasoning.model_visibility` | `"visible"` \| `"hidden"` | Whether surfaced to the user. Default `"hidden"`. |
| `reasoning.tokens` | integer | Token count, if reported. |

Implementations **should** prefer inline `thinking` content blocks (included in `content[]`) when the reasoning is interleaved with response text. Use the message-level `reasoning` field when the tool captures reasoning as a separate artifact.

---

## Privacy note

Reasoning content may contain sensitive intermediate analysis. Tools capturing this data **should** respect the user's privacy classification (the optional `metadata.uacp_privacy.level` convention from README §10). Implementations that encrypt conversation content **must** include reasoning content in the encrypted body.

---

## Validation

Implementations claiming `uacp-reasoning` conformance **must**:
- Validate that `thinking` content blocks include a non-null `text` field.
- Validate that `reasoning.model_visibility` is `"visible"` or `"hidden"` when present.

---

## Examples

### Inline thinking block (Claude extended thinking)

```json
{
  "uacp": "0.3.0",
  "id": "conv-thinking-001",
  "tool": "claude",
  "extensions": ["uacp-reasoning"],
  "messages": [
    {
      "role": "user",
      "content": "Is 17 prime?"
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "thinking",
          "text": "17 — check divisibility by 2 (no), 3 (no), the square root is ~4.1 so I only need to check up to 4. Not divisible by 2 or 3. Therefore prime.",
          "model_visibility": "hidden",
          "tokens": 34
        },
        {
          "type": "text",
          "text": "Yes, 17 is a prime number."
        }
      ]
    }
  ]
}
```

### Message-level reasoning field

```json
{
  "uacp": "0.3.0",
  "id": "conv-reasoning-002",
  "tool": "openai",
  "extensions": ["uacp-reasoning"],
  "messages": [
    {
      "role": "user",
      "content": "Solve: 3x + 7 = 22"
    },
    {
      "role": "assistant",
      "content": "x = 5",
      "reasoning": {
        "content": "3x + 7 = 22 → 3x = 15 → x = 5",
        "model_visibility": "hidden",
        "tokens": 18
      }
    }
  ]
}
```

---

## Extension declaration

```json
{ "extensions": ["uacp-reasoning"] }
```

Consumers that do not understand this extension **may** ignore `thinking` content blocks and the `reasoning` message field. The visible response remains intact.
