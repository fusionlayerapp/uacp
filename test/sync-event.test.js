'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_PATH = path.join(REPO_ROOT, 'schema', 'extensions', 'uacp-sync-event.schema.json')
const VECTORS_DIR = path.join(REPO_ROOT, 'test-vectors', 'extensions', 'sync-event')
const KEYS_DIR = path.join(VECTORS_DIR, 'keys')

// ---------------------------------------------------------------------------
// Schema validator
// ---------------------------------------------------------------------------
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'))
const validateSchema = ajv.compile(schema)

// ---------------------------------------------------------------------------
// Minimal deterministic CBOR encoder (matches generate-sync-event-vectors.js)
// ---------------------------------------------------------------------------
function cborHead(major, n) {
  const m = major << 5
  if (n < 24) return Buffer.from([m | n])
  if (n < 0x100) return Buffer.from([m | 24, n])
  if (n < 0x10000) return Buffer.from([m | 25, n >> 8, n & 0xff])
  if (n < 0x100000000) {
    return Buffer.from([m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
  }
  const hi = Math.floor(n / 0x100000000)
  const lo = n >>> 0
  return Buffer.from([
    m | 27,
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff,
  ])
}

function cborText(s) {
  const b = Buffer.from(s, 'utf8')
  return Buffer.concat([cborHead(3, b.length), b])
}

function cborUint(n) { return cborHead(0, n) }

function cborBytes(b) {
  return Buffer.concat([cborHead(2, b.length), b])
}

const CBOR_NULL = Buffer.from([0xf6])

function cborMapOrdered(entries) {
  return Buffer.concat([cborHead(5, entries.length), ...entries.map(([k, v]) => Buffer.concat([cborText(k), v]))])
}

function cborMapCanonical(entries) {
  const sorted = [...entries].sort(([ka], [kb]) => {
    const ba = Buffer.from(ka, 'utf8'), bb = Buffer.from(kb, 'utf8')
    if (ba.length !== bb.length) return ba.length - bb.length
    return ba.compare(bb)
  })
  return cborMapOrdered(sorted)
}

function canonicalCbor(ev) {
  const vcEntries = Object.entries(ev.vector_clock).map(([k, v]) => [k, cborUint(v)])
  return cborMapOrdered([
    ['conversation_id',  cborText(ev.conversation_id)],
    ['event_id',         cborText(ev.event_id)],
    ['parent_event_id',  ev.parent_event_id === null ? CBOR_NULL : cborText(ev.parent_event_id)],
    ['vector_clock',     cborMapCanonical(vcEntries)],
    ['author_user_id',   cborText(ev.author_user_id)],
    ['author_device_id', cborText(ev.author_device_id)],
    ['timestamp',        cborUint(ev.timestamp)],
    ['scope_id',         cborText(ev.scope_id)],
    ['payload',          cborBytes(Buffer.from(ev.payload, 'base64url'))],
  ])
}

// ---------------------------------------------------------------------------
// Event validator — implements MUST rules from the spec
// ---------------------------------------------------------------------------
const ERROR = {
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  MISSING_PARENT:    'MISSING_PARENT',
  CLOCK_REGRESSION:  'CLOCK_REGRESSION',
  STALE_TIMESTAMP:   'STALE_TIMESTAMP',
  UNAUTHORIZED_SCOPE:'UNAUTHORIZED_SCOPE',
}

function loadPublicKey(deviceId) {
  const hexFile = path.join(KEYS_DIR, `device-${deviceId}-pub.spki.hex`)
  if (!fs.existsSync(hexFile)) return null
  const hex = fs.readFileSync(hexFile, 'utf8').trim()
  return crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' })
}

// Maps test device UUIDs to their key file nicknames
const DEVICE_KEY_MAP = {
  '20000000-0000-4000-8000-000000000001': 'a1',
  '20000000-0000-4000-8000-000000000002': 'a2',
  '20000000-0000-4000-8000-000000000003': 'b1',
}

function getPublicKey(deviceId) {
  const nick = DEVICE_KEY_MAP[deviceId]
  if (!nick) return null
  return loadPublicKey(nick)
}

function validateEvent(event, log) {
  const logById = new Map((log || []).map(e => [e.event_id, e]))

  // MISSING_PARENT
  if (event.parent_event_id !== null && !logById.has(event.parent_event_id)) {
    return ERROR.MISSING_PARENT
  }

  // CLOCK_REGRESSION
  const deviceClock = event.vector_clock[event.author_device_id]
  if (deviceClock === undefined) return ERROR.CLOCK_REGRESSION
  if (event.parent_event_id !== null) {
    const parent = logById.get(event.parent_event_id)
    const parentClock = parent.vector_clock[event.author_device_id] ?? 0
    if (deviceClock <= parentClock) return ERROR.CLOCK_REGRESSION
  } else {
    if (deviceClock < 1) return ERROR.CLOCK_REGRESSION
  }

  // STALE_TIMESTAMP
  if (event.parent_event_id !== null) {
    const parent = logById.get(event.parent_event_id)
    if (event.timestamp < parent.timestamp - 60000) return ERROR.STALE_TIMESTAMP
  }

  // INVALID_SIGNATURE
  const pubKey = getPublicKey(event.author_device_id)
  if (pubKey) {
    const msg = canonicalCbor(event)
    const sig = Buffer.from(event.signature, 'base64url')
    const ok = crypto.verify(null, msg, pubKey, sig)
    if (!ok) return ERROR.INVALID_SIGNATURE
  }

  return 'valid'
}

// ---------------------------------------------------------------------------
// Load fixtures helper
// ---------------------------------------------------------------------------
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, `${name}.json`), 'utf8'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uacp-sync-event schema', () => {
  it('schema file is valid JSON Schema', () => {
    assert.ok(schema['$id'], 'schema has $id')
    assert.equal(schema.type, 'object')
    assert.ok(Array.isArray(schema.required))
  })

  it('schema requires all mandatory fields', () => {
    const required = new Set(schema.required)
    for (const field of [
      'conversation_id', 'event_id', 'parent_event_id', 'vector_clock',
      'author_user_id', 'author_device_id', 'timestamp', 'scope_id', 'payload', 'signature',
    ]) {
      assert.ok(required.has(field), `${field} must be required`)
    }
  })

  it('schema rejects missing required fields', () => {
    assert.ok(!validateSchema({}), 'empty object must be invalid')
    assert.ok(!validateSchema({ conversation_id: '30000000-0000-4000-8000-000000000001' }), 'partial object must be invalid')
  })

  it('schema rejects malformed UUIDs', () => {
    const f = loadFixture('01-valid-first-event')
    const bad = { ...f.event, conversation_id: 'not-a-uuid' }
    assert.ok(!validateSchema(bad), 'non-UUID conversation_id must fail')
  })

  it('schema rejects signature of wrong length', () => {
    const f = loadFixture('01-valid-first-event')
    assert.ok(!validateSchema({ ...f.event, signature: 'tooshort' }), 'short signature must fail')
    assert.ok(!validateSchema({ ...f.event, signature: 'A'.repeat(90) }), '90-char signature must fail')
  })

  it('schema allows null parent_event_id', () => {
    const f = loadFixture('01-valid-first-event')
    assert.ok(validateSchema(f.event), 'valid first event must pass schema')
  })

  it('schema rejects additional properties', () => {
    const f = loadFixture('01-valid-first-event')
    assert.ok(!validateSchema({ ...f.event, extra: 'field' }), 'additional properties must fail')
  })
})

