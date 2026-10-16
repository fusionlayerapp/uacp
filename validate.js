#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const SENSITIVE_CATEGORIES = new Set(['health', 'financial'])
const ACTIVE_ACTIONS = new Set(['create', 'confirm', 'update', 'supersede', 'rollback'])
const CORE_TOPICS = new Set([
  'accessibility', 'career', 'education', 'family', 'finance', 'health',
  'identity', 'location', 'preference', 'project', 'relationship',
])
const CORE_PROFILE_SCHEMAS = new Set(['user', 'project', 'team'])

function isNamespaced(value) {
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(value)
}

function validateMemoryLifecycle(body, { memoryId } = {}) {
  const errors = []
  if (SENSITIVE_CATEGORIES.has(body.category) && body.consent !== 'explicit') {
    errors.push('MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT')
  }
  const lifecycle = body.lifecycle
  if (!lifecycle) return errors
  const { action, status, revision, previous_revision: previousRevision } = lifecycle
  if (revision > 1 && !previousRevision) errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_REQUIRED')
  if (revision === 1 && previousRevision) errors.push('MEMORY_LIFECYCLE_INITIAL_REVISION_HAS_PREDECESSOR')
  if (memoryId && previousRevision && previousRevision.memory_id !== memoryId) errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH')
  if (previousRevision && previousRevision.revision !== revision - 1) errors.push('MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION')
  if (action === 'create' && revision !== 1) errors.push('MEMORY_LIFECYCLE_CREATE_MUST_START_AT_REVISION_ONE')
  if (action === 'supersede' && !(Array.isArray(body.supersedes) && body.supersedes.length > 0)) errors.push('MEMORY_LIFECYCLE_SUPERSEDE_REQUIRES_SUPERSEDES')
  if (action === 'tombstone' && status !== 'tombstoned') errors.push('MEMORY_LIFECYCLE_TOMBSTONE_REQUIRES_TOMBSTONED_STATUS')
  if (status === 'tombstoned' && action !== 'tombstone') errors.push('MEMORY_LIFECYCLE_TOMBSTONED_STATUS_REQUIRES_TOMBSTONE_ACTION')
  if (action === 'expire' && status !== 'expired') errors.push('MEMORY_LIFECYCLE_EXPIRE_REQUIRES_EXPIRED_STATUS')
  if (status === 'expired' && action !== 'expire') errors.push('MEMORY_LIFECYCLE_EXPIRED_STATUS_REQUIRES_EXPIRE_ACTION')
  if (action === 'rollback' && (!previousRevision || !(Array.isArray(body.derived_from) && body.derived_from.length > 0))) errors.push('MEMORY_LIFECYCLE_ROLLBACK_REQUIRES_LINEAGE')
  if (ACTIVE_ACTIONS.has(action) && status !== 'active') errors.push('MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS')
  return errors
}

function validateMemoryTopics(body) {
  const errors = []
  for (const topic of body.topics || []) {
    if (!CORE_TOPICS.has(topic) && !isNamespaced(topic)) errors.push('MEMORY_TOPIC_UNKNOWN_UNNAMESPACED')
  }
  for (const entry of body.metadata || []) {
    if (!isNamespaced(entry.key) && !['importance', 'locale', 'effective_from'].includes(entry.key)) {
      errors.push('MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY')
    }
  }
  return [...new Set(errors)]
}

