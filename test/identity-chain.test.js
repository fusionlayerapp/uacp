'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_DIR = path.join(REPO_ROOT, 'schema', 'extensions')
const VECTORS_DIR = path.join(REPO_ROOT, 'test-vectors', 'extensions', 'identity-chain')

// ---------------------------------------------------------------------------
// Schema validators
// ---------------------------------------------------------------------------
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))
}

const identityKeySchema = loadSchema('uacp-identity-key.schema.json')
const deviceRegSchema = loadSchema('uacp-device-registration.schema.json')
const deviceRetSchema = loadSchema('uacp-device-retirement.schema.json')

ajv.addSchema(identityKeySchema)
ajv.addSchema(deviceRegSchema)
ajv.addSchema(deviceRetSchema)

const validateIdentityKey = ajv.compile(identityKeySchema)
const validateDeviceReg = ajv.compile(deviceRegSchema)
const validateDeviceRet = ajv.compile(deviceRetSchema)

// ---------------------------------------------------------------------------
// CBOR helpers — identical to generate-identity-chain-vectors.js
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
// Chain validator
// ---------------------------------------------------------------------------
const ERROR = {
  DEVICE_NOT_REGISTERED:      'DEVICE_NOT_REGISTERED',
  DEVICE_RETIRED:             'DEVICE_RETIRED',
  IDENTITY_SIGNATURE_INVALID: 'IDENTITY_SIGNATURE_INVALID',
  INVALID_SIGNATURE:          'INVALID_SIGNATURE',
}

function rawPubFromBase64url(b64) {
  const raw = Buffer.from(b64, 'base64url')
  return crypto.createPublicKey({ key: raw, format: 'der', type: 'spki' })
}

function pubKeyFromRaw32(b64) {
  const raw = Buffer.from(b64, 'base64url')
  // Ed25519 SPKI prefix (12 bytes) + 32-byte key
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')
  const der = Buffer.concat([spkiPrefix, raw])
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
}

function validateChain(fixture) {
  const { identity_keys, registrations, retirements, event } = fixture

  const regByDevice = new Map(registrations.map(r => [r.device_id, r]))
  const retByDevice = new Map(retirements.map(r => [r.device_id, r]))
  const idByUser = new Map(identity_keys.map(k => [k.user_id, k]))

  // N-1 / DEVICE_NOT_REGISTERED
  const reg = regByDevice.get(event.author_device_id)
  if (!reg) return ERROR.DEVICE_NOT_REGISTERED

  // N-5 / DEVICE_RETIRED
  const ret = retByDevice.get(event.author_device_id)
  if (ret && event.timestamp > ret.retired_at) return ERROR.DEVICE_RETIRED

  // N-2 step 2: verify DeviceRegistration signature against identity key
  const idKey = idByUser.get(event.author_user_id)
  if (idKey) {
    const identityPub = pubKeyFromRaw32(idKey.public)
    const regMsg = registrationCbor(reg)
    const regSig = Buffer.from(reg.signature, 'base64url')
    if (!crypto.verify(null, regMsg, identityPub, regSig)) {
      return ERROR.IDENTITY_SIGNATURE_INVALID
    }
  }

  // N-2 step 1: verify event signature against device key
  const devicePub = pubKeyFromRaw32(reg.device_public_key)
  const evMsg = eventCbor(event)
  const evSig = Buffer.from(event.signature, 'base64url')
  if (!crypto.verify(null, evMsg, devicePub, evSig)) {
    return ERROR.INVALID_SIGNATURE
  }

  return 'valid'
}

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, `${name}.json`), 'utf8'))
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('uacp-identity-key schema', () => {
  it('validates a well-formed IdentityKey', () => {
    const valid = {
      user_id: '10000000-0000-4000-8000-000000000001',
      public:  'A'.repeat(43),
    }
    assert.ok(validateIdentityKey(valid), 'should be valid')
  })

  it('rejects missing user_id', () => {
    assert.ok(!validateIdentityKey({ public: 'A'.repeat(43) }), 'missing user_id should fail')
  })

  it('rejects missing public', () => {
    assert.ok(!validateIdentityKey({ user_id: '10000000-0000-4000-8000-000000000001' }), 'missing public should fail')
  })

  it('rejects public key of wrong length', () => {
    const bad = { user_id: '10000000-0000-4000-8000-000000000001', public: 'A'.repeat(42) }
    assert.ok(!validateIdentityKey(bad), '42-char public should fail')
    const bad2 = { user_id: '10000000-0000-4000-8000-000000000001', public: 'A'.repeat(44) }
    assert.ok(!validateIdentityKey(bad2), '44-char public should fail')
  })

  it('rejects malformed user_id', () => {
    const bad = { user_id: 'not-a-uuid', public: 'A'.repeat(43) }
    assert.ok(!validateIdentityKey(bad), 'non-UUID user_id should fail')
  })
})

