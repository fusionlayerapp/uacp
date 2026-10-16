# UACP-Theme — Kind Specification v1

**Kind:** `theme`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value   |
|-----------------|---------|
| kind            | `theme` |
| schema_version  | 1       |
| uacp_version    | 1       |

---

## §2 — Purpose

A `theme` artifact encodes visual or tonal configuration for an AI tool's interface. Themes allow users to carry their display preferences across AI tools — dark mode, accent colors, typography, and layout density.

**Scope:** Presentation configuration only. `theme` does not affect AI behavior or output content. For content style preferences, use `guideline`.

---

## §3 — Body Schema

```jsonc
{
  "name": "string (required)",
  "mode": "'light' | 'dark' | 'system'  (required)",
  "accent_color": "string (optional) — CSS hex color, e.g. '#6366f1'",
  "font_family": "string (optional) — CSS font-family value",
  "density": "'compact' | 'normal' | 'spacious'  (optional, default 'normal')",
  "custom_css": "string (optional) — raw CSS to inject"
}
```

### Field rules

| Field        | Type   | Required | Constraints                                                         |
|--------------|--------|----------|---------------------------------------------------------------------|
| name         | string | YES      | ≤64 chars, non-empty                                                |
| mode         | enum   | YES      | `light`, `dark`, or `system` (follows OS preference)               |
| accent_color | string | NO       | CSS hex: `#RRGGBB` or `#RGB`. MUST match `/^#[0-9a-fA-F]{3,6}$/`  |
| font_family  | string | NO       | ≤256 chars, valid CSS `font-family` value                           |
| density      | enum   | NO       | `compact`, `normal`, or `spacious`; default `normal`               |
| custom_css   | string | NO       | ≤16 384 chars of raw CSS                                            |

### Density values

| Value      | Meaning                                                   |
|------------|-----------------------------------------------------------|
| `compact`  | Reduced padding, tighter line-height, smaller type sizes  |
| `normal`   | Default spacing (implementation-defined)                  |
| `spacious` | Increased padding, generous whitespace                    |

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: theme
id: 4d5e6f7a-89bc-4def-0123-456789abcdef
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Dark mode with indigo accent
tags:
  - dark
  - developer
signature: "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"
body:
  name: "Dark Indigo"
  mode: dark
  accent_color: "#6366f1"
  font_family: "'JetBrains Mono', 'Fira Code', monospace"
  density: normal
  custom_css: |
    :root { --radius: 4px; }
    .message-bubble { border-radius: var(--radius); }
```

---

## §5 — Notes

- `custom_css` SHOULD be sandboxed. Implementations MUST NOT allow `custom_css` to access parent document context or execute JavaScript via CSS (e.g., `expression()`, `url('javascript:...')`).
- Implementations that do not support themes MUST ignore `theme` artifacts silently and MUST NOT fail.
- `mode: system` means the theme follows the operating system dark/light preference. Implementations SHOULD handle this dynamically.
- `font_family` SHOULD be a font stack (multiple families with fallbacks) rather than a single font. Implementations are not required to load external fonts.
- At most one `theme` artifact SHOULD be active at a time. If multiple are in context, the implementation SHOULD use the one with the latest `created_at`.
