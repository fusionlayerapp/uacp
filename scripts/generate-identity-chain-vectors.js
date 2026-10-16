'use strict'
// One-time generation script for uacp-identity-chain conformance test vectors.
// Run: node scripts/generate-identity-chain-vectors.js
// Outputs fixtures to test-vectors/extensions/identity-chain/
//
// Keys generated here are TEST-ONLY. Never reuse in production.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '..', 'test-vectors', 'extensions', 'identity-chain')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Minimal deterministic CBOR encoder (RFC 8949)
// Matches sync-event CBOR helpers exactly.
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

function cborUint(n) {
  return cborHead(0, n)
}

function cborBytes(b) {
  return Buffer.concat([cborHead(2, b.length), b])
}

const CBOR_NULL = Buffer.from([0xf6])

function cborMapOrdered(entries) {
  const header = cborHead(5, entries.length)
  return Buffer.concat([header, ...entries.map(([k, v]) => Buffer.concat([cborText(k), v]))])
}

function cborMapCanonical(entries) {
  const sorted = [...entries].sort(([ka], [kb]) => {
    const ba = Buffer.from(ka, 'utf8')
    const bb = Buffer.from(kb, 'utf8')
    if (ba.length !== bb.length) return ba.length - bb.length
    return ba.compare(bb)
  })
  return cborMapOrdered(sorted)
}

// ---------------------------------------------------------------------------
// CBOR encoding for signing (spec-defined field order)
// ---------------------------------------------------------------------------

function registrationCbor(reg) {
  return cborMapOrdered([
    ['device_id',         cborText(reg.device_id)],
    ['device_public_key', cborBytes(Buffer.from(reg.device_public_key, 'base64url'))],
    ['registered_at',     cborUint(reg.registered_at)],
    ['device_label',      cborText(reg.device_label)],
    ['registered_by',     cborBytes(Buffer.from(reg.registered_by, 'base64url'))],
  ])
}

function retirementCbor(ret) {
  return cborMapOrdered([
    ['device_id',  cborText(ret.device_id)],
    ['retired_at', cborUint(ret.retired_at)],
    ['retired_by', cborBytes(Buffer.from(ret.retired_by, 'base64url'))],
  ])
}

function eventCbor(ev) {
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
// Key helpers
// ---------------------------------------------------------------------------

function genEd25519() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).slice(-32)
  const pub64 = rawPub.toString('base64url')
  const spkiHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex')
  return { privateKey, publicKey, pub64, spkiHex }
}

function signBuf(buf, privateKey) {
  return Buffer.from(crypto.sign(null, buf, privateKey)).toString('base64url')
}

// ---------------------------------------------------------------------------
// Test UUIDs (deterministic per spec)
// ---------------------------------------------------------------------------

const TEST = {
  userA:   '10000000-0000-4000-8000-000000000001',
  userB:   '10000000-0000-4000-8000-000000000002',
  userC:   '10000000-0000-4000-8000-000000000003',
  userD:   '10000000-0000-4000-8000-000000000004',
  userE:   '10000000-0000-4000-8000-000000000005',
  userF:   '10000000-0000-4000-8000-000000000006',

  deviceA1: '20000000-0000-4000-8000-000000000001',
  deviceA2: '20000000-0000-4000-8000-000000000002',
  deviceB1: '20000000-0000-4000-8000-000000000003',
  deviceA3: '20000000-0000-4000-8000-000000000004',
  deviceA4: '20000000-0000-4000-8000-000000000005',
  deviceA5: '20000000-0000-4000-8000-000000000006',
  deviceC1: '20000000-0000-4000-8000-000000000007',
  deviceD1: '20000000-0000-4000-8000-000000000008',
  deviceE1: '20000000-0000-4000-8000-000000000009',
  deviceF1: '20000000-0000-4000-8000-00000000000a',

  conv1:  '30000000-0000-4000-8000-000000000001',
  scope1: '40000000-0000-4000-8000-000000000001',
}

// ---------------------------------------------------------------------------
// Generate key pairs
// ---------------------------------------------------------------------------

const keysDir = path.join(OUT_DIR, 'keys')
fs.mkdirSync(keysDir, { recursive: true })

// Identity keys
const idA = genEd25519()
const idB = genEd25519()
const idC = genEd25519()
const idD = genEd25519()
const idE = genEd25519()
const idF = genEd25519()

fs.writeFileSync(path.join(keysDir, 'identity-a.pub.spki.hex'), idA.spkiHex)
fs.writeFileSync(path.join(keysDir, 'identity-b.pub.spki.hex'), idB.spkiHex)
fs.writeFileSync(path.join(keysDir, 'identity-c.pub.spki.hex'), idC.spkiHex)
fs.writeFileSync(path.join(keysDir, 'identity-d.pub.spki.hex'), idD.spkiHex)
fs.writeFileSync(path.join(keysDir, 'identity-e.pub.spki.hex'), idE.spkiHex)
fs.writeFileSync(path.join(keysDir, 'identity-f.pub.spki.hex'), idF.spkiHex)