function validateMemoryProfile(body) {
  if (!body.profile_link) return []
  return !CORE_PROFILE_SCHEMAS.has(body.profile_link.schema_id) && !isNamespaced(body.profile_link.schema_id)
    ? ['MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA']
    : []
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function loadSchemas() {
  const schemaDir = path.resolve(__dirname, 'schema')
  const extSchemaDir = path.join(schemaDir, 'extensions')
  const kindSchemaDir = path.join(schemaDir, 'v1', 'kinds')
  const contextSchemaDir = path.join(schemaDir, 'v1', 'context-sharing')
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)

  for (const name of fs.readdirSync(schemaDir)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = readJson(path.join(schemaDir, name))
    if (schema['$id']) ajv.addSchema(schema, schema['$id'])
  }

  if (fs.existsSync(extSchemaDir)) {
    for (const name of fs.readdirSync(extSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = readJson(path.join(extSchemaDir, name))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  if (fs.existsSync(kindSchemaDir)) {
    for (const name of fs.readdirSync(kindSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = readJson(path.join(kindSchemaDir, name))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  if (fs.existsSync(contextSchemaDir)) {
    for (const name of fs.readdirSync(contextSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = readJson(path.join(contextSchemaDir, name))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  return ajv
}

function detectSchemaId(doc) {
  if (doc && typeof doc.uacp_encrypted === 'string') {
    return 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-encryption'
  }
  if (doc && typeof doc.uacp_export === 'string') {
    return 'https://hn2.github.io/uacp/schema/0.6.0/export'
  }
  if (doc && typeof doc.uacp_vault_envelope === 'string') {
    return 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vault-envelope'
  }
  // A generic kind+body artifact envelope (memory, persona, pack, etc. — see
  // schema/v1/kinds/) is not a chat conversation: it has no `messages` array
  // and the conversation schema's `unevaluatedProperties: false` would reject
  // `kind`/`body` outright. It MUST NOT be routed to the conversation schema.
  // Its structural correctness is judged entirely by its own per-kind body
  // schema, resolved separately in detectKindSchemaId(). Returning null here
  // means "no envelope-level schema to check" — see fusionlayerapp/uacp#102,
  // where every kind+body envelope was previously forced through the
  // conversation schema and always failed there regardless of the body's
  // actual correctness, making the per-kind validation below dead code.
  if (doc && typeof doc.kind === 'string' && doc.body !== undefined) {
    return null
  }
  return 'https://hn2.github.io/uacp/schema/0.6.0/conversation'
}

function detectKindSchemaId(doc) {
  if (doc && typeof doc.kind === 'string' && doc.body !== undefined) {
    return `https://hn2.github.io/uacp/schema/v1/kinds/${doc.kind}`
  }
  return null
}

// Extension fixture format: { fixture_id, ..., expected } — used by extension test vectors.
// Each fixture uses a distinct field name to identify the schema target.
// Any expected value other than "valid" is treated as an expected schema failure.
function resolveExtensionFixture(doc) {
  if (!doc || typeof doc.fixture_id !== 'string') return null
  // Only treat as schema failure if explicitly marked as schema error or a known schema-level error code.
  // Semantic error codes (INVALID_SIGNATURE, DECRYPT_FAILED, etc.) pass schema validation.
  const SCHEMA_FAIL_CODES = new Set(['invalid', 'schema_error', 'UNKNOWN_ROLE', 'UNKNOWN_AXIS_VALUE', 'MISSING_AXIS', 'INVALID_SCOPE_ID'])
  const expectInvalid = SCHEMA_FAIL_CODES.has(doc.expected)
  if (doc.event && typeof doc.event === 'object') {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-sync-event', target: doc.event, expectInvalid }
  }
  if (Array.isArray(doc.registrations) && doc.registrations.length > 0) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-device-registration', target: doc.registrations[0], expectInvalid }
  }
  if (Array.isArray(doc.identity_keys) && doc.identity_keys.length > 0) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-identity-key', target: doc.identity_keys[0], expectInvalid }
  }
  if (doc.payload && typeof doc.payload === 'object' && doc.payload.algorithm) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-event-payload', target: doc.payload, expectInvalid }
  }
  if (doc.clocks && Array.isArray(doc.clocks) && doc.clocks.length > 0) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vector-clock', target: doc.clocks[0], expectInvalid }
  }
  if (doc.member_set && typeof doc.member_set === 'object') {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_set, expectInvalid }
  }
  if (Array.isArray(doc.member_sets) && doc.member_sets.length > 0) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_sets[0], expectInvalid }
  }
  if (Array.isArray(doc.scopes) && doc.scopes.length > 0) {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-scope-identifier', target: doc.scopes[0], expectInvalid }
  }
  if (doc.promotion && typeof doc.promotion === 'object') {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-promotion-event', target: doc.promotion, expectInvalid }
  }
  if (doc.withdraw && typeof doc.withdraw === 'object') {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-withdraw-event', target: doc.withdraw, expectInvalid }
  }
  if (doc.audit_event && typeof doc.audit_event === 'object') {
    return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-audit-event', target: doc.audit_event, expectInvalid }
  }
  return null
}

// Context-sharing kind names that map to schema/v1/context-sharing/
const CONTEXT_SHARING_KINDS = new Set([
  'signed-event-envelope',
  'scope',
  'scope-key-envelope',
  'promotion-event',
  'withdraw-event',
  'vector-clock',
  'identity-key-chain',
])

function resolveVectorSchemaId(kindSchema) {
  if (CONTEXT_SHARING_KINDS.has(kindSchema)) {
    return `https://hn2.github.io/uacp/schema/v1/context-sharing/${kindSchema}`
  }
  return `https://hn2.github.io/uacp/schema/v1/kinds/${kindSchema}`
}

function collectVectors(args) {
  const positional = args.filter(a => !a.startsWith('--'))
  if (positional.length > 0) {
    return positional.map(a => path.resolve(process.cwd(), a)).sort()
  }
  const vectorsDir = path.resolve(__dirname, 'test-vectors')
  const extVectorsDir = path.join(vectorsDir, 'extensions')
  const kindVectorsDir = path.resolve(__dirname, 'conformance', 'vectors', 'kinds')
  const contextVectorsDir = path.resolve(__dirname, 'conformance', 'vectors', 'context-sharing')

  const coreVectors = fs.readdirSync(vectorsDir)
    .filter(n => n.endsWith('.json'))
    .map(n => path.join(vectorsDir, n))

  const extVectors = []
  if (fs.existsSync(extVectorsDir)) {
    for (const extName of fs.readdirSync(extVectorsDir)) {
      const extDir = path.join(extVectorsDir, extName)
      if (!fs.statSync(extDir).isDirectory()) continue
      for (const n of fs.readdirSync(extDir)) {
        if (n.endsWith('.json')) extVectors.push(path.join(extDir, n))
      }
    }
  }

  const kindVectors = []
  if (fs.existsSync(kindVectorsDir)) {
    for (const n of fs.readdirSync(kindVectorsDir)) {
      if (n.endsWith('.json')) kindVectors.push(path.join(kindVectorsDir, n))
    }
  }

  const contextVectors = []
  if (fs.existsSync(contextVectorsDir)) {
    for (const n of fs.readdirSync(contextVectorsDir)) {
      if (n.endsWith('.json')) contextVectors.push(path.join(contextVectorsDir, n))
    }
  }

  return [...coreVectors, ...extVectors, ...kindVectors, ...contextVectors].sort()
}

function main() {
  const args = process.argv.slice(2)
  const skipCrypto = args.includes('--skip-crypto')
  const ajv = loadSchemas()
  const files = collectVectors(args)
  const harnessModeActive = args.filter(a => !a.startsWith('--')).length === 0

  let signing = null
  if (!skipCrypto) {
    try {
      signing = require('./signing')
    } catch (_) {
      // signing module unavailable — structural validation only
    }
  }

  let passed = 0
  let failed = 0

  for (const file of files) {
    const name = path.relative(path.resolve(__dirname), file)
    try {
      const doc = readJson(file)

      // Conformance vectors (kinds + context-sharing) use _schema and _expect at top level
      const kindSchema = doc._schema
      const expectInvalidKind = harnessModeActive && doc._expect === 'invalid'

      if (kindSchema) {
        const schemaId = resolveVectorSchemaId(kindSchema)
        const bodyToValidate = doc.body !== undefined ? doc.body : doc
        const valid = ajv.validate(schemaId, bodyToValidate)
        const errors = ajv.errors || []

        // Cryptographic verification for signed-event-envelope
        let cryptoError = null
        if (kindSchema === 'signed-event-envelope' && valid && !skipCrypto && signing) {
          const publicKey = doc._publicKey || (bodyToValidate && bodyToValidate.author_device_key)
          const result = signing.verifySignedEvent(bodyToValidate, { publicKey })
          if (!result.valid) {
            cryptoError = result.error || 'signature verification failed'
          }
        }

        const memoryErrors = kindSchema === 'memory' && valid
          ? [...validateMemoryLifecycle(bodyToValidate), ...validateMemoryTopics(bodyToValidate), ...validateMemoryProfile(bodyToValidate)]
          : []
        const overallValid = valid && !cryptoError && memoryErrors.length === 0

        if (harnessModeActive && doc._expect === 'invalid') {
          if (!overallValid) {
            passed += 1
            let reason
            if (cryptoError) {
              reason = cryptoError
            } else if (memoryErrors.length > 0) {
              reason = memoryErrors.join('; ')
            } else {
              reason = errors.map(e => `body/${(e.instancePath || '').replace(/^\//, '')} ${e.message}`.trim()).join('; ')
            }
            console.log(`✓ ${name} (expected invalid — ${reason})`)
          } else {
            failed += 1
            console.error(`✗ ${name}: expected validation failure but document passed`)
          }
        } else {
          if (overallValid) {
            passed += 1
            console.log(`✓ ${name}`)
          } else {
            failed += 1
            let reason
            if (cryptoError) {
              reason = cryptoError
            } else if (memoryErrors.length > 0) {
              reason = memoryErrors.join('; ')
            } else {
              reason = errors.map(e => `body/${(e.instancePath || '').replace(/^\//, '')} ${e.message}`.trim()).join('; ')
            }
            console.error(`✗ ${name}: ${reason}`)
          }
        }
        continue
      }

      // Extension fixture format: { fixture_id, event, expected }
      const extFixture = resolveExtensionFixture(doc)
      if (extFixture) {
        const { schemaId: extSchemaId, target: extTarget, expectInvalid: extExpect } = extFixture
        const extValid = ajv.validate(extSchemaId, extTarget)
        const extErrors = ajv.errors || []
        if (extExpect) {
          if (!extValid) {
            passed += 1
            const reason = extErrors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
            console.log(`✓ ${name} (expected invalid — ${reason})`)
          } else {
            failed += 1
            console.error(`✗ ${name}: expected validation failure but document passed`)
          }
        } else {
          if (extValid) {
            passed += 1
            console.log(`✓ ${name}`)
          } else {
            failed += 1
            const reason = extErrors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
            console.error(`✗ ${name}: ${reason}`)
          }
        }
        continue
      }

      const expectInvalid = harnessModeActive && doc && doc.metadata && doc.metadata['uacp.test.expect'] === 'invalid'
      const schemaId = detectSchemaId(doc)
      // schemaId is null for kind+body envelopes (see detectSchemaId): there is
      // no applicable envelope-level schema, so envelope-level validation is
      // vacuously true and the per-kind body schema below is authoritative.
      const valid = schemaId ? ajv.validate(schemaId, doc) : true
      const errors = schemaId ? (ajv.errors || []) : []

      // Also validate body against kind schema if envelope has kind + body
      const kindSchemaId = detectKindSchemaId(doc)
      let kindErrors = []
      if (kindSchemaId && ajv.getSchema(kindSchemaId)) {
        const kindValid = ajv.validate(kindSchemaId, doc.body)
        kindErrors = (ajv.errors || []).map(e => ({ ...e, instancePath: `body${e.instancePath}` }))
        // A kind+body envelope's overall validity is now decided entirely by
        // this per-kind body schema check (and, for memory, the semantic
        // lifecycle/topics/profile checks below) — detectSchemaId() skips the
        // unrelated chat-message conversation schema for these documents, so
        // `valid` above is already true and kindErrors here is the deciding
        // factor. This was previously dead code for every kind (see
        // fusionlayerapp/uacp#102); fixed generally, not just for memory.
        if (doc.kind === 'memory' && kindValid) {
          kindErrors.push(...[
            ...validateMemoryLifecycle(doc.body, { memoryId: doc.id }),
            ...validateMemoryTopics(doc.body),
            ...validateMemoryProfile(doc.body),
          ]
            .map(code => ({
              instancePath: code.startsWith('MEMORY_LIFECYCLE_') ? 'body/lifecycle' : 'body',
              message: code,
            })))
        }
        if (kindErrors.length > 0) {
          kindErrors.forEach(e => errors.push(e))
        }
      }

      if (expectInvalid) {
        if (!valid || kindErrors.length > 0) {
          passed += 1
          const allErrors = [...errors]
          const reason = allErrors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
          console.log(`✓ ${name} (expected invalid — ${reason})`)
        } else {
          failed += 1
          console.error(`✗ ${name}: expected validation failure but document passed`)
        }
      } else {
        if (valid && kindErrors.length === 0) {
          passed += 1
          console.log(`✓ ${name}`)
        } else {
          failed += 1
          const reason = errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
          console.error(`✗ ${name}: ${reason}`)
        }
      }
    } catch (e) {
      failed += 1
      console.error(`✗ ${name}: ${e.message}`)
    }
  }

  console.log(`\nUACP validate: pass=${passed} fail=${failed}`)
  process.exit(failed ? 1 : 0)
}

main()
