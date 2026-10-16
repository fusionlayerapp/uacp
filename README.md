# Unified AI Context Protocol (UACP) — Specification v0.6.0

[![npm version](https://img.shields.io/npm/v/uacp.svg)](https://www.npmjs.com/package/uacp)
[![CI](https://github.com/hn2/uacp/actions/workflows/validate.yml/badge.svg)](https://github.com/hn2/uacp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Spec version](https://img.shields.io/badge/spec-v0.6.0-brightgreen.svg)](docs/RELEASE-NOTES-v0.6.0.md)

**Vendor-neutral conversation format. Adopted by FusionLayer engine.**

UACP Core v0.6.0 — vendor-neutral conversation format. Optional encryption envelope extension (`uacp-encryption`) for interoperable encrypted interchange.


Relationship and boundary guidance with ACP: [docs/ACP-UACP-RELATIONSHIP.md](docs/ACP-UACP-RELATIONSHIP.md)

Profile and implementation adapter guidance: [docs/UACP-PROFILES.md](docs/UACP-PROFILES.md)

## Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals.

All timestamps in UACP are **RFC 3339 / ISO 8601**, normalized to **UTC**, with **millisecond precision**: `YYYY-MM-DDTHH:MM:SS.sssZ` (the `.sss` fractional-seconds segment is RECOMMENDED; parsers MUST accept values without it). Non-UTC offsets MUST NOT be emitted.

All character-offset fields (e.g. citation `span`) count **Unicode scalar values** (Unicode code points) across the concatenation of the message's text content — equivalently `Array.from(text).length` in JavaScript or iteration over Python `str`. Byte offsets, UTF-16 code units, and grapheme clusters MUST NOT be used.

---

## 1. Overview

UACP (Unified AI Context Protocol) is an open standard for representing, storing, and exchanging AI conversation data across tools. It provides a vendor-neutral format that enables AI conversation portability — moving context freely between ChatGPT, Claude, Gemini, Cursor, and any other AI tool.

### Goals
- Vendor-neutral conversation format
- Support all AI interaction types (chat, code, agent, multimodal)
- Enable cross-tool context injection
- Extensible for tool-specific data via optional extensions and metadata

### Non-Goals
- Define encryption or transport (those are implementation choices — see `uacp-encryption` extension)
- Replace tool-native formats (UACP is an interchange format)
- Mandate real-time sync (sync is implementation-level)
- Define any particular privacy model (that is implementation policy — see "Privacy metadata convention" in §10)

---

## 2. Conversation Object

A UACP conversation is a JSON object:

```json
{
  "uacp": "0.6.0",
  "id": "conv_a1b2c3d4",
  "tool": "chatgpt",
  "model": "gpt-4o",
  "title": "Build a sync daemon in Node.js",
  "created_at": "2026-04-16T10:00:00Z",
  "updated_at": "2026-04-16T10:45:00Z",
  "messages": [
    {
      "role": "user",
      "content": "How do I watch files in Node.js?",
      "timestamp": "2026-04-16T10:00:01Z"
    },
    {
      "role": "assistant",
      "content": "Use chokidar for cross-platform file watching...",
      "timestamp": "2026-04-16T10:00:03Z",
      "model": "gpt-4o",
      "tokens": { "input": 12, "output": 312 }
    }
  ],
  "metadata": {}
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `uacp` | string | Protocol version (semver) |
| `id` | string | Unique conversation ID — recommended: ULID, UUID v7, or `conv_<alphanumeric>` |
| `tool` | string or string[] | Source tool identifier(s) — see §4. Use array for multi-tool conversations |
| `messages` | array | Ordered list of messages — array index is authoritative order; timestamps are advisory |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `model` | string or object | AI model used — string (canonical) or `{ id, provider?, snapshot_date? }` (see §2.6) |
| `title` | string | Conversation title/summary |
| `extensions` | string[] | Optional list of UACP extension identifiers this document uses (e.g. `["uacp-encryption"]`) |
| `created_at` | string | ISO 8601 timestamp |
| `updated_at` | string | ISO 8601 timestamp |
| `tags` | string[] | User-defined tags |
| `project` | string | Project/workspace context |
| `branches` | string[] | Leaf message IDs of non-linear branches (see §2.1) |
| `tool_chain` | string[] | Ordered list of tool IDs when conversation crossed multiple tools (e.g. `["claude-code", "claude"]`) |
| `metadata` | object | Freeform extension data. Use namespaced keys (e.g. `uacp_privacy.level`, `com.example.foo`) |

---

## 3. Message Object

```json
{
  "role": "user | assistant | system | tool",
  "content": "string or array",
  "timestamp": "2026-04-16T10:00:01Z"
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | One of: `user`, `assistant`, `system`, `tool` |
| `content` | string or array | Message content |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 |
| `model` | string or object | Model for this specific message (see §2.6) |
| `tokens` | object | `{ input, output }` token counts |
| `tool_calls` | array | Tool/function calls made |
| `attachments` | array | Files, images, etc. |
| `parent_id` | string | ID of parent message for branched conversations (see §2.1) |
| `status` | string | `complete` (default), `in_progress`, or `error` (see §2.5) |
| `citations` | array | Source citations on assistant messages (see §2.3) |
| `artifacts` | array | Generated artifacts on assistant messages (see §2.4) |
| `redactions` | object | DLP redaction metadata: `{ count, categories?: string[], placeholder_format: string }` |
| `metadata` | object | Tool-specific data |

### Content Types

Content can be a string (most common) or an array of content blocks:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What's in this image?" },
    { "type": "image", "url": "data:image/png;base64,..." }
  ]
}
```

Supported content block types:
- `text` — plain text
- `image` — image (url or base64)
- `file` — file attachment
- `code` — code block with language (see §2.8)
- `thinking` — reasoning/extended-thinking block (see §2.2)
- `artifact_ref` — reference to an artifact in the same message (see §2.4)
- `audio` — audio clip (url or base64, MIME type required) (see §2.7)
- `video` — video clip (url or base64, MIME type required) (see §2.7)
- `pdf` — PDF document (url or base64) (see §2.7)
- `latex` — LaTeX expression (see §2.7)

### System Messages

`role: "system"` messages carry persistent instructions or context. Rules:
- Zero or one system message allowed per conversation.
- If present, it MUST appear at index 0.
- Multiple system messages should be merged into one before UACP serialization.

### Tool Calls

The canonical ID field for correlating tool calls and results is `call_id`.

```json
{
  "role": "assistant",
  "content": "Let me search for that...",
  "tool_calls": [
    {
      "call_id": "call_abc123",
      "name": "web_search",
      "arguments": { "query": "Node.js file watching" }
    }
  ]
}
```

### Tool Results

```json
{
  "role": "tool",
  "content": "Results from web search...",
  "call_id": "call_abc123",
  "name": "web_search"
}
```

Note: implementations that encounter the legacy `id` / `tool_call_id` fields MUST treat them as aliases for `call_id`.

### Attachments

The `attachments` array items follow this schema:

```json
{
  "id": "att_report_pdf",
  "filename": "report.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 204800,
  "url": "https://example.com/report.pdf",
  "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Attachment identifier |
| `filename` | string | no | Filename hint |
| `mime_type` | string | yes | MIME type |
| `size_bytes` | number | no | File size |
| `url` | string | no | Remote URL |
| `data` | string | no | Inline base64-encoded content |
| `sha256` | string | no | SHA-256 lowercase hex digest |

---

## 4. Tool Identifiers

Standard tool identifiers (lowercase, no spaces):

| ID | Tool |
|----|------|
| `chatgpt` | ChatGPT (chat.openai.com) |
| `claude` | Claude.ai |
| `claude-code` | Claude Code CLI |
| `claude-desktop` | Claude Desktop app |
| `gemini` | Google Gemini |
| `deepseek` | DeepSeek |
| `grok` | xAI Grok |
| `perplexity` | Perplexity AI |
| `copilot` | GitHub Copilot / Microsoft Copilot |
| `cursor` | Cursor IDE |
| `windsurf` | Windsurf (Codeium) |
| `ollama` | Ollama (local models) |
| `lmstudio` | LM Studio |
| `jan` | Jan AI |
| `aider` | Aider |
| `codex` | OpenAI Codex CLI |
| `gemini-cli` | Google Gemini CLI |
| `continue` | Continue.dev |
| `cline` | Cline / Roo Code |
| `amazon-q` | Amazon Q Developer |
| `meta-ai` | Meta AI |
| `mistral` | Mistral AI (Le Chat) |
| `huggingchat` | HuggingChat |
| `groq` | Groq |
| `poe` | Poe by Quora |
| `phind` | Phind |
| `you` | You.com |
| `claude-ai` | Claude.ai web (disambiguates from `claude-code` and `claude-desktop`) |
| `zed` | Zed editor AI |
| `warp` | Warp terminal AI |
| `pieces` | Pieces for Developers |
| `raycast` | Raycast AI |
| `openwebui` | Open WebUI (Ollama frontend) |
| `anythingllm` | AnythingLLM |
| `jetbrains-ai` | JetBrains AI Assistant |

Custom tools use reverse-domain notation: `com.example.mytool`

---

## 5. Privacy Levels

Different products have different privacy models. UACP core does not dictate any particular privacy taxonomy.

The metadata key `uacp_privacy.level` is reserved as a convention for an optional, vendor-neutral privacy classification label. Use it to attach a classification hint:

```json
{
  "metadata": {
    "uacp_privacy.level": "personal"
  }
}
```

Reference values: `private`, `personal`, `team`, `public`. Default when absent: `personal`.

This is a **convention, not an extension** — implementations do not declare it in `extensions[]`. Implementations with product-specific privacy semantics SHOULD use a vendor namespace instead:

```json
"metadata": { "com.myproduct.privacy_mode": "restricted" }
```

See §10 "Privacy metadata convention" for the full guidance.

---

## 6. Encryption (optional extension)

Encryption at rest or in transit is an optional capability, not a core requirement. UACP core describes the conversation data format only. Implementations choose their own encryption strategy.

For implementations that want an interoperable encryption envelope, UACP provides the `uacp-encryption` extension:

- Schema: `schema/extensions/uacp-encryption.schema.json`
- Spec: [`spec/extensions/uacp-encryption.md`](spec/extensions/uacp-encryption.md)
- Test vectors: `test-vectors/extensions/encryption/`

The extension defines an AES-256-GCM sealed wrapper with Argon2id+HKDF key derivation. See the extension spec for the full normative description, field requirements, and key derivation pseudocode.

For multi-recipient sharing of one or more bundles under a single shared key (rather than one passphrase-derived key per conversation), UACP provides the `uacp-vault-envelope` extension:

- Schema: `schema/extensions/uacp-vault-envelope.schema.json`
- Spec: [`spec/extensions/uacp-vault-envelope.md`](spec/extensions/uacp-vault-envelope.md)
- Test vectors: `test-vectors/extensions/vault-envelope/`

The extension is crypto-agnostic at the spec level: it defines the envelope shape, per-recipient key-wrap structure, and no-plaintext-content requirements, while the key-wrap and content-cipher algorithms are implementation-declared identifiers rather than fixed by the schema. See the extension spec for the full normative description and the algorithm identifier registry.

---

## 7. Context Injection Format

When injecting context from past conversations into a new session:

```
[UACP Context v0.4.0]
Relevant conversations from your history:

1. [chatgpt, 2026-04-10] "Build a sync daemon"
   Key points: decided on chokidar for file watching, Fastify for API

2. [claude-code, 2026-04-12] "PostgreSQL schema design"
   Key points: UUID primary keys, TIMESTAMPTZ for dates

---
```

### Machine-Readable Injection

For tools that support structured context (MCP, system prompts):

```json
{
  "uacp_context": "0.6.0",
  "injected_at": "2026-04-16T10:00:00Z",
  "conversations": [
    {
      "id": "conv_abc",
      "tool": "chatgpt",
      "title": "Build a sync daemon",
      "summary": "Decided on chokidar for file watching, Fastify for API",
      "updated_at": "2026-04-10T15:00:00Z"
    }
  ]
}
```

---

## 8. Import/Export

### Export Format

A UACP export is a `.uacp.json` file containing an array of conversations:

```json
{
  "uacp_export": "0.6.0",
  "exported_at": "2026-04-16T12:00:00Z",
  "source": "my-tool-name",
  "conversations": [
    { "uacp": "0.4.0", "id": "...", ... },
    { "uacp": "0.4.0", "id": "...", ... }
  ]
}
```

### Import

Any tool can import `.uacp.json` files and gain access to the full conversation history.

---

## 9. Sync Protocol (Optional)

For implementations that sync conversations between devices/servers:

### Delta Sync

```
GET /sync/delta?since=<cursor>
Authorization: Bearer <token>

Response:
{
  "conversations": [
    { "id": "...", "tool": "...", "updated_at": "...", "action": "upsert" | "delete" }
  ],
  "cursor": "2026-04-16T12:00:00Z",
  "has_more": false
}
```

### Upload

```
POST /sync/upload
Content-Type: application/json

{
  "conversationId": "conv_abc",
  "tool": "chatgpt",
  "privacyLevel": "personal",
  "storageMode": "e2e",
  "blob": "<encrypted UACP conversation JSON>"
}
```

---

## 10. Extensibility

Tool-specific data goes in `metadata` fields. The top-level `metadata` object and per-message `metadata` objects are both free-form.

Reserved metadata namespaces:
- `uacp.*` — protocol-level metadata (spec-controlled)

**Extension namespace rule:** Custom values in any field (role, content_block.type, tool names, metadata keys) MUST use reverse-domain format: `com.example.my-type`. Bare-word types are reserved for future spec additions forever.

**Schema extension policy:** Conversation, message, content_block, artifact, tool_call, attachment, citation, and redactions objects are closed (`unevaluatedProperties: false`) under the schemas shipped with this spec. Vendors MUST place additional structured data inside the per-object `metadata` object, never as sibling top-level keys. This is the contract that lets writers round-trip unknown data (see §12): a strict validator will accept `metadata.x-vendor-foo` on any object, but reject `x-vendor-foo` as a sibling of `role` on a message. Profiles that need stricter validation MAY tighten schemas further; they MUST NOT relax them.

Example:
```json
{
  "metadata": {
    "cursor.workspace": "/home/user/myproject",
    "cursor.language": "typescript",
    "com.acme.priority": "high"
  }
}
```

### Privacy metadata convention

The metadata key `uacp_privacy.level` is reserved for an optional, vendor-neutral
privacy classification label. Reference values: `private`, `personal`, `team`,
`public`. Default when absent: `personal`.

This is a convention, not an extension — implementations do not declare it in
`extensions[]`. Implementations with product-specific privacy semantics SHOULD
use a vendor namespace (e.g. `com.fusionlayer.privacy_mode`) instead.

Scope: classification only. Encryption is covered by the `uacp-encryption`
extension. Access control and enforcement are implementation-specific.

---

## 11. Extensions

Implementations declare which optional extensions they use via the top-level `extensions` array.

| Extension | Schema | Spec | Description |
|-----------|--------|------|-------------|
| `uacp-encryption` | `schema/extensions/uacp-encryption.schema.json` | [`spec/extensions/uacp-encryption.md`](spec/extensions/uacp-encryption.md) | AES-256-GCM envelope for encrypting conversation objects |
| `uacp-vault-envelope` | `schema/extensions/uacp-vault-envelope.schema.json` | [`spec/extensions/uacp-vault-envelope.md`](spec/extensions/uacp-vault-envelope.md) | Multi-recipient encrypted container for one or more UACP bundles; crypto-agnostic algorithm identifiers |

```json
{
  "uacp": "0.6.0",
  "id": "conv_abc",
  "tool": "my-tool",
  "extensions": ["uacp-encryption"],
  "messages": [...]
}
```

Validators MUST load extension schemas only for documents that declare those extensions in `extensions[]`. Core documents (no `extensions` field) are validated against core schemas only.

---

## 13. MIME Type

`application/uacp+json`

File extension: `.uacp.json`

---

## 14. Versioning and Version Negotiation

UACP uses semantic versioning. The `uacp` field in every object indicates the version.

- Breaking changes increment major version
- New optional fields increment minor version
- Bug fixes increment patch version

**Version negotiation rules:**
- Implementations MUST accept conversations with a compatible major version, even if they don't understand all fields.
- Unknown keys inside any `metadata` object MUST be preserved on round-trip — never silently dropped.
- Unknown keys that are siblings of defined fields (i.e. outside `metadata`) MUST be rejected by strict validators per §10 (Extensibility). Non-strict validators MAY ignore them.
- Writers SHOULD NOT mix major versions within one export bundle.

**What counts as breaking (normative).** A change is breaking, and MUST increment the major version, if it does any of:
1. Removes a required field or makes a previously optional field required.
2. Tightens an enum, regex, or numeric range such that a previously valid document becomes invalid.
3. Changes the semantic meaning of an existing field (including its units, encoding, or canonicalization).
4. Changes any encryption parameter locked in the `uacp-encryption` extension spec (`info`, KDF params, algorithm, IV/tag lengths).
5. Reassigns or removes a reserved namespace (`uacp.*`).

Purely additive changes (new optional fields inside an existing object's schema; new enum values declared as "readers MUST accept unknown values" at the field's definition site; new conformance profiles) are **minor** bumps. Editorial, prose-only, and test-vector-only changes are **patch** bumps.

---

## 15. Conformance Levels

Implementations declare conformance in `metadata.uacp_conformance`:

| Level | Label | Requirements |
|-------|-------|--------------|
| **L1** | Minimal | Required fields only; text-only content; no tool_calls |
| **L2** | Standard | Full message types; tool_calls; attachments |
| **L3** | Full | All of L2 + branches; artifacts; thinking blocks; citations; multimodal; streaming status |

```json
{ "metadata": { "uacp.conformance": "L2" } }
```

Implementations that do not declare a level are assumed to be L1. Third-party implementations verified by the conformance test harness are listed in `CONFORMANCE.md`.

---

## 16. Deprecation Policy

- Deprecated fields remain valid within the entire major version.
- Implementations MUST emit deprecation warnings, not errors, on encountering deprecated fields.
- Fields are only removed at a major-version boundary (0.x → 1.0, 1.x → 2.0).
- All deprecations are listed in `CHANGELOG.md` with the target removal version and timeline.

---

---

## 17. v0.2.0 Fields Reference

These sections define additive fields introduced in v0.2.0. All are optional; v0.1.0 implementations MUST ignore unknown fields per §14.

### §2.1 Conversation Branching

Conversations are tree-structured when the user regenerates or edits messages. The flat `messages` array represents the canonical (current) linear path. The full tree is preserved via `parent_id` on messages and `branches` on the conversation.

**Conversation-level `branches`:** array of leaf message IDs (string[]) that are not on the canonical path. Implementations MAY omit branches if they only store the canonical path (degraded form).

**Message-level `parent_id`:** ID of the parent message in the tree. Root messages have no `parent_id`. On the canonical path, `parent_id` matches the preceding message in order. Off-path messages use `parent_id` to record their tree position.

```json
{
  "uacp": "0.2.0",
  "id": "conv_branch_example",
  "tool": "chatgpt",
  "messages": [
    { "id": "msg_1", "role": "user", "content": "Explain recursion" },
    { "id": "msg_2", "role": "assistant", "content": "Recursion is...", "parent_id": "msg_1" },
    { "id": "msg_3", "role": "user", "content": "Give a code example", "parent_id": "msg_2" },
    { "id": "msg_4", "role": "assistant", "content": "def factorial(n): ...", "parent_id": "msg_3" }
  ],
  "branches": ["msg_4_alt"],
  "metadata": {
    "uacp.branch_nodes": [
      { "id": "msg_4_alt", "parent_id": "msg_3", "role": "assistant", "content": "function fib(n) { ... }" }
    ]
  }
}
```

Branch nodes are stored in `metadata["uacp.branch_nodes"]` to keep the canonical `messages` array clean.

---

### §2.2 Reasoning / Extended-Thinking Content Block

`{ "type": "thinking", "text": "...", "signature"?: "..." }`

Used for: Claude extended thinking, OpenAI o1/o3 reasoning traces, DeepSeek R1 `<think>` blocks.

- `text` (string, required): the raw reasoning text
- `signature` (string, optional): vendor-provided verification token (e.g. Claude's `thinking_signature`)

Thinking blocks are separate from final text blocks in `content`. They appear BEFORE the text blocks they informed.

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "text": "The user is asking about time complexity. Let me consider both average and worst case...",
      "signature": "EqoBCkgIARAAGAIiQL8..."
    },
    {
      "type": "text",
      "text": "The time complexity of quicksort is O(n log n) average case, O(n²) worst case."
    }
  ]
}
```

---

### §2.3 Citations

Optional `citations` array on assistant messages. Each citation links a character span in the `text` content to an external source.

```json
"citations": [
  {
    "span": [24, 67],
    "source": {
      "url": "https://en.wikipedia.org/wiki/Quicksort",
      "title": "Quicksort — Wikipedia",
      "snippet": "Quicksort is a divide-and-conquer algorithm..."
    }
  }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `span` | [number, number] | yes | `[start_char, end_char]` in the concatenated text content |
| `source.url` | string | yes | Source URL |
| `source.title` | string | no | Page title |
| `source.snippet` | string | no | Relevant excerpt from source |

---

### §2.4 Artifacts

Optional `artifacts` array on assistant messages. Artifacts are self-contained generated objects (code files, SVGs, HTML pages, etc.) that are displayed separately from the chat prose.

```json
"artifacts": [
  {
    "id": "artifact_sort_js",
    "type": "code",
    "title": "quicksort.js",
    "language": "javascript",
    "content": "function quicksort(arr) { ... }",
    "created_at": "2026-04-21T10:00:00Z",
    "updated_at": "2026-04-21T10:00:00Z"
  }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique ID within the conversation |
| `type` | string | yes | `code`, `html`, `svg`, `markdown`, `react`, `text` |
| `title` | string | yes | Display title / filename |
| `language` | string | no | Language hint (for `code` type) |
| `content` | string | yes | Full artifact text |
| `created_at` | string | no | ISO 8601 |
| `updated_at` | string | no | ISO 8601 |

**Artifact references in content**: use `{ "type": "artifact_ref", "id": "artifact_sort_js" }` as a content block to indicate where in the prose the artifact was surfaced.

---

### §2.5 Message Status

Optional `status` field on messages.

| Value | Meaning |
|-------|---------|
| `complete` | Message fully generated (default if absent) |
| `in_progress` | Streaming — message not yet complete |
| `error` | Generation stopped due to error |

Used by streaming capture to record partial messages that were interrupted.

---

### §2.6 Model Field (Expanded)

The `model` field (on conversation or message) accepts two forms:

**String form (canonical):** `"provider:model-id"` or `"provider:model-id@snapshot"`.
Examples: `"anthropic:claude-sonnet-4-6"`, `"openai:gpt-4o@2025-08-06"`.

**Object form:** `{ "id": "gpt-4o", "provider": "openai", "snapshot_date": "2025-08-06" }`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Model identifier |
| `provider` | string | no | Provider name (e.g. `openai`, `anthropic`) |
| `snapshot_date` | string | no | ISO 8601 date of model snapshot |

Implementations SHOULD normalize to the canonical string form when storing. The object form is accepted for source-data preservation.

---

### §2.7 Multimodal Content Types

Additional content block types for non-text modalities:

**Audio:** `{ "type": "audio", "url": "...", "mime_type": "audio/mpeg", "duration_s"?: 12.4 }`

**Video:** `{ "type": "video", "url": "...", "mime_type": "video/mp4", "duration_s"?: 30.0 }`

**PDF:** `{ "type": "pdf", "url": "...", "title"?: "Report Q1 2026.pdf" }`

**LaTeX:** `{ "type": "latex", "text": "E = mc^2", "display"?: true }` — `display: true` for block equations, false (default) for inline.

`url` may be an HTTPS URL or a `data:` URI (base64-encoded). Implementations that cannot process a modality MUST silently skip the block rather than error.

---

### §2.8 Code Block Schema

Explicit schema for `code` content blocks:

```json
{ "type": "code", "language": "python", "code": "print('hello')", "filename"?: "hello.py" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | yes | Language identifier (IANA language tag or common shortname) |
| `code` | string | yes | Source code text |
| `filename` | string | no | Optional filename hint |

---

### Appendix B: MCP Interop Mapping

UACP tool calls and MCP (Model Context Protocol) tool invocations represent the same underlying concept. Mapping:

| UACP field | MCP equivalent |
|---|---|
| `tool_calls[].name` | `tool.name` |
| `tool_calls[].arguments` | `tool.input` (object) |
| `tool_calls[].call_id` | Correlation ID (MCP `toolUseId`) |
| `role: "tool"` message + `call_id` | MCP `tool_result` block + `toolUseId` |

UACP conversations captured from MCP-enabled tools (Claude Code, Continue.dev) SHOULD map MCP tool_result blocks to the `role: "tool"` message form.

---

## Appendix C: UACP vs MCP

| | **UACP** | **MCP (Model Context Protocol)** |
|---|---|---|
| **Purpose** | Represent and interchange conversation data | Connect external tools and resources to AI models |
| **Scope** | How to store, transport, and replay a chat | How to register tools and execute them in a sandboxed context |
| **Relationship** | Complementary — implement both | Complementary |
| **Used for** | Conversation portability, export/import, context injection | Tool registration, function calling, file access |
| **Format** | JSON objects at rest and in transit | JSON-RPC 2.0 over stdio or SSE |
| **State** | Immutable conversation records | Stateful session between model and tool server |
| **Memory** | First-class (conversation history IS the data) | Via tool calls (read_resource, etc.) |
| **Streaming** | Optional `status: "in_progress"` on messages | Native streaming via SSE |
| **Spec owner** | Community | Anthropic |

**How they work together:** A UACP conversation can include `tool_calls` that were executed via MCP (see Appendix B for field mapping). Implementations can use UACP as the canonical storage format for conversations captured from MCP-enabled tools (Claude Code, Continue.dev, etc.).

---

## Appendix A: Full Example (v0.6.0)

This example uses branching (§2.1), extended thinking (§2.2), citations (§2.3), an artifact (§2.4), and the expanded model field (§2.6).

```json
{
  "uacp": "0.6.0",
  "id": "conv_2026042101",
  "tool": "claude-code",
  "model": { "id": "claude-sonnet-4-6", "provider": "anthropic", "snapshot_date": "2026-04-21" },
  "title": "Implement quicksort with complexity analysis",
  "created_at": "2026-04-21T10:00:00Z",
  "updated_at": "2026-04-21T10:15:00Z",
  "tags": ["algorithms", "javascript"],
  "project": "my-project",
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Implement quicksort in JS and explain the time complexity.",
      "timestamp": "2026-04-21T10:00:01Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "parent_id": "msg_1",
      "timestamp": "2026-04-21T10:00:08Z",
      "model": "anthropic:claude-sonnet-4-6",
      "tokens": { "input": 28, "output": 312 },
      "status": "complete",
      "content": [
        {
          "type": "thinking",
          "text": "The user wants quicksort. I should cover both average O(n log n) and worst case O(n²). I'll write clean JS and produce an artifact."
        },
        {
          "type": "text",
          "text": "Here's a quicksort implementation. Time complexity is O(n log n) average case[1], O(n²) worst case with a bad pivot choice."
        },
        {
          "type": "artifact_ref",
          "id": "artifact_qs_js"
        }
      ],
      "citations": [
        {
          "span": [52, 70],
          "source": {
            "url": "https://en.wikipedia.org/wiki/Quicksort",
            "title": "Quicksort — Wikipedia",
            "snippet": "Quicksort has an average complexity of O(n log n) comparisons."
          }
        }
      ],
      "artifacts": [
        {
          "id": "artifact_qs_js",
          "type": "code",
          "title": "quicksort.js",
          "language": "javascript",
          "content": "function quicksort(arr) {\n  if (arr.length <= 1) return arr\n  const pivot = arr[arr.length - 1]\n  const left = arr.slice(0, -1).filter(x => x <= pivot)\n  const right = arr.slice(0, -1).filter(x => x > pivot)\n  return [...quicksort(left), pivot, ...quicksort(right)]\n}",
          "created_at": "2026-04-21T10:00:08Z",
          "updated_at": "2026-04-21T10:00:08Z"
        }
      ]
    }
  ],
  "metadata": {
    "claude-code.session_id": "sess_abc123",
    "claude-code.working_directory": "/home/user/my-project"
  }
}
```

---

*UACP Spec v0.6.0 - Draft*
*Community specification — see GOVERNANCE.md*
*Created: 2026-04-17 | Updated: 2026-06-23 (v0.6.0)*

## Context-sharing primitives

Context-sharing envelopes carry signed, scoped events between devices and vendors. Each event is wrapped in a `signed-event-envelope` — an ed25519-signed container that includes a vector clock for ordering, a scope identifier for access control, and a canonical-JSON signature for integrity. The schemas under `schema/v1/context-sharing/` define the structural contract; `signing.js` provides the crypto primitives.

```javascript
const { verifySignedEvent, canonicalJSON } = require('./signing')

// Verify a signed event received from another device or vendor
const result = verifySignedEvent(envelope, { publicKey: senderPublicKeyBase64 })
if (!result.valid) throw new Error(result.error)
```

Run `node validate.js` to validate context-sharing conformance vectors (structural + ed25519 signature verification). Pass `--skip-crypto` to run structural-only checks in environments without native bindings.

## 18. Validation And Boundary

- Run `node validate.js` for a fast conformance pre-check over `test-vectors/`.
- Run `node conformance/harness/run.js` for the full conformance suite (core + extensions).
- See [docs/UACP-BOUNDARY.md](docs/UACP-BOUNDARY.md) for the canonical boundary between UACP core, extensions, and implementation-specific concerns.

### Validating UACP documents

When an artifact envelope includes a `kind` and `body`, `validate.js` automatically validates the `body` against the matching kind schema from `schema/v1/kinds/` (e.g. `memory`, `persona`, `playbook`) and surfaces any errors with the path prefix `body/`.



