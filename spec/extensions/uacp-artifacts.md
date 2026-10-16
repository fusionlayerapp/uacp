# uacp-artifacts — Artifacts Extension

**Status:** Draft  
**Version:** 0.3.0  
**Identifier:** `uacp-artifacts`  
**Spec track:** v0.3.4

---

## Overview

`uacp-artifacts` captures rendered artifacts produced by AI tools: code, documents, SVG graphics, React components, and HTML previews. This models the Claude Artifacts panel and the ChatGPT Canvas feature.

Core UACP already defines `artifacts` on messages (introduced in v0.6.0). This extension documents the full semantics, versioning rules, and the `artifact_ref` content block for cross-message references.

---

## Artifact object schema

Each item in a message's `artifacts` array is an object with the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier for this artifact within the conversation. Must be non-empty. Referenced by `artifact_ref` content blocks. |
| `type` | string | yes | Artifact type. One of: `code`, `html`, `svg`, `markdown`, `react`, `text`. |
| `title` | string | yes | Human-readable title (e.g. filename or description). Must be non-empty. |
| `content` | string | yes | Full artifact content. |
| `language` | string | no | Programming language for `type: "code"` artifacts (e.g. `"python"`, `"javascript"`). |
| `version` | integer | no | Version counter, incremented when the artifact is edited. Starts at 1. |
| `created_at` | string | no | ISO 8601 datetime when first created. |
| `updated_at` | string | no | ISO 8601 datetime of last edit. |

---

## `artifact_ref` content block

An `artifact_ref` content block is a pointer from the message text to an artifact object. It signals "the artifact with this `id` was rendered in-place at this point in the conversation."

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"artifact_ref"` | yes | Block type. |
| `id` | string | yes | `id` of the artifact being referenced. |
| `title` | string | no | Denormalized title, useful for consumers that render references without loading the artifact. |

---

## Versioning

When a user edits an artifact, the updated version appears in the next assistant message's `artifacts` array with the **same `id`** and an incremented `version`. This allows consumers to reconstruct the edit history by scanning all messages for artifacts with matching ids.

---

## Uniqueness

Artifact `id` values **must** be unique within a single message's `artifacts` array. The same `id` may appear in `artifacts` arrays across different messages (versioning). An `artifact_ref` `id` **should** match an artifact `id` somewhere in the conversation.

---

## Validation

Implementations claiming `uacp-artifacts` conformance **must** reject:
- Artifacts where `id`, `title`, or `content` are empty strings.
- Artifacts where `type` is not one of the defined enum values.
- `artifact_ref` blocks where `id` is missing or empty.

Implementations **should** warn (but not reject) when an `artifact_ref` references an `id` that does not appear in any message's `artifacts` array.

---

## Examples

### Single code artifact

```json
{
  "uacp": "0.3.0",
  "id": "conv-artifact-001",
  "tool": "claude",
  "extensions": ["uacp-artifacts"],
  "messages": [
    {
      "role": "user",
      "content": "Write a Python function to check if a number is prime."
    },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "Here is a prime-checking function:" },
        { "type": "artifact_ref", "id": "art-prime-1", "title": "is_prime.py" }
      ],
      "artifacts": [
        {
          "id": "art-prime-1",
          "type": "code",
          "title": "is_prime.py",
          "language": "python",
          "content": "def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True\n",
          "version": 1
        }
      ]
    }
  ]
}
```

### Artifact edit (version 2)

```json
{
  "uacp": "0.3.0",
  "id": "conv-artifact-edit",
  "tool": "claude",
  "extensions": ["uacp-artifacts"],
  "messages": [
    {
      "role": "user",
      "content": "Write an SVG circle."
    },
    {
      "role": "assistant",
      "content": [
        { "type": "artifact_ref", "id": "art-svg-1", "title": "circle.svg" }
      ],
      "artifacts": [
        {
          "id": "art-svg-1",
          "type": "svg",
          "title": "circle.svg",
          "content": "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"blue\"/></svg>",
          "version": 1
        }
      ]
    },
    {
      "role": "user",
      "content": "Make it red."
    },
    {
      "role": "assistant",
      "content": [
        { "type": "artifact_ref", "id": "art-svg-1", "title": "circle.svg" }
      ],
      "artifacts": [
        {
          "id": "art-svg-1",
          "type": "svg",
          "title": "circle.svg",
          "content": "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"red\"/></svg>",
          "version": 2
        }
      ]
    }
  ]
}
```

---

## Extension declaration

```json
{ "extensions": ["uacp-artifacts"] }
```

The `artifacts` field is already defined in core UACP (v0.6.0). Declaring this extension signals that the full artifact semantics (versioning, `artifact_ref` cross-references, language field) are present and validatable.

Consumers that do not understand this extension **may** ignore the `artifacts` array and `artifact_ref` content blocks.
