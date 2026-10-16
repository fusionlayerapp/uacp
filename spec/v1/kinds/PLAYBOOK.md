# UACP-Playbook — Kind Specification v1

**Kind:** `playbook`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value      |
|-----------------|------------|
| kind            | `playbook` |
| schema_version  | 1          |
| uacp_version    | 1          |

---

## §2 — Purpose

A `playbook` artifact encodes a sequenced, multi-step workflow of instructions or actions. Playbooks define repeatable processes — research workflows, content pipelines, code review checklists — that an AI system executes in order. Unlike `pack` (which is a static collection), a `playbook` is procedural.

**Scope:** Procedural workflows with ordered steps. For unordered artifact collections, use `pack`. For single behavioral instructions, use `guideline`.

---

## §3 — Body Schema

```jsonc
{
  "title": "string (required)",
  "description": "string (required)",
  "steps": [
    {
      "step": "integer (required) — 1-based step number",
      "title": "string (required)",
      "instruction": "string (required)",
      "on_complete": "string (optional) — instruction for what to do after this step"
    }
  ],
  "tags": ["string"]  // optional
}
```

### Field rules

| Field       | Type     | Required | Constraints                               |
|-------------|----------|----------|-------------------------------------------|
| title       | string   | YES      | ≤128 chars, non-empty                     |
| description | string   | YES      | ≤512 chars                                |
| steps       | object[] | YES      | 1–50 steps; steps MUST be contiguous from 1 |
| tags        | string[] | NO       | ≤10 items, each ≤64 chars                 |

#### steps item

| Field       | Type    | Required | Constraints              |
|-------------|---------|----------|--------------------------|
| step        | integer | YES      | 1-based, no gaps         |
| title       | string  | YES      | ≤128 chars               |
| instruction | string  | YES      | ≤2000 chars              |
| on_complete | string  | NO       | ≤512 chars               |

Steps MUST be sorted by `step` number in the body. `step` values MUST form a contiguous sequence starting at 1 (e.g., 1, 2, 3 — NOT 1, 3, 5).

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: playbook
id: 7a8b9c0d-1ef2-4345-6789-abcdef012345
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: Research to draft workflow
tags:
  - research
  - writing
  - workflow
signature: "sha256:9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e"
body:
  title: "Research → Draft → Fact-check"
  description: "A three-step workflow for producing research-backed written content."
  steps:
    - step: 1
      title: "Research"
      instruction: "Gather information on the topic from at least 3 primary sources. List key facts, statistics, and quotes with their sources. Do not synthesize yet."
      on_complete: "Confirm research is complete before proceeding to draft."
    - step: 2
      title: "Draft"
      instruction: "Write a first draft using the research gathered in step 1. Structure: introduction, 2-4 main points with supporting evidence, conclusion. Cite sources inline."
      on_complete: "Confirm draft is complete. Do not edit yet."
    - step: 3
      title: "Fact-check"
      instruction: "Review every factual claim in the draft. Verify each claim against the source cited. Flag any claim that cannot be verified. Remove or qualify unverifiable claims."
      on_complete: "Present the final fact-checked draft with a summary of any flagged claims."
  tags:
    - research
    - writing
    - journalism
```

---

## §5 — Notes

- Implementations SHOULD execute playbook steps in order (step 1, 2, 3...) and SHOULD NOT skip steps without explicit user instruction.
- `on_complete` is an instruction to the AI system, not a function call. It is advisory — the AI SHOULD follow it but MAY adapt based on user feedback.
- Playbooks are NOT executable code. They are structured prompts. The AI interprets and executes them as natural-language instructions.
- A playbook MAY reference artifacts from a `pack` by including the pack in context before running the playbook. The playbook body does not embed artifact content.
- Playbooks with 0 steps are invalid. Implementations MUST reject empty step arrays.
- If the user interrupts a playbook mid-execution, the AI SHOULD save progress state via a `memory` artifact so the playbook can be resumed in a new session.
