'use strict'
// One-time generation script for uacp-sync-event conformance test vectors.
// Run: node scripts/generate-sync-event-vectors.js
// Outputs fixtures to test-vectors/extensions/sync-event/
//
// Keys generated here are TEST-ONLY. Never reuse in production.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '..', 'test-vectors', 'extensions', 'sync-event')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Minimal deterministic CBOR encoder (RFC 8949)
// Handles: text string, uint64, null, bytes, map
// ---------------------------------------------------------------------------

function cborHead(major, n) {
  const m = major << 5
  if (n < 24) return Buffer.from([m | n])
  if (n < 0x100) return Buffer.from([m | 24, n])
  if (n < 0x10000) return Buffer.from([m | 25, n >> 8, n & 0xff])
  if (n < 0x100000000) {
    return Buffer.from([m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
  }
  // uint64 — split into hi/lo
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

function cborUint(n) {
  return cborHead(0, n)
}

function cborBytes(b) {
  return Buffer.concat([cborHead(2, b.length), b])
}

const CBOR_NULL = Buffer.from([0xf6])

// Map with explicit entry order (for the outer event map).
function cborMapOrdered(entries) {
  // entries: Array of [key_string, Buffer]
  const header = cborHead(5, entries.length)
  return Buffer.concat([header, ...entries.map(([k, v]) => Buffer.concat([cborText(k), v]))])
}

// Map with RFC 8949 §4.2.1 canonical key order (length-first, then lex).
function cborMapCanonical(entries) {
  const sorted = [...entries].sort(([ka], [kb]) => {
    const ba = Buffer.from(ka, 'utf8')
    const bb = Buffer.from(kb, 'utf8')
    if (ba.length !== bb.length) return ba.length - bb.length
    return ba.compare(bb)
  })
  return cborMapOrdered(sorted)
}

// Encode the event fields (excluding signature) in the spec-defined order.
function canonicalCbor(ev) {
  const vcEntries = Object.entries(ev.vector_clock).map(([k, v]) => [k, cborUint(v)])
  const entries = [
    ['conversation_id', cborText(ev.conversation_id)],
    ['event_id',        cborText(ev.event_id)],
    ['parent_event_id', ev.parent_event_id === null ? CBOR_NULL : cborText(ev.parent_event_id)],
    ['vector_clock',    cborMapCanonical(vcEntries)],
    ['author_user_id',  cborText(ev.author_user_id)],
    ['author_device_id',cborText(ev.author_device_id)],
    ['timestamp',       cborUint(ev.timestamp)],
    ['scope_id',        cborText(ev.scope_id)],
    ['payload',         cborBytes(Buffer.from(ev.payload, 'base64url'))],
  ]
  return cborMapOrdered(entries)
}

// ---------------------------------------------------------------------------
// Key management helpers
// ---------------------------------------------------------------------------

function genKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  return {
    privateKey,
    publicKey,
    publicKeyHex: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
  }
}

function signEvent(ev, privateKey) {
  const msg = canonicalCbor(ev)
  const sig = crypto.sign(null, msg, privateKey)
  return Buffer.from(sig).toString('base64url')
}

function uuid() {
  return crypto.randomUUID()
}

// Deterministic but unique per run — fixed test UUIDs for reproducibility
const TEST = {
  userA:   '10000000-0000-4000-8000-000000000001',
  userB:   '10000000-0000-4000-8000-000000000002',
  deviceA1:'20000000-0000-4000-8000-000000000001',
  deviceA2:'20000000-0000-4000-8000-000000000002',
  deviceB1:'20000000-0000-4000-8000-000000000003',
  conv1:   '30000000-0000-4000-8000-000000000001',
  conv2:   '30000000-0000-4000-8000-000000000002',
  scope1:  '40000000-0000-4000-8000-000000000001',
}

// Generate key pairs (new per run; stored in keys/ for test use)
const keysDir = path.join(OUT_DIR, 'keys')
fs.mkdirSync(keysDir, { recursive: true })

const kA1 = genKeyPair()
const kA2 = genKeyPair()
const kB1 = genKeyPair()

fs.writeFileSync(path.join(keysDir, 'device-a1-pub.spki.hex'), kA1.publicKeyHex)
fs.writeFileSync(path.join(keysDir, 'device-a2-pub.spki.hex'), kA2.publicKeyHex)
fs.writeFileSync(path.join(keysDir, 'device-b1-pub.spki.hex'), kB1.publicKeyHex)

// ---------------------------------------------------------------------------
// Build and sign a base event
// ---------------------------------------------------------------------------

function makeEvent(overrides) {
  const base = {
    conversation_id:  TEST.conv1,
    event_id:         uuid(),
    parent_event_id:  null,
    vector_clock:     { [TEST.deviceA1]: 1 },
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1747180800000,
    scope_id:         TEST.scope1,
    payload:          Buffer.from('fake-ciphertext-a').toString('base64url'),
  }
  return { ...base, ...overrides }
}

function fixture(id, description, expected, log, ev) {
  return { fixture_id: id, description, expected, log, event: ev }
}

function save(id, obj) {
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(obj, null, 2) + '\n')
  console.log('wrote', id)
}

// ---------------------------------------------------------------------------
// 01 — valid first event (null parent)
// ---------------------------------------------------------------------------
{
  const ev = makeEvent({})
  ev.signature = signEvent(ev, kA1.privateKey)
  save('01-valid-first-event', fixture(
    '01-valid-first-event',
    'Single event with null parent — must validate and decode successfully (Scenario 1)',
    'valid',
    [],
    ev,
  ))
}

// ---------------------------------------------------------------------------
// 02 — valid chain of six events (Scenario 2)
// ---------------------------------------------------------------------------
{
  const log = []
  let prevId = null
  let clock = 0
  const events = []
  for (let i = 0; i < 6; i++) {
    clock++
    const ev = makeEvent({
      event_id:        uuid(),
      parent_event_id: prevId,
      vector_clock:    { [TEST.deviceA1]: clock },
      timestamp:       1747180800000 + i * 1000,
      payload:         Buffer.from(`payload-${i}`).toString('base64url'),
    })
    ev.signature = signEvent(ev, kA1.privateKey)
    events.push(ev)
    prevId = ev.event_id
    if (i < 5) log.push(ev)
  }
  save('02-valid-chain', fixture(
    '02-valid-chain',
    'Six chained events from same device — all must validate and order by vector_clock (Scenario 2)',
    'valid',
    log,
    events[5],
  ))
}

// ---------------------------------------------------------------------------
// 03 — two users in same scope, separate device keys (Scenario 7)
// ---------------------------------------------------------------------------
{
  const evA = makeEvent({
    event_id:        uuid(),
    parent_event_id: null,
    vector_clock:    { [TEST.deviceA1]: 1 },
    author_user_id:  TEST.userA,
    author_device_id:TEST.deviceA1,
    timestamp:       1747180800000,
  })
  evA.signature = signEvent(evA, kA1.privateKey)

  const evB = makeEvent({
    event_id:        uuid(),
    parent_event_id: null,
    vector_clock:    { [TEST.deviceB1]: 1 },
    author_user_id:  TEST.userB,
    author_device_id:TEST.deviceB1,
    timestamp:       1747180800001,
  })
  evB.signature = signEvent(evB, kB1.privateKey)

  save('03-two-user-events', {
    fixture_id: '03-two-user-events',
    description: 'Two users in same scope sign with separate device keys — both must verify (Scenario 7)',
    expected: 'valid',
    log: [evA],
    event: evB,
    note: 'Both events share scope_id. Each device key is certified by its respective user identity key.',
  })
}

// ---------------------------------------------------------------------------
// 04 — offline replay (Scenario 14)
// ---------------------------------------------------------------------------
{
  // Simulate: device A2 went offline, produced events 3-5, rejoins and replays
  const onlineEvents = []
  let clock = 0
  let prevId = null

  for (let i = 0; i < 2; i++) {
    clock++
    const ev = makeEvent({
      event_id:        uuid(),
      parent_event_id: prevId,
      vector_clock:    { [TEST.deviceA2]: clock },
      author_device_id:TEST.deviceA2,
      timestamp:       1747180800000 + i * 1000,
    })
    ev.signature = signEvent(ev, kA2.privateKey)
    onlineEvents.push(ev)
    prevId = ev.event_id
  }

  // Offline events produced during partition
  const offlineEvents = []
  for (let i = 0; i < 3; i++) {
    clock++
    const ev = makeEvent({
      event_id:        uuid(),
      parent_event_id: prevId,
      vector_clock:    { [TEST.deviceA2]: clock },
      author_device_id:TEST.deviceA2,
      timestamp:       1747180900000 + i * 500,
    })
    ev.signature = signEvent(ev, kA2.privateKey)
    offlineEvents.push(ev)
    prevId = ev.event_id
  }

  save('04-offline-replay', {
    fixture_id: '04-offline-replay',
    description: 'Events produced offline replay successfully on reconnect — no loss, vector clocks merge (Scenario 14)',
    expected: 'valid',
    log: onlineEvents,
    event: offlineEvents[0],
    offline_tail: offlineEvents.slice(1),
    note: 'offline_tail are validated in order after event. All must pass.',
  })
}

// ---------------------------------------------------------------------------
// negative-01 — tampered payload → INVALID_SIGNATURE
// ---------------------------------------------------------------------------
{
  const ev = makeEvent({
    event_id: uuid(),
    vector_clock: { [TEST.deviceA1]: 1 },
  })
  ev.signature = signEvent(ev, kA1.privateKey)
  // Flip a byte in the payload after signing
  const payloadBytes = Buffer.from(ev.payload, 'base64url')
  payloadBytes[0] ^= 0xff
  ev.payload = payloadBytes.toString('base64url')

  save('negative-01-tampered-payload', fixture(
    'negative-01-tampered-payload',
    'Payload byte flipped after signing — must return INVALID_SIGNATURE',
    'INVALID_SIGNATURE',
    [],
    ev,
  ))
}

// ---------------------------------------------------------------------------
// negative-02 — clock regression → CLOCK_REGRESSION
// ---------------------------------------------------------------------------
{
  const parent = makeEvent({
    event_id:    uuid(),
    vector_clock:{ [TEST.deviceA1]: 5 },
    timestamp:   1747180800000,
  })
  parent.signature = signEvent(parent, kA1.privateKey)

  // Child has same clock value (not strictly greater)
  const child = makeEvent({
    event_id:        uuid(),
    parent_event_id: parent.event_id,
    vector_clock:    { [TEST.deviceA1]: 5 },
    timestamp:       1747180801000,
  })
  child.signature = signEvent(child, kA1.privateKey)

  save('negative-02-clock-regression', fixture(
    'negative-02-clock-regression',
    'vector_clock[device] did not advance from parent — must return CLOCK_REGRESSION',
    'CLOCK_REGRESSION',
    [parent],
    child,
  ))
}

// ---------------------------------------------------------------------------
// negative-03 — missing parent → MISSING_PARENT
// ---------------------------------------------------------------------------
{
  const ev = makeEvent({
    event_id:        uuid(),
    parent_event_id: uuid(), // references an event not in log
    vector_clock:    { [TEST.deviceA1]: 2 },
    timestamp:       1747180801000,
  })
  ev.signature = signEvent(ev, kA1.privateKey)

  save('negative-03-missing-parent', fixture(
    'negative-03-missing-parent',
    'parent_event_id not null and not in log — must return MISSING_PARENT',
    'MISSING_PARENT',
    [],
    ev,
  ))
}

console.log('\nTest vectors written to', OUT_DIR)
console.log('Public keys written to', keysDir)
console.log('NOTE: keys are regenerated on each run. Commit them with the vectors.')
