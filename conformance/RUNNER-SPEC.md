# UACP Conformance Runner — Normative Specification

**Issue:** hn2/uacp#45  
**Status:** Draft

---

## 1. Purpose

This document specifies the algorithm any conformance runner MUST implement to test a UACP implementation. It is implementation-language-agnostic.

The reference runner ships at `conformance/harness/run.js`. It is authoritative. If this document contradicts the reference runner, the runner wins — file an issue.

---

## 2. Test Vector Format

Test vectors are JSON files. Each file is one of:

### 2.1 Core conversation vector

A valid or explicitly-invalid UACP conversation document.

**Valid:** must pass the relevant JSON Schema.  
**Invalid:** carries `metadata["uacp.test.expect"] = "invalid"` — must fail schema validation with at least one error.

### 2.2 Extension fixture wrapper

A JSON object with a top-level `fixture_id` string. The wrapper carries metadata and embeds the extension object under a well-known key. Invalid fixtures carry `expected: "schema_error"`.

| Wrapper key | Target schema |
|---|---|
| `event` | `uacp-sync-event` |
| `registrations[0]` | `uacp-device-registration` |
| `payload` (with `payload.algorithm`) | `uacp-event-payload` |
| `member_set` | `uacp-member-set` |
| `promotion` | `uacp-promotion-event` |
| `withdraw` | `uacp-withdraw-event` |
| `audit_event` | `uacp-audit-event` |

The runner routes each fixture to its schema by inspecting these keys in the listed order.

---

## 3. Runner Algorithm

```
function run(vectorsDir, schemasDir, impl?):
  ajv = loadAllSchemas(schemasDir)

  for each file in collect(vectorsDir):
    doc = JSON.parse(readFile(file))
    expectInvalid = (doc.metadata?["uacp.test.expect"] == "invalid")
                 || (doc.fixture_id && doc.expected == "schema_error")

    (schemaId, target) = resolveTarget(doc)
    valid = ajv.validate(schemaId, target)

    if expectInvalid:
      PASS if !valid, FAIL if valid
    else:
      if !valid: FAIL with errors
      if impl provided:
        internal = impl.parse(doc)
        exported = impl.serialize(internal)
        FAIL if exported.id != doc.id
        FAIL if exported.messages?.length != doc.messages?.length
      else: PASS

  return { passed, failed, level: computeLevel(results) }
```

### 3.1 `collect(vectorsDir)`

Returns all `.json` files from:
1. `vectorsDir/` (flat, core vectors)
2. `vectorsDir/extensions/*/` (one directory per extension, all `.json` files)
3. `vectorsDir/invalid/` (negative test vectors)

Sort each group lexicographically before concatenating.

### 3.2 `resolveTarget(doc)`

```
if doc.fixture_id is string:
  if doc.event is object       → (uacp-sync-event, doc.event)
  if doc.registrations[0]      → (uacp-device-registration, doc.registrations[0])
  if doc.payload.algorithm     → (uacp-event-payload, doc.payload)
  if doc.member_set is object  → (uacp-member-set, doc.member_set)
  if doc.promotion is object   → (uacp-promotion-event, doc.promotion)
  if doc.withdraw is object    → (uacp-withdraw-event, doc.withdraw)
  if doc.audit_event is object → (uacp-audit-event, doc.audit_event)

if doc.uacp_encrypted is string → (uacp-encryption@0.5.0, doc)
if doc.uacp_export is string    → (uacp-export@0.6.0, doc)
default                         → (uacp-conversation@0.6.0, doc)
```

### 3.3 `computeLevel(results)`

```
if all results pass:
  return "L3"

l1_pass = L1_VECTORS.every(f => result(f).pass)
l2_pass = (L1_VECTORS + L2_VECTORS).every(f => result(f).pass)

if l1_pass && l2_pass: return "L2"
if l1_pass:            return "L1"
return "none"
```

Where `L1_VECTORS`, `L2_VECTORS`, `L3_VECTORS` are defined in `CONFORMANCE.md §2`.

---

## 4. Extension Fixture Categories

The table below lists the test vector subdirectories, the extension they cover, and the minimum number of valid + invalid fixtures required for a complete conformance suite.

| Directory | Extension | Min valid | Min invalid |
|---|---|---|---|
| `extensions/sync-event/` | `uacp-sync-event` (#36) | 4 | 3 |
| `extensions/identity-chain/` | `uacp-device-registration` / `uacp-identity-key` (#42) | 3 | 3 |
| `extensions/event-payload/` | `uacp-event-payload` (#43) | 3 | 2 |
| `extensions/vector-clock/` | (no fixture wrapper; tested via unit suite) | — | — |
| `extensions/scope-identifier/` | `uacp-scope-identifier` (#38) | 6 | 3 |
| `extensions/member-set/` | `uacp-member-set` (#39) | 3 | 2 |
| `extensions/promotion-event/` | `uacp-promotion-event` (#40) | 3 | 2 |
| `extensions/withdraw-event/` | `uacp-withdraw-event` (#41) | 2 | 2 |
| `extensions/audit-event/` | `uacp-audit-event` (#44) | 4 | 2 |

---

## 5. Implementation Module Interface

When `--impl ./path/to/impl.js` is passed to the reference runner, the module MUST export:

```typescript
interface UACPImpl {
  /** Parse a UACP document into an internal representation. */
  parse(doc: object): unknown

  /** Serialize the internal representation back to a UACP document. */
  serialize(internal: unknown): object
}
```

Only `parse` + `serialize` are required. Round-trip fidelity is tested: `id`, `tool`, and `messages.length` MUST be preserved. Extension-specific round-trip checks are out of scope for the core harness.

---

## 6. Exit Codes

| Code | Meaning |
|---|---|
| `0` | All vectors passed |
| `1` | One or more vectors failed |

---

## 7. Schema Loading

The runner MUST load all `*.schema.json` files from:
- `schema/` (core schemas)
- `schema/extensions/` (extension schemas)

Schemas are identified by their `$id` field and registered with the JSON Schema validator. The runner MUST support JSON Schema 2020-12 (`$schema: https://json-schema.org/draft/2020-12/schema`).
