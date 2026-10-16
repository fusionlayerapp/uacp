# UACP #101 — Profile linkage work record

## Initial state

Memory v1 has no portable way to state that a fact supplies a field in a user,
project, or team profile. A separate profile kind would duplicate the memory
truth and force a second lifecycle. Existing memory lifecycle work already
provides the appropriate revision, provenance, expiry, and consent semantics.

## Decision and intended change

Specify linkage-in-memory, not a new profile truth kind. Add an optional bounded
`profile_link` that contains an opaque schema identifier, schema version, and
field identifier. Consumers that do not understand it continue to read the
memory normally. Unknown schemas/fields pass through without default inference.

Add a portable conflict state. A sequence conformance check will reject two
current memories claiming the same subject/scope/schema/field unless each is
explicitly marked `unresolved`.

No profile storage, schema catalog, query API, field value projection, or
FusionLayer retrieval behavior is in scope.

## Acceptance tests

- profile-link schema and semantic tests;
- valid user/project/team examples;
- conflict and unknown-schema fixtures;
- `npm test`, `npm run validate`, and `git diff --check`.

## Completion record

Implemented `profile_link` in Memory v1 with core `user`, `project`, and `team`
schema identifiers plus collision-safe namespaced schemas. Each link records a
schema version, bounded field identifier or JSON Pointer, and optional conflict
state. A separate profile kind was intentionally not introduced: independently
revisioned memories remain the canonical facts.

The lifecycle sequence harness now detects active duplicate field claims for
the same subject/scope/schema-version/field tuple unless every claim is
explicitly `unresolved`. It ignores superseded, tombstoned, and expired claims.
Added user, project, and team body examples plus an unknown-schema fixture,
accepted unresolved-conflict and rejected field-conflict sequence vectors.

Verification: `npm test` passed (179 validator vectors, 166 core conformance
cases, 6 lifecycle/profile sequence vectors), `npm run validate` passed
179/179, and `git diff --check` passed. No schema catalog, projected profile
value, provider integration, or query behavior was added.