describe('uacp-sync-event — Scenario 1: single event null parent', () => {
  it('test_scenario_1_first_event_validates', () => {
    const f = loadFixture('01-valid-first-event')
    assert.ok(validateSchema(f.event), 'schema valid')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, f.expected)
  })
})

describe('uacp-sync-event — Scenario 2: six concurrent events vector clock', () => {
  it('test_scenario_2_chain_validates', () => {
    const f = loadFixture('02-valid-chain')
    assert.ok(validateSchema(f.event), 'schema valid')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, f.expected)
  })

  it('test_scenario_2_clock_regression_detected', () => {
    const f = loadFixture('negative-02-clock-regression')
    assert.ok(validateSchema(f.event), 'schema valid')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, ERROR.CLOCK_REGRESSION)
  })
})

describe('uacp-sync-event — Scenario 7: two users separate device keys', () => {
  it('test_scenario_7_two_users_verify', () => {
    const f = loadFixture('03-two-user-events')
    assert.ok(validateSchema(f.event), 'schema valid')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, f.expected)
  })
})

describe('uacp-sync-event — Scenario 14: offline replay', () => {
  it('test_scenario_14_offline_events_replay', () => {
    const f = loadFixture('04-offline-replay')
    const log = [...f.log]

    assert.ok(validateSchema(f.event), 'first replay event schema valid')
    const r1 = validateEvent(f.event, log)
    assert.equal(r1, f.expected)
    log.push(f.event)

    for (const ev of f.offline_tail) {
      assert.ok(validateSchema(ev), 'subsequent replay event schema valid')
      const r = validateEvent(ev, log)
      assert.equal(r, 'valid')
      log.push(ev)
    }
  })
})

describe('uacp-sync-event — negative cases', () => {
  it('test_scenario_negative_tampered_payload_triggers_INVALID_SIGNATURE', () => {
    const f = loadFixture('negative-01-tampered-payload')
    assert.ok(validateSchema(f.event), 'schema valid (structure is valid; content is not)')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, ERROR.INVALID_SIGNATURE)
  })

  it('test_scenario_negative_missing_parent', () => {
    const f = loadFixture('negative-03-missing-parent')
    assert.ok(validateSchema(f.event), 'schema valid')
    const result = validateEvent(f.event, f.log)
    assert.equal(result, ERROR.MISSING_PARENT)
  })
})