// Device keys
const devA1 = genEd25519()
const devA2 = genEd25519()
const devA3 = genEd25519()
const devA4 = genEd25519()
const devA5 = genEd25519()
const devB1 = genEd25519()
const devC1 = genEd25519()
const devD1 = genEd25519()
const devE1 = genEd25519()
const devF1 = genEd25519()

fs.writeFileSync(path.join(keysDir, 'device-a1-pub.spki.hex'), devA1.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-a2-pub.spki.hex'), devA2.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-a3-pub.spki.hex'), devA3.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-a4-pub.spki.hex'), devA4.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-a5-pub.spki.hex'), devA5.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-b1-pub.spki.hex'), devB1.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-c1-pub.spki.hex'), devC1.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-d1-pub.spki.hex'), devD1.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-e1-pub.spki.hex'), devE1.spkiHex)
fs.writeFileSync(path.join(keysDir, 'device-f1-pub.spki.hex'), devF1.spkiHex)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistration(deviceId, deviceKey, label, userId, identityKey, ts) {
  const reg = {
    device_id:         deviceId,
    device_public_key: deviceKey.pub64,
    registered_at:     ts,
    device_label:      label,
    registered_by:     identityKey.pub64,
  }
  reg.signature = signBuf(registrationCbor(reg), identityKey.privateKey)
  return reg
}

function makeRetirement(deviceId, userId, identityKey, ts) {
  const ret = {
    device_id:  deviceId,
    retired_at: ts,
    retired_by: identityKey.pub64,
  }
  ret.signature = signBuf(retirementCbor(ret), identityKey.privateKey)
  return ret
}

function makeEvent(overrides, deviceKey) {
  const base = {
    conversation_id:  TEST.conv1,
    event_id:         crypto.randomUUID(),
    parent_event_id:  null,
    vector_clock:     {},
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1747180800000,
    scope_id:         TEST.scope1,
    payload:          Buffer.from('test-payload').toString('base64url'),
  }
  const ev = { ...base, ...overrides }
  ev.vector_clock = { ...ev.vector_clock }
  ev.signature = signBuf(eventCbor(ev), deviceKey.privateKey)
  return ev
}

function save(name, obj) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(obj, null, 2) + '\n')
  console.log('wrote', name)
}

// ---------------------------------------------------------------------------
// 01 — Scenario 1: single device registers, signs event, verifies
// ---------------------------------------------------------------------------
{
  const reg = makeRegistration(TEST.deviceA1, devA1, 'Desktop', TEST.userA, idA, 1747180000000)
  const ev = makeEvent({
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    vector_clock:     { [TEST.deviceA1]: 1 },
  }, devA1)

  save('01-single-device-valid', {
    fixture_id:   '01-single-device-valid',
    description:  'Single device registers and signs event — chain verifies (Scenario 1)',
    expected:     'valid',
    identity_keys: [{ user_id: TEST.userA, public: idA.pub64 }],
    registrations: [reg],
    retirements:   [],
    event:         ev,
  })
}

// ---------------------------------------------------------------------------
// 02 — Scenario 3: five devices one identity, event from device 3
// ---------------------------------------------------------------------------
{
  const devices = [
    { id: TEST.deviceA1, key: devA1, label: 'Desktop' },
    { id: TEST.deviceA2, key: devA2, label: 'Laptop' },
    { id: TEST.deviceA3, key: devA3, label: 'Phone' },
    { id: TEST.deviceA4, key: devA4, label: 'Tablet' },
    { id: TEST.deviceA5, key: devA5, label: 'Watch' },
  ]
  const registrations = devices.map((d, i) =>
    makeRegistration(d.id, d.key, d.label, TEST.userA, idA, 1747180000000 + i * 1000)
  )

  const ev = makeEvent({
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA3,
    vector_clock:     { [TEST.deviceA3]: 1 },
  }, devA3)

  save('02-five-devices-one-identity', {
    fixture_id:    '02-five-devices-one-identity',
    description:   'Five devices share one identity key; event from device 3 verifies (Scenario 3)',
    expected:      'valid',
    identity_keys:  [{ user_id: TEST.userA, public: idA.pub64 }],
    registrations,
    retirements:    [],
    event:          ev,
  })
}

// ---------------------------------------------------------------------------
// 03 — Scenario 7: two identities, each device chains to its own identity
// ---------------------------------------------------------------------------
{
  const regA = makeRegistration(TEST.deviceA1, devA1, 'Desktop A', TEST.userA, idA, 1747180000000)
  const regB = makeRegistration(TEST.deviceB1, devB1, 'Desktop B', TEST.userB, idB, 1747180001000)

  const ev = makeEvent({
    author_user_id:   TEST.userB,
    author_device_id: TEST.deviceB1,
    vector_clock:     { [TEST.deviceB1]: 1 },
  }, devB1)

  save('03-two-identity-chain', {
    fixture_id:    '03-two-identity-chain',
    description:   'Two identities; event from identity B device chains to identity B key (Scenario 7)',
    expected:      'valid',
    identity_keys:  [
      { user_id: TEST.userA, public: idA.pub64 },
      { user_id: TEST.userB, public: idB.pub64 },
    ],
    registrations: [regA, regB],
    retirements:   [],
    event:         ev,
  })
}

