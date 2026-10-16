#!/usr/bin/env node
// UACP Conformance Test Harness
// Run against any UACP implementation to verify L1/L2/L3 compliance.
//
// Usage: node conformance/harness/run.js [--level L1|L2|L3] [--impl ./path/to/my-impl.js]
//
// impl module must export:
//   parse(doc: object): object   — optional; UACP object → internal representation
//   serialize(internal: object): object — optional; internal → UACP object
//
// Without --impl: harness runs validation-only self-test against all test vectors.

const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const VECTORS_DIR = path.join(REPO_ROOT, 'test-vectors')
const SCHEMA_DIR = path.join(REPO_ROOT, 'schema')

// --- Schema loading ---
function loadAjv() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)

  for (const name of fs.readdirSync(SCHEMA_DIR)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))
    if (schema['$id']) ajv.addSchema(schema, schema['$id'])
  }

  const extSchemaDir = path.join(SCHEMA_DIR, 'extensions')
  if (fs.existsSync(extSchemaDir)) {
    for (const name of fs.readdirSync(extSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = JSON.parse(fs.readFileSync(path.join(extSchemaDir, name), 'utf8'))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  const kindSchemaDir = path.join(SCHEMA_DIR, 'v1', 'kinds')
  if (fs.existsSync(kindSchemaDir)) {
    for (const name of fs.readdirSync(kindSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = JSON.parse(fs.readFileSync(path.join(kindSchemaDir, name), 'utf8'))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  const contextSchemaDir = path.join(SCHEMA_DIR, 'v1', 'context-sharing')
  if (fs.existsSync(contextSchemaDir)) {
    for (const name of fs.readdirSync(contextSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = JSON.parse(fs.readFileSync(path.join(contextSchemaDir, name), 'utf8'))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  return ajv
}

function detectSchemaId(doc) {
  if (doc && typeof doc.uacp_encrypted === 'string') return 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-encryption'
  if (doc && typeof doc.uacp_export === 'string') return 'https://hn2.github.io/uacp/schema/0.6.0/export'
  if (doc && typeof doc.uacp_vault_envelope === 'string') return 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vault-envelope'
  return 'https://hn2.github.io/uacp/schema/0.6.0/conversation'
}

function resolveValidationTarget(doc, ajv) {
  if (doc && typeof doc.fixture_id === 'string') {
    if (doc.event && typeof doc.event === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-sync-event', target: doc.event }
    }
    if (Array.isArray(doc.registrations) && doc.registrations.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-device-registration', target: doc.registrations[0] }
    }
    if (Array.isArray(doc.identity_keys) && doc.identity_keys.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-identity-key', target: doc.identity_keys[0] }
    }
    if (doc.payload && typeof doc.payload === 'object' && doc.payload.algorithm) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-event-payload', target: doc.payload }
    }
    if (doc.clocks && Array.isArray(doc.clocks) && doc.clocks.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vector-clock', target: doc.clocks[0] }
    }
    if (Array.isArray(doc.scopes) && doc.scopes.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-scope-identifier', target: doc.scopes[0] }
    }
    if (doc.member_set && typeof doc.member_set === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_set }
    }
    if (Array.isArray(doc.member_sets) && doc.member_sets.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_sets[0] }
    }
    if (doc.promotion && typeof doc.promotion === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-promotion-event', target: doc.promotion }
    }
    if (doc.withdraw && typeof doc.withdraw === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-withdraw-event', target: doc.withdraw }
    }
    if (doc.audit_event && typeof doc.audit_event === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-audit-event', target: doc.audit_event }
    }
  }
  // A generic kind+body artifact envelope (memory, persona, pack, etc.) is not
  // a chat conversation and must be validated against its own kind schema,
  // not the conversation schema — see fusionlayerapp/uacp#102.
  if (doc && typeof doc.kind === 'string' && doc.body !== undefined) {
    const kindSchemaId = `https://hn2.github.io/uacp/schema/v1/kinds/${doc.kind}`
    if (ajv.getSchema(kindSchemaId)) {
      return { schemaId: kindSchemaId, target: doc.body }
    }
  }
  return { schemaId: detectSchemaId(doc), target: doc }
}

function validateDoc(ajv, doc) {
  const { schemaId, target } = resolveValidationTarget(doc, ajv)
  const valid = ajv.validate(schemaId, target)
  const errors = (ajv.errors || []).map(e => `${e.instancePath || '(root)'} ${e.message}`)
  return { valid, errors }
}

// L1–L3 vector sets per CONFORMANCE.md (core-only vectors; extension vectors run separately)
const LEVEL_VECTORS = {
  L1: ['01-minimal-chat.uacp.json', '02-multi-message.uacp.json', '03-tool-use.uacp.json'],
  L2: ['04-multimodal-image.uacp.json', '05-branched-conversation.uacp.json', '06-with-artifacts.uacp.json'],
  L3: ['07-extended-thinking.uacp.json', '08-with-citations.uacp.json', '09-encrypted-envelope.uacp.json',
       '13-deep-branches.uacp.json', '14-tool-call-correlation.uacp.json', '15-redactions-and-metadata.uacp.json'],
}

// Semantic error codes that pass schema validation (not schema failures)
const SCHEMA_FAIL_CODES = new Set(['invalid', 'schema_error', 'UNKNOWN_ROLE', 'UNKNOWN_AXIS_VALUE', 'MISSING_AXIS', 'INVALID_SCOPE_ID'])

async function runConformance({ level = 'L3', impl } = {}) {
  const ajv = loadAjv()
  const levelOrder = ['L1', 'L2', 'L3']
  const minIdx = levelOrder.indexOf(level)
  const levelsToTest = levelOrder.slice(0, minIdx + 1)

  const results = []
  let passed = 0
  let failed = 0

  // Collect core vectors + extension vectors + explicit invalid vectors
  const coreVectors = fs.readdirSync(VECTORS_DIR).filter(n => n.endsWith('.json')).sort()
  const extVectors = []
  const extVectorsBase = path.join(VECTORS_DIR, 'extensions')
  if (fs.existsSync(extVectorsBase)) {
    for (const extName of fs.readdirSync(extVectorsBase)) {
      const extDir = path.join(extVectorsBase, extName)
      if (!fs.statSync(extDir).isDirectory()) continue
      for (const n of fs.readdirSync(extDir)) {
        if (n.endsWith('.json')) extVectors.push(path.join(extDir, n))
      }
    }
  }
  const invalidVectors = []
  const invalidVectorsBase = path.join(VECTORS_DIR, 'invalid')
  if (fs.existsSync(invalidVectorsBase)) {
    for (const n of fs.readdirSync(invalidVectorsBase)) {
      if (n.endsWith('.json')) invalidVectors.push(path.join(invalidVectorsBase, n))
    }
  }
  const allVectors = [
    ...coreVectors.map(n => path.join(VECTORS_DIR, n)),
    ...extVectors.sort(),
    ...invalidVectors.sort(),
  ]

  for (const filePath of allVectors) {
    const filename = path.relative(VECTORS_DIR, filePath)
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      results.push({ filename, pass: false, error: `parse error: ${e.message}` })
      failed++
      continue
    }

    const expectInvalid = (doc?.metadata?.['uacp.test.expect'] === 'invalid') ||
      (doc?.fixture_id && SCHEMA_FAIL_CODES.has(doc?.expected))
    const { valid, errors } = validateDoc(ajv, doc)

    if (expectInvalid) {
      if (!valid) {
        results.push({ filename, pass: true, note: `expected invalid — ${errors[0] ?? ''}` })
        passed++
      } else {
        results.push({ filename, pass: false, error: 'expected validation failure but passed' })
        failed++
      }
      continue
    }

    if (!valid) {
      results.push({ filename, pass: false, error: errors.join('; ') })
      failed++
      continue
    }

    // Optional round-trip test if impl provided
    if (impl?.parse && impl?.serialize) {
      try {
        const internal = impl.parse(doc)
        const exported = impl.serialize(internal)
        if (exported.id !== doc.id || exported.tool !== doc.tool) {
          results.push({ filename, pass: false, error: 'round-trip: id or tool changed' })
          failed++
          continue
        }
        if (exported.messages?.length !== doc.messages?.length) {
          results.push({ filename, pass: false, error: 'round-trip: message count changed' })
          failed++
          continue
        }
      } catch (err) {
        results.push({ filename, pass: false, error: `round-trip threw: ${err.message}` })
        failed++
        continue
      }
    }

    results.push({ filename, pass: true })
    passed++
  }

  return { level: computeAchievedLevel(results), passed, failed, results }
}

function computeAchievedLevel(results) {
  if (results.every(r => r.pass)) return 'L3'
  const l1Files = LEVEL_VECTORS.L1
  if (l1Files.every(f => results.find(r => r.filename === f)?.pass)) {
    const l2Files = [...LEVEL_VECTORS.L1, ...LEVEL_VECTORS.L2]
    if (l2Files.every(f => results.find(r => r.filename === f)?.pass)) return 'L2'
    return 'L1'
  }
  return 'none'
}

// --- Context-sharing event-chain harness ---

function classifySignature(sig) {
  if (sig === undefined || sig === null) return 'missing'
  if (typeof sig === 'string' && /^[0-9a-f]{64,}$/i.test(sig)) return 'valid'
  return 'invalid'
}

async function runContextSharingVectors(vectorsDir, options = {}) {
  const results = []
  let files

  try {
    files = fs.readdirSync(vectorsDir).filter(n => n.endsWith('.json')).sort()
  } catch (e) {
    return [{ vector_id: vectorsDir, passed: false, failures: [`VECTOR_FILE_INVALID: Cannot read vectors directory: ${e.message}`], duration_ms: 0 }]
  }

  for (const file of files) {
    const filePath = path.join(vectorsDir, file)
    const startMs = Date.now()
    let vector

    try {
      vector = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      results.push({ vector_id: file, passed: false, failures: [`VECTOR_FILE_INVALID: Vector file is not valid JSON`], duration_ms: Date.now() - startMs })
      continue
    }

    if (!Array.isArray(vector.events)) continue

    const failures = []
    const events = vector.events
    const eventById = new Map(events.map(e => [e.event_id, e]))
    const causality = vector.expected_causality ?? {}
    const expectedSigs = vector.expected_signatures ?? {}

    // Verify expected_signatures match the actual signature fields in the vector events
    for (const [eventId, expectedState] of Object.entries(expectedSigs)) {
      const event = eventById.get(eventId)
      if (!event) {
        failures.push(`Vector definition error: expected_signatures references ${eventId} which is not in events array`)
        continue
      }
      const actualState = classifySignature(event.signature)
      if (actualState !== expectedState) {
        failures.push(`Vector definition error: expected_signatures[${eventId}]=${expectedState} but actual signature classifies as ${actualState}`)
      }
    }

    // Detect causal issues that would cause a UACP implementation to reject the chain
    const detectedCausalIssues = []
    for (const [eventId, causedBy] of Object.entries(causality)) {
      if (!eventById.has(eventId)) {
        detectedCausalIssues.push(`CAUSAL_ORDER_VIOLATION: ${eventId} not in events array`)
        continue
      }
      const event = eventById.get(eventId)
      const predecessor = eventById.get(causedBy)

      if (!predecessor) {
        detectedCausalIssues.push(`ORPHANED_EVENT: Event has no valid predecessor in chain — ${eventId} caused_by ${causedBy} which is missing`)
        continue
      }

      const eventIdx = events.findIndex(e => e.event_id === eventId)
      const predIdx = events.findIndex(e => e.event_id === causedBy)
      if (eventIdx < predIdx) {
        detectedCausalIssues.push(`CAUSAL_ORDER_VIOLATION: Event received out of causal order — ${eventId} at index ${eventIdx} precedes its cause ${causedBy} at index ${predIdx}`)
      }

      const ec = event.vector_clock ?? {}
      const pc = predecessor.vector_clock ?? {}
      for (const [device, count] of Object.entries(pc)) {
        const eventCount = ec[device] ?? 0
        if (eventCount < count) {
          detectedCausalIssues.push(`CAUSAL_ORDER_VIOLATION: Event received out of causal order — ${eventId} vector_clock[${device}]=${eventCount} regresses predecessor ${causedBy} clock[${device}]=${count}`)
        }
      }
    }

    // Derive the outcome a UACP implementation would compute
    const hasSignatureIssues = Object.values(expectedSigs).some(s => s !== 'valid')
    const computedOutcome = (hasSignatureIssues || detectedCausalIssues.length > 0) ? 'rejected' : 'accepted'

    if (vector.expected_outcome && vector.expected_outcome !== computedOutcome) {
      failures.push(`Outcome mismatch: vector expects ${vector.expected_outcome} but harness computed ${computedOutcome} (causal issues: [${detectedCausalIssues.join('; ')}])`)
    }

    results.push({ vector_id: vector.id ?? file, passed: failures.length === 0, failures, duration_ms: Date.now() - startMs })
  }

  return results
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const mode = args[0]

  if (mode === 'context-sharing') {
    let vectorsDir = path.join(REPO_ROOT, 'conformance', 'vectors', 'context-sharing', 'event-chains')
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--vectors' && args[i + 1]) vectorsDir = path.resolve(process.cwd(), args[++i])
    }

    const results = await runContextSharingVectors(vectorsDir)
    console.log(`\nUACP Context-Sharing Conformance Harness`)
    console.log(`=========================================`)
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    console.log(`Passed: ${passed}  Failed: ${failed}\n`)
    for (const r of results) {
      const icon = r.passed ? '✓' : '✗'
      console.log(`${icon} ${r.vector_id} (${r.duration_ms}ms)`)
      for (const f of r.failures) console.log(`    ${f}`)
    }
    if (failed > 0) { console.log(`\n✗ Context-sharing conformance check failed`); process.exit(1) }
    else { console.log(`\n✓ All context-sharing checks passed`) }
    return
  }

  let level = 'L3'
  let implPath = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--level' && args[i + 1]) level = args[++i]
    if (args[i] === '--impl' && args[i + 1]) implPath = args[++i]
  }

  let impl = null
  if (implPath) {
    impl = require(path.resolve(process.cwd(), implPath))
  }

  const result = await runConformance({ level, impl })

  console.log(`\nUACP Conformance Harness`)
  console.log(`========================`)
  console.log(`Conformance level achieved: ${result.level}`)
  console.log(`Passed: ${result.passed}  Failed: ${result.failed}\n`)

  for (const r of result.results) {
    const icon = r.pass ? '✓' : '✗'
    const extra = r.note ? ` (${r.note})` : r.error ? ` — ${r.error}` : ''
    console.log(`${icon} ${r.filename}${extra}`)
  }

  if (result.failed > 0) {
    console.log(`\n✗ Conformance check failed`)
    process.exit(1)
  } else {
    console.log(`\n✓ All checks passed`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

module.exports = { runConformance, runContextSharingVectors }
