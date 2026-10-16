#!/usr/bin/env node
// Generates test vectors for uacp-audit-event (hn2/uacp#44)
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/audit-event')
fs.mkdirSync(OUT_DIR, { recursive: true })

// --- Minimal deterministic CBOR encoder (RFC 8949, no deps) ---
function cborHead(major, arg) {
  const m = major << 5
  if (arg <= 23) return Buffer.from([m | arg])
  if (arg <= 0xff) return Buffer.from([m | 24, arg])
  if (arg <= 0xffff) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(arg, 1); return b }
  if (arg <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(arg, 1); return b }
  throw new Error('integer too large for this encoder')
}
function cborText(s) { const b = Buffer.from(s, 'utf8'); return Buffer.concat([cborHead(3, b.length), b]) }
function cborBytes(b) { return Buffer.concat([cborHead(2, b.length), b]) }
function cborUint(n) {
  const big = BigInt(n)
  if (big <= 0x17n) return Buffer.from([Number(big)])
  if (big <= 0xffn) return Buffer.from([0x18, Number(big)])
  if (big <= 0xffffn) { const b = Buffer.alloc(3); b[0] = 0x19; b.writeUInt16BE(Number(big), 1); return b }
  if (big <= 0xffffffffn) { const b = Buffer.alloc(5); b[0] = 0x1a; b.writeUInt32BE(Number(big), 1); return b }
  // uint64 — use two 32-bit writes
  const b = Buffer.alloc(9); b[0] = 0x1b
  b.writeUInt32BE(Number(big >> 32n), 1)
  b.writeUInt32BE(Number(big & 0xffffffffn), 5)
  return b
}
function cborNull() { return Buffer.from([0xf6]) }

// Encode AuditEvent in canonical field order
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

function cborAuditMetadata(m) {
  const entries = []
  if (m.vendor !== undefined) entries.push([cborText('vendor'), m.vendor === null ? cborNull() : cborText(m.vendor)])
  if (m.token_count !== undefined) entries.push([cborText('token_count'), m.token_count === null ? cborNull() : cborUint(m.token_count)])
  if (m.redaction_count !== undefined) entries.push([cborText('redaction_count'), m.redaction_count === null ? cborNull() : cborUint(m.redaction_count)])
  const pairs = entries.flatMap(([k, v]) => [k, v])
  return Buffer.concat([cborHead(5, entries.length), ...pairs])
}

function hashEvent(ev) {
  return crypto.createHash('sha256').update(cborAuditEvent(ev)).digest()
}

// Deterministic test UUIDs
const SCOPE_ID   = '20000000-0000-4000-8000-000000000001'  // mobile-team
const SCOPE_FAM  = '20000000-0000-4000-8000-000000000002'  // family scope
const USER_MIKE  = '10000000-0000-4000-8000-000000000001'
const USER_BOB   = '10000000-0000-4000-8000-000000000002'
const USER_CHILD = '10000000-0000-4000-8000-000000000003'
const OBS_RELAY  = '30000000-0000-4000-8000-000000000001'

const GENESIS_HASH = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' // 32 zero bytes

function makeEvent(overrides) {
  return {
    type: 'audit',
    scope_id: SCOPE_ID,
    subject_user_id: USER_MIKE,
    action: 'ai_prompt_sent',
    metadata: { vendor: 'anthropic', token_count: 1024, redaction_count: null },
    prev_audit_hash: GENESIS_HASH,
    timestamp: 1715000000000,
    observer_id: OBS_RELAY,
    ...overrides,
  }
}

function write(name, obj) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(obj, null, 2))
  console.log(`wrote ${name}`)
}

// --- Fixtures ---

// 01: genesis entry
const e0 = makeEvent()
write('01-genesis-entry.json', {
  fixture_id: 'audit-event-01',
  description: 'Chain genesis: first audit entry for mobile-team scope',
  expected: 'valid',
  scenario: '11',
  audit_event: e0,
})

// 02: chained entry — prev_audit_hash = SHA-256(CBOR(e0))
const e1 = makeEvent({
  action: 'dlp_redaction',
  metadata: { vendor: 'anthropic', token_count: null, redaction_count: 3 },
  prev_audit_hash: hashEvent(e0).toString('base64url'),
  timestamp: 1715000001000,
  subject_user_id: USER_BOB,
})
write('02-chained-entry.json', {
  fixture_id: 'audit-event-02',
  description: 'Second entry in chain with correct prev_audit_hash',
  expected: 'valid',
  scenario: '8',
  audit_event: e1,
})

// 03: guardrail_triggered in family scope
const e2 = makeEvent({
  scope_id: SCOPE_FAM,
  subject_user_id: USER_CHILD,
  action: 'guardrail_triggered',
  metadata: { vendor: 'openai', token_count: null, redaction_count: null },
  prev_audit_hash: GENESIS_HASH,
  timestamp: 1715000002000,
})
write('03-guardrail-triggered.json', {
  fixture_id: 'audit-event-03',
  description: 'guardrail_triggered entry in family scope (Scenario 10)',
  expected: 'valid',
  scenario: '10',
  audit_event: e2,
})

// 04: compliance chain (3 events — fixture stores the third for chain walkability)
const e3 = makeEvent({
  action: 'scope_member_added',
  metadata: { vendor: null, token_count: null, redaction_count: null },
  prev_audit_hash: hashEvent(e1).toString('base64url'),
  timestamp: 1715000003000,
  subject_user_id: USER_BOB,
})
write('04-compliance-chain.json', {
  fixture_id: 'audit-event-04',
  description: 'Third entry in compliance chain — Mike can walk all three entries without gaps (Scenario 11)',
  expected: 'valid',
  scenario: '11',
  chain_hashes: [
    GENESIS_HASH,
    hashEvent(e0).toString('base64url'),
    hashEvent(e1).toString('base64url'),
  ],
  audit_event: e3,
})

// 05: broken chain — prev_audit_hash wrong length (22 chars, not 43)
write('05-broken-chain.json', {
  fixture_id: 'audit-event-05',
  description: 'prev_audit_hash wrong length triggers schema rejection',
  expected: 'schema_error',
  audit_event: {
    type: 'audit',
    scope_id: SCOPE_ID,
    subject_user_id: USER_MIKE,
    action: 'ai_prompt_sent',
    metadata: { vendor: 'anthropic', token_count: 512, redaction_count: null },
    prev_audit_hash: 'tooshort',
    timestamp: 1715000004000,
    observer_id: OBS_RELAY,
  },
})

// 06: content in metadata (extra field → unevaluatedProperties rejects)
write('06-content-in-metadata.json', {
  fixture_id: 'audit-event-06',
  description: 'metadata with disallowed content field must be rejected',
  expected: 'schema_error',
  audit_event: {
    type: 'audit',
    scope_id: SCOPE_ID,
    subject_user_id: USER_MIKE,
    action: 'ai_prompt_sent',
    metadata: { vendor: 'anthropic', token_count: 100, redaction_count: null, prompt_text: 'do my taxes' },
    prev_audit_hash: GENESIS_HASH,
    timestamp: 1715000005000,
    observer_id: OBS_RELAY,
  },
})

console.log('done')