// ---------------------------------------------------------------------------
// 04 — Scenario 10: four identities (family), event from child device
// ---------------------------------------------------------------------------
{
  const regC = makeRegistration(TEST.deviceC1, devC1, 'Parent A Desktop', TEST.userC, idC, 1747180000000)
  const regD = makeRegistration(TEST.deviceD1, devD1, 'Parent B Desktop', TEST.userD, idD, 1747180001000)
  const regE = makeRegistration(TEST.deviceE1, devE1, 'Child A Phone',    TEST.userE, idE, 1747180002000)
  const regF = makeRegistration(TEST.deviceF1, devF1, 'Child B Phone',    TEST.userF, idF, 1747180003000)

  const ev = makeEvent({
    author_user_id:   TEST.userE,
    author_device_id: TEST.deviceE1,
    vector_clock:     { [TEST.deviceE1]: 1 },
  }, devE1)

  save('04-family-identities', {
    fixture_id:    '04-family-identities',
    description:   'Four identities (parentA, parentB, childA, childB); event from childA device verifies (Scenario 10)',
    expected:      'valid',
    identity_keys:  [
      { user_id: TEST.userC, public: idC.pub64 },
      { user_id: TEST.userD, public: idD.pub64 },
      { user_id: TEST.userE, public: idE.pub64 },
      { user_id: TEST.userF, public: idF.pub64 },
    ],
    registrations: [regC, regD, regE, regF],
    retirements:   [],
    event:         ev,
  })
}

// ---------------------------------------------------------------------------
// negative-01 — device not registered
// ---------------------------------------------------------------------------
{
  const ev = makeEvent({
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    vector_clock:     { [TEST.deviceA1]: 1 },
  }, devA1)

  save('negative-01-device-not-registered', {
    fixture_id:    'negative-01-device-not-registered',
    description:   'Event references device_id with no DeviceRegistration — must return DEVICE_NOT_REGISTERED',
    expected:      'DEVICE_NOT_REGISTERED',
    identity_keys:  [{ user_id: TEST.userA, public: idA.pub64 }],
    registrations: [],
    retirements:   [],
    event:         ev,
  })
}

// ---------------------------------------------------------------------------
// negative-02 — device retired before event timestamp
// ---------------------------------------------------------------------------
{
  const retiredAt = 1747180000000
  const eventTs = 1747180001000

  const reg = makeRegistration(TEST.deviceA1, devA1, 'Desktop', TEST.userA, idA, 1747179000000)
  const ret = makeRetirement(TEST.deviceA1, TEST.userA, idA, retiredAt)

  const ev = makeEvent({
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    vector_clock:     { [TEST.deviceA1]: 1 },
    timestamp:        eventTs,
  }, devA1)

  save('negative-02-device-retired', {
    fixture_id:    'negative-02-device-retired',
    description:   'Event timestamp after device retirement — must return DEVICE_RETIRED',
    expected:      'DEVICE_RETIRED',
    identity_keys:  [{ user_id: TEST.userA, public: idA.pub64 }],
    registrations: [reg],
    retirements:   [ret],
    event:         ev,
  })
}

// ---------------------------------------------------------------------------
// negative-03 — DeviceRegistration signature tampered
// ---------------------------------------------------------------------------
{
  const reg = makeRegistration(TEST.deviceA1, devA1, 'Desktop', TEST.userA, idA, 1747180000000)

  // Flip first byte of signature to invalidate it
  const sigBytes = Buffer.from(reg.signature, 'base64url')
  sigBytes[0] ^= 0xff
  const tamperedReg = { ...reg, signature: sigBytes.toString('base64url') }

  const ev = makeEvent({
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    vector_clock:     { [TEST.deviceA1]: 1 },
  }, devA1)

  save('negative-03-identity-signature-invalid', {
    fixture_id:    'negative-03-identity-signature-invalid',
    description:   'DeviceRegistration signature is tampered — must return IDENTITY_SIGNATURE_INVALID',
    expected:      'IDENTITY_SIGNATURE_INVALID',
    identity_keys:  [{ user_id: TEST.userA, public: idA.pub64 }],
    registrations: [tamperedReg],
    retirements:   [],
    event:         ev,
  })
}

console.log('\nTest vectors written to', OUT_DIR)
console.log('Public keys written to', keysDir)
console.log('NOTE: keys are regenerated on each run. Commit them together with the vectors.')
