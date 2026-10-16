'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

// --- AJV setup ---
const SCHEMA_DIR = path.resolve(__dirname, '../schema')
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
for (const name of fs.readdirSync(SCHEMA_DIR)) {
  if (!name.endsWith('.schema.json')) continue
  const s = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))
  if (s['$id']) ajv.addSchema(s, s['$id'])
}
const extDir = path.join(SCHEMA_DIR, 'extensions')
for (const name of fs.readdirSync(extDir)) {
  if (!name.endsWith('.schema.json')) continue
  const s = JSON.parse(fs.readFileSync(path.join(extDir, name), 'utf8'))
  if (s['$id']) ajv.addSchema(s, s['$id'])
}

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-audit-event'
const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/audit-event')

function validate(obj) { return ajv.validate(SCHEMA_ID, obj) }

// --- Inline CBOR encoder (matches generation script) ---
function cborHead(major, arg) {
  const m = major << 5
  if (arg <= 23) return Buffer.from([m | arg])
  if (arg <= 0xff) return Buffer.from([m | 24, arg])
  if (arg <= 0xffff) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(arg, 1); return b }
  if (arg <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(arg, 1); return b }
  throw new Error('integer too large')
}
function cborText(s) { const b = Buffer.from(s, 'utf8'); return Buffer.concat([cborHead(3, b.length), b]) }
function cborBytes(b) { return Buffer.concat([cborHead(2, b.length), b]) }
function cborNull() { return Buffer.from([0xf6]) }
function cborUint(n) {
  const big = BigInt(n)
  if (big <= 0x17n) return Buffer.from([Number(big)])
  if (big <= 0xffn) return Buffer.from([0x18, Number(big)])
  if (big <= 0xffffn) { const b = Buffer.alloc(3); b[0] = 0x19; b.writeUInt16BE(Number(big), 1); return b }
  if (big <= 0xffffffffn) { const b = Buffer.alloc(5); b[0] = 0x1a; b.writeUInt32BE(Number(big), 1); return b }
  const b = Buffer.alloc(9); b[0] = 0x1b
  b.writeUInt32BE(Number(big >> 32n), 1)
  b.writeUInt32BE(Number(big & 0xffffffffn), 5)
  return b
}
function cborAuditMetadata(m) {
  const entries = []
  if (m.vendor !== undefined) entries.push([cborText('vendor'), m.vendor === null ? cborNull() : cborText(m.vendor)])
  if (m.token_count !== undefined) entries.push([cborText('token_count'), m.token_count === null ? cborNull() : cborUint(m.token_count)])
  if (m.redaction_count !== undefined) entries.push([cborText('redaction_count'), m.redaction_count === null ? cborNull() : cborUint(m.redaction_count)])
  const pairs = entries.flatMap(([k, v]) => [k, v])
  return Buffer.concat([cborHead(5, entries.length), ...pairs])
}
function cborAuditEvent(ev) {
  const fields = [
    [cborText('type'), cborText(ev.type)],
    [cborText('scope_id'), cborText(ev.scope_id)],
    [cborText('subject_user_id'), cborText(ev.subject_user_id)],
    [cborText('action'), cborText(ev.action)],
    [cborText('metadata'), cborAuditMetadata(ev.metadata)],
    [cborText('prev_audit_hash'), cborBytes(Buffer.from(ev.prev_audit_hash, 'base64url'))],
    [cborText('timestamp'), cborUint(ev.timestamp)],
    [cborText('observer_id'), cborText(ev.observer_id)],
  ]
  const pairs = fields.flatMap(([k, v]) => [k, v])
  return Buffer.concat([cborHead(5, fields.length), ...pairs])
}
function hashEvent(ev) {
  return crypto.createHash('sha256').update(cborAuditEvent(ev)).digest()
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, name), 'utf8'))
}

// --- Schema validation tests ---

test('01-genesis-entry validates', () => {
  const f = loadFixture('01-genesis-entry.json')
  assert.ok(validate(f.audit_event), JSON.stringify(ajv.errors))
})

test('02-chained-entry validates', () => {
  const f = loadFixture('02-chained-entry.json')
  assert.ok(validate(f.audit_event), JSON.stringify(ajv.errors))
})

test('03-guardrail-triggered validates', () => {
  const f = loadFixture('03-guardrail-triggered.json')
  assert.ok(validate(f.audit_event), JSON.stringify(ajv.errors))
})

test('04-compliance-chain validates', () => {
  const f = loadFixture('04-compliance-chain.json')
  assert.ok(validate(f.audit_event), JSON.stringify(ajv.errors))
})

test('05-broken-chain is rejected by schema (prev_audit_hash wrong length)', () => {
  const f = loadFixture('05-broken-chain.json')
  assert.equal(validate(f.audit_event), false)
  assert.ok(ajv.errors.some(e => e.keyword === 'pattern' || e.keyword === 'minLength'))
})