describe('uacp-device-registration schema', () => {
  function validReg() {
    return {
      device_id:         '20000000-0000-4000-8000-000000000001',
      device_public_key: 'A'.repeat(43),
      registered_at:     1747180000000,
      device_label:      'Desktop',
      registered_by:     'B'.repeat(43),
      signature:         'C'.repeat(86),
    }
  }

  it('validates a well-formed DeviceRegistration', () => {
    assert.ok(validateDeviceReg(validReg()), 'should be valid')
  })

  it('rejects missing required fields', () => {
    const r = validReg()
    delete r.signature
    assert.ok(!validateDeviceReg(r), 'missing signature should fail')
  })

  it('rejects signature of wrong length', () => {
    assert.ok(!validateDeviceReg({ ...validReg(), signature: 'A'.repeat(85) }), '85-char sig should fail')
    assert.ok(!validateDeviceReg({ ...validReg(), signature: 'A'.repeat(87) }), '87-char sig should fail')
  })

  it('rejects device_public_key of wrong length', () => {
    assert.ok(!validateDeviceReg({ ...validReg(), device_public_key: 'A'.repeat(44) }), '44-char key should fail')
  })

  it('rejects empty device_label', () => {
    assert.ok(!validateDeviceReg({ ...validReg(), device_label: '' }), 'empty label should fail')
  })

  it('rejects device_label over 128 chars', () => {
    assert.ok(!validateDeviceReg({ ...validReg(), device_label: 'x'.repeat(129) }), '>128 char label should fail')
  })

  it('rejects malformed device_id', () => {
    assert.ok(!validateDeviceReg({ ...validReg(), device_id: 'not-a-uuid' }), 'non-UUID device_id should fail')
  })
})

describe('uacp-device-retirement schema', () => {
  function validRet() {
    return {
      device_id:  '20000000-0000-4000-8000-000000000001',
      retired_at: 1747180000000,
      retired_by: 'A'.repeat(43),
      signature:  'B'.repeat(86),
    }
  }

  it('validates a well-formed DeviceRetirement', () => {
    assert.ok(validateDeviceRet(validRet()), 'should be valid')
  })

  it('rejects missing required fields', () => {
    const r = validRet()
    delete r.retired_by
    assert.ok(!validateDeviceRet(r), 'missing retired_by should fail')
  })

  it('rejects signature of wrong length', () => {
    assert.ok(!validateDeviceRet({ ...validRet(), signature: 'A'.repeat(85) }), '85-char sig should fail')
  })

  it('rejects retired_by of wrong length', () => {
    assert.ok(!validateDeviceRet({ ...validRet(), retired_by: 'A'.repeat(42) }), '42-char retired_by should fail')
  })
})

// ---------------------------------------------------------------------------
// Scenario tests using fixtures
// ---------------------------------------------------------------------------

describe('uacp-identity-chain — Scenario 1: single device registers and verifies', () => {
  it('test_scenario_1_single_device_registers_and_verifies', () => {
    const f = loadFixture('01-single-device-valid')
    assert.ok(validateDeviceReg(f.registrations[0]), 'registration schema valid')
    assert.equal(validateChain(f), f.expected)
  })
})

describe('uacp-identity-chain — Scenario 3: five devices one identity', () => {
  it('test_scenario_3_five_devices_one_identity', () => {
    const f = loadFixture('02-five-devices-one-identity')
    assert.equal(f.registrations.length, 5, 'five registrations')
    for (const reg of f.registrations) {
      assert.ok(validateDeviceReg(reg), `registration ${reg.device_id} schema valid`)
    }
    assert.equal(validateChain(f), f.expected)
  })
})

describe('uacp-identity-chain — Scenario 7: two identities cross-chain', () => {
  it('test_scenario_7_two_identities_cross_chain', () => {
    const f = loadFixture('03-two-identity-chain')
    assert.equal(f.identity_keys.length, 2, 'two identity keys')
    assert.equal(f.registrations.length, 2, 'two registrations')
    assert.equal(validateChain(f), f.expected)
  })
})

describe('uacp-identity-chain — Scenario 10: family four identities', () => {
  it('test_scenario_10_family_four_identities', () => {
    const f = loadFixture('04-family-identities')
    assert.equal(f.identity_keys.length, 4, 'four identity keys')
    assert.equal(f.registrations.length, 4, 'four registrations')
    assert.equal(validateChain(f), f.expected)
  })
})

describe('uacp-identity-chain — negative cases', () => {
  it('test_scenario_negative_device_not_registered', () => {
    const f = loadFixture('negative-01-device-not-registered')
    assert.equal(validateChain(f), ERROR.DEVICE_NOT_REGISTERED)
  })

  it('test_scenario_negative_device_retired', () => {
    const f = loadFixture('negative-02-device-retired')
    assert.ok(validateDeviceRet(f.retirements[0]), 'retirement schema valid')
    assert.equal(validateChain(f), ERROR.DEVICE_RETIRED)
  })

  it('test_scenario_negative_identity_signature_invalid', () => {
    const f = loadFixture('negative-03-identity-signature-invalid')
    assert.equal(validateChain(f), ERROR.IDENTITY_SIGNATURE_INVALID)
  })
})
