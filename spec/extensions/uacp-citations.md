# uacp-citations — Per-Claim Citations Extension

**Status:** Draft  
**Version:** 0.3.0  
**Identifier:** `uacp-citations`  
**Spec track:** v0.3.3

---

## Overview

`uacp-citations` captures per-claim source citations attached to assistant messages. This models the citation patterns produced by Perplexity AI, Claude's "Use search" mode, and similar retrieval-augmented systems.

Core UACP already supports a `citations` array on messages (introduced in v0.6.0). This extension documents the full semantics, validation rules, and multi-source form.

---

## Citation object schema

Each item in `citations` is an object with the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `span` | [integer, integer] | yes | `[start, end]` byte offsets into the message's text content. `end` is exclusive. Both must be ≥ 0; `end` must be > `start`. |
| `source` | object | yes | The source being cited. |
| `source.url` | string | yes | Canonical URL of the source. Must begin with `http://` or `https://`. |
| `source.title` | string | no | Title of the cited page or document. |
| `source.snippet` | string | no | The specific passage from the source that supports the claim. |
| `source.retrieved_at` | string | no | ISO 8601 datetime when the source was fetched. |

---

## Multi-source citations

A single span may reference multiple sources. Implementations **may** represent this by including multiple citation objects with the same `span`, each with a different `source`.

---

## Span semantics

Offsets are calculated over the UTF-8 encoded text of the `content` field (or the concatenated text of all `text`-type content blocks, in order, if `content` is an array). The span identifies the exact claim text within the response.

Implementations **should** validate that `span[1] ≤ len(content)`.

---

## Validation

Implementations claiming `uacp-citations` conformance **must** reject:
- Citations where `span` is not a two-element array of non-negative integers.
- Citations where `span[0] >= span[1]`.
- Citations where `source.url` does not begin with `http://` or `https://`.

---

## Examples

### Single citation

```json
{
  "uacp": "0.3.0",
  "id": "conv-cite-001",
  "tool": "perplexity",
  "extensions": ["uacp-citations"],
  "messages": [
    {
      "role": "user",
      "content": "What is the speed of light?"
    },
    {
      "role": "assistant",
      "content": "The speed of light in a vacuum is approximately 299,792,458 metres per second.",
      "citations": [
        {
          "span": [0, 74],
          "source": {
            "url": "https://physics.nist.gov/cgi-bin/cuu/Value?c",
            "title": "NIST — Speed of light in vacuum",
            "snippet": "299 792 458 m s-1"
          }
        }
      ]
    }
  ]
}
```

### Multiple citations

```json
{
  "role": "assistant",
  "content": "Python was created by Guido van Rossum and first released in 1991. It emphasises code readability.",
  "citations": [
    {
      "span": [0, 55],
      "source": {
        "url": "https://docs.python.org/3/faq/general.html",
        "title": "Python FAQ",
        "snippet": "Python was created by Guido van Rossum."
      }
    },
    {
      "span": [57, 96],
      "source": {
        "url": "https://www.python.org/doc/essays/blurb/",
        "title": "What is Python?",
        "snippet": "Python is a programming language that lets you work quickly and integrate systems more effectively."
      }
    }
  ]
}
```

---

## Extension declaration

```json
{ "extensions": ["uacp-citations"] }
```

The `citations` field is already defined in core UACP (v0.6.0). Declaring this extension signals that the full citation semantics (span offsets, source metadata, multi-source form) are present and validatable.

Consumers that do not understand this extension **may** ignore the `citations` array entirely.