test('06-content-in-metadata is rejected by schema (unevaluatedProperties)', () => {
  const f = loadFixture('06-content-in-metadata.json')
  assert.equal(validate(f.audit_event), false)
  assert.ok(ajv.errors.some(e => e.keyword === 'unevaluatedProperties'))
})

// --- Field-level schema tests ---

test('type must be "audit"', () => {
  assert.equal(validate({ type: 'wrong', scope_id: '10000000-0000-4000-8000-000000000001', subject_user_id: '10000000-0000-4000-8000-000000000001', action: 'promotion', metadata: {}, prev_audit_hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', timestamp: 1715000000000, observer_id: '10000000-0000-4000-8000-000000000001' }), false)
})

test('action rejects unknown value', () => {
  const f = loadFixture('01-genesis-entry.json')
  const ev = { ...f.audit_event, action: 'unknown_action' }
  assert.equal(validate(ev), false)
})

test('all valid action values pass schema', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  const actions = ['ai_prompt_sent', 'dlp_redaction', 'scope_member_added', 'scope_member_removed', 'promotion', 'withdraw', 'legal_hold_invoked', 'guardrail_triggered']
  for (const action of actions) {
    assert.ok(validate({ ...base, action }), `action ${action} should be valid`)
  }
})

test('scope_id must be UUID v4', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.equal(validate({ ...base, scope_id: 'not-a-uuid' }), false)
})

test('prev_audit_hash must be 43-char base64url', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.equal(validate({ ...base, prev_audit_hash: 'tooshort' }), false)
  assert.equal(validate({ ...base, prev_audit_hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }), true)
})

test('timestamp must be non-negative integer', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.equal(validate({ ...base, timestamp: -1 }), false)
  assert.equal(validate({ ...base, timestamp: 0 }), true)
})

test('metadata.vendor can be null', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.ok(validate({ ...base, metadata: { vendor: null } }))
})

test('metadata.token_count can be null or uint32', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.ok(validate({ ...base, metadata: { token_count: null } }))
  assert.ok(validate({ ...base, metadata: { token_count: 4294967295 } }))
  assert.equal(validate({ ...base, metadata: { token_count: -1 } }), false)
})

test('metadata.redaction_count can be null or uint32', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  assert.ok(validate({ ...base, metadata: { redaction_count: null } }))
  assert.ok(validate({ ...base, metadata: { redaction_count: 0 } }))
})

test('missing required field fails', () => {
  const base = loadFixture('01-genesis-entry.json').audit_event
  const { observer_id, ...noObs } = base
  assert.equal(validate(noObs), false)
})

// --- Hash-chain integrity tests (Scenario 11) ---

test('chain genesis: prev_audit_hash is 32 zero bytes base64url', () => {
  const f = loadFixture('01-genesis-entry.json')
  const ev = f.audit_event
  assert.equal(ev.prev_audit_hash, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  const decoded = Buffer.from(ev.prev_audit_hash, 'base64url')
  assert.equal(decoded.length, 32)
  assert.ok(decoded.every(b => b === 0))
})

test('02-chained-entry prev_audit_hash matches hash of 01-genesis-entry', () => {
  const f0 = loadFixture('01-genesis-entry.json').audit_event
  const f1 = loadFixture('02-chained-entry.json').audit_event
  const expected = hashEvent(f0).toString('base64url')
  assert.equal(f1.prev_audit_hash, expected)
})

test('04-compliance-chain prev_audit_hash matches hash of 02-chained-entry', () => {
  const f1 = loadFixture('02-chained-entry.json').audit_event
  const f3 = loadFixture('04-compliance-chain.json').audit_event
  const expected = hashEvent(f1).toString('base64url')
  assert.equal(f3.prev_audit_hash, expected)
})

test('AUDIT_HASH_CHAIN_BROKEN: mutating event body breaks the chain', () => {
  const f0 = loadFixture('01-genesis-entry.json').audit_event
  const f1 = loadFixture('02-chained-entry.json').audit_event
  const tampered = { ...f0, action: 'withdraw' }
  const expectedFromTampered = hashEvent(tampered).toString('base64url')
  assert.notEqual(f1.prev_audit_hash, expectedFromTampered, 'tampered event should break hash chain')
})

test('AUDIT_HASH_CHAIN_BROKEN: full chain walk passes for fixtures 01→02→04', () => {
  const events = [
    loadFixture('01-genesis-entry.json').audit_event,
    loadFixture('02-chained-entry.json').audit_event,
    loadFixture('04-compliance-chain.json').audit_event,
  ]
  for (let i = 1; i < events.length; i++) {
    const expected = hashEvent(events[i - 1]).toString('base64url')
    assert.equal(events[i].prev_audit_hash, expected, `chain broken at index ${i}`)
  }
})
