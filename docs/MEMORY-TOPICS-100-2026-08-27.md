# UACP #100 — Memory topics and metadata work record

## Initial state

Memory v1 has broad `category` and free-form envelope `tags`, but no portable
topic vocabulary or safe representation for bounded typed metadata. Consumers
therefore cannot distinguish a vendor's narrow topic label from a category or
round-trip metadata with a declared primitive type.

## Intended change

Add optional Memory v1 `topics` and `metadata` fields while preserving existing
category/tag behavior. The change will define a small core topic registry,
collision-safe namespaced topics/metadata keys, primitive-only metadata values,
resource limits, and pass-through requirements for unknown namespaced values.

This will not define query syntax, indexes, ranking, a managed topic catalog, or
FusionLayer-specific retrieval behavior.

## Acceptance tests

- focused topic/metadata schema and semantic tests;
- `npm test`;
- `npm run validate`;
- `git diff --check`.

## Completion record

Implemented optional `topics` and `metadata` in the Memory v1 schema. Topics
use a small core registry or collision-safe `<vendor>/<name>` names; metadata
uses bounded primitive typed entries with three core keys and namespaced custom
keys. Unknown namespaced values remain inert pass-through data, while unknown
unnamespaced topics/keys produce deterministic errors.

Added four topic/metadata conformance vectors and focused semantic tests. The
first validation run exposed a mismatch between the documented `effective_from`
core key and the schema pattern; it was corrected before completion.

Verification: `npm test` passed (175 validator vectors, 166 core conformance
cases, 4 lifecycle sequence vectors); `npm run validate` passed 175/175; and
`git diff --check` passed. No credentials, proprietary data, query syntax, or
ranking behavior was introduced.
