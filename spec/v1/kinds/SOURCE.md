# UACP-Source — Kind Specification v1

**Kind:** `source`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value    |
|-----------------|----------|
| kind            | `source` |
| schema_version  | 1        |
| uacp_version    | 1        |

---

## §2 — Purpose

A `source` artifact records a citation or reference material — a URL, document, or data feed — that an AI system uses when generating responses. Sources cross vendor boundaries so a user's reference library is available in every tool they use.

**Scope:** Citation and reference tracking. For injecting content directly, use `memory`. `source` records the pointer; `memory` records the extracted knowledge.

---

## §3 — Body Schema

```jsonc
{
  "title": "string (required)",
  "url": "string (optional, HTTPS URL)",
  "type": "'webpage' | 'document' | 'feed' | 'api'  (required)",
  "last_fetched": "ISO 8601 datetime (optional)",
  "content_hash": "string (optional) — sha256 of the content snapshot at last_fetched"
}
```

### Field rules

| Field         | Type            | Required | Constraints                              |
|---------------|-----------------|----------|------------------------------------------|
| title         | string          | YES      | ≤256 chars, non-empty                    |
| url           | string          | NO       | HTTPS only; ≤2048 chars                  |
| type          | enum            | YES      | See source type values below             |
| last_fetched  | ISO 8601 string | NO       | When the source content was last fetched |
| content_hash  | string          | NO       | `sha256:` prefix + 64-char hex digest    |

### Source type values

| Value      | Meaning                                                             |
|------------|---------------------------------------------------------------------|
| `webpage`  | A public or private web page                                        |
| `document` | A file (PDF, DOCX, TXT, etc.)                                       |
| `feed`     | An RSS/Atom feed or similar periodic update stream                  |
| `api`      | A structured API endpoint that returns data                         |

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: source
id: 3c4d5e6f-789a-4bcd-ef01-23456789abcd
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Hacker News for tech news
tags:
  - news
  - technology
signature: "sha256:4e07408562bedb8b60ce05c1decbf9719f3df6fa28f0c4de3abf7c1b5cfabe5"
body:
  title: "Hacker News"
  url: "https://news.ycombinator.com"
  type: webpage
  last_fetched: "2026-05-16T08:00:00Z"
  content_hash: "sha256:2c624232cdd221771294dfbb310acbc8a4af45a16a08b3fc3de1deb7ff6bebe"
```

---

## §5 — Notes

- `url` is OPTIONAL because some sources are local documents with no URL (e.g., a user-uploaded PDF). In that case, `title` MUST be sufficient to identify the source.
- `content_hash` is a snapshot fingerprint, not a live checksum. Implementations SHOULD use it to detect whether content has changed since `last_fetched`.
- Implementations MUST NOT fetch `url` at artifact capture time. Fetching is a separate engine operation driven by the user's connected-source configuration.
- For `feed` type, the `url` SHOULD point to the feed endpoint (e.g., `https://hnrss.org/frontpage`), not the human-readable site.
- A `source` artifact MAY be referenced in `pack` and `playbook` artifacts to declare the data sources a pack depends on.
