'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

// ---------------------------------------------------------------------------
// Schema loader
// ---------------------------------------------------------------------------

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-event-payload'

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../schema/extensions/uacp-event-payload.schema.json'),
      'utf8',
    ),
  )
  ajv.addSchema(schema, SCHEMA_ID)
  return (doc) => ajv.validate(SCHEMA_ID, doc)
}

const validateSchema = loadValidator()

// ---------------------------------------------------------------------------
// Minimal deterministic CBOR encoder (same conventions as sync-event)
// ---------------------------------------------------------------------------

function cborUint(n) {
  if (n < 24) return Buffer.from([n])
  if (n < 0x100) return Buffer.from([0x18, n])
  if (n < 0x10000) return Buffer.from([0x19, n >> 8, n & 0xff])
  if (n < 0x100000000) {
    return Buffer.from([0x1a, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
  }
  const big = BigInt(n)
  const hi = Number((big >> 32n) & 0xffffffffn)
  const lo = Number(big & 0xffffffffn)
  return Buffer.from([
    0x1b,
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff,
  ])
}

function cborText(s) {
  const encoded = Buffer.from(s, 'utf8')
  const len = encoded.length
  let header
  if (len < 24) header = Buffer.from([0x60 | len])
  else if (len < 0x100) header = Buffer.from([0x78, len])
  else header = Buffer.from([0x79, len >> 8, len & 0xff])
  return Buffer.concat([header, encoded])
}

function cborNull() {
  return Buffer.from([0xf6])
}

function cborMap(pairs) {
  const count = pairs.length
  let header
  if (count < 24) header = Buffer.from([0xa0 | count])
  else header = Buffer.from([0xb8, count])
  const parts = [header]
  for (const [k, v] of pairs) {
    parts.push(cborText(k))
    parts.push(v)
  }
  return Buffer.concat(parts)
}

function encodeCanonicalAAD(aad) {
  return cborMap([
    ['conversation_id',  cborText(aad.conversation_id)],
    ['event_id',         cborText(aad.event_id)],
    ['parent_event_id',  aad.parent_event_id === null ? cborNull() : cborText(aad.parent_event_id)],
    ['scope_id',         cborText(aad.scope_id)],
    ['author_user_id',   cborText(aad.author_user_id)],
    ['author_device_id', cborText(aad.author_device_id)],
    ['timestamp',        cborUint(aad.timestamp)],
  ])
}

// ---------------------------------------------------------------------------
// base64url helpers (no padding)
// ---------------------------------------------------------------------------

function fromB64url(s) {
  const padded = s + '==='.slice(0, (4 - (s.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function toB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ---------------------------------------------------------------------------
// Payload validator (crypto + AAD check)
// ---------------------------------------------------------------------------

const ERROR_CODES = {
  DECRYPT_FAILED: 'DECRYPT_FAILED',
  AAD_MISMATCH: 'AAD_MISMATCH',
}

function validatePayload(payload, scopeKeyHex, eventMeta) {
  // AAD mismatch: compare payload.aad fields against event_meta before decryption
  if (eventMeta) {
    const fields = ['conversation_id', 'event_id', 'parent_event_id', 'scope_id', 'author_user_id', 'author_device_id', 'timestamp']
    for (const f of fields) {
      if (payload.aad[f] !== eventMeta[f]) {
        return { ok: false, error: ERROR_CODES.AAD_MISMATCH }
      }
    }
  }

  const key = Buffer.from(scopeKeyHex, 'hex')
  const nonce = fromB64url(payload.nonce)
  const ciphertextBuf = fromB64url(payload.ciphertext)
  const tagBuf = fromB64url(payload.tag)
  const aadBuf = encodeCanonicalAAD(payload.aad)

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAAD(aadBuf)
    decipher.setAuthTag(tagBuf)
    const plaintext = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()])
    return { ok: true, plaintext }
  } catch {
    return { ok: false, error: ERROR_CODES.DECRYPT_FAILED }
  }
}

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/event-payload')

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, name), 'utf8'))
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('uacp-event-payload schema validation', () => {
  it('valid payload passes schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    assert.ok(validateSchema(fixture.payload), 'expected valid payload to pass schema')
  })

  it('payload missing required field "nonce" fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = { ...fixture.payload }
    delete doc.nonce
    assert.ok(!validateSchema(doc), 'expected missing nonce to fail schema')
  })

  it('payload missing required field "tag" fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = { ...fixture.payload }
    delete doc.tag
    assert.ok(!validateSchema(doc), 'expected missing tag to fail schema')
  })

  it('payload missing required field "ciphertext" fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = { ...fixture.payload }
    delete doc.ciphertext
    assert.ok(!validateSchema(doc), 'expected missing ciphertext to fail schema')
  })

  it('payload missing required field "aad" fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = { ...fixture.payload }
    delete doc.aad
    assert.ok(!validateSchema(doc), 'expected missing aad to fail schema')
  })

  it('wrong algorithm value fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = { ...fixture.payload, algorithm: 'AES-128-GCM' }
    assert.ok(!validateSchema(doc), 'expected wrong algorithm to fail schema')
  })

  it('nonce with wrong length fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    // 8 bytes = 11 base64url chars (wrong)
    const doc = { ...fixture.payload, nonce: 'YWJjZGVmZ2g' }
    assert.ok(!validateSchema(doc), 'expected wrong nonce length to fail schema')
  })

  it('tag with wrong length fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    // 8 bytes = 11 base64url chars (should be 22)
    const doc = { ...fixture.payload, tag: 'YWJjZGVmZ2g' }
    assert.ok(!validateSchema(doc), 'expected wrong tag length to fail schema')
  })

  it('aad missing required UUID field fails schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const aad = { ...fixture.payload.aad }
    delete aad.scope_id
    const doc = { ...fixture.payload, aad }
    assert.ok(!validateSchema(doc), 'expected missing aad.scope_id to fail schema')
  })

  it('aad.parent_event_id null is valid', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    assert.strictEqual(fixture.payload.aad.parent_event_id, null)
    assert.ok(validateSchema(fixture.payload), 'null parent_event_id should be valid')
  })

  it('aad.parent_event_id UUID string is valid', () => {
    const fixture = loadFixture('02-two-members.json')
    assert.strictEqual(typeof fixture.payload.aad.parent_event_id, 'string')
    assert.ok(validateSchema(fixture.payload), 'UUID parent_event_id should be valid')
  })

  it('valid payload with kdf field passes schema', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const doc = {
      ...fixture.payload,
      kdf: {
        algorithm: 'argon2id',
        salt: 'YWJjZGVmZ2hpamtsbW5vcA',
        m: 262144,
        t: 3,
        p: 4,
      },
    }
    assert.ok(validateSchema(doc), 'payload with valid kdf should pass schema')
  })
})

// ---------------------------------------------------------------------------
// Argon2id KDF tests (skipped — no argon2 library)
// ---------------------------------------------------------------------------

describe('Argon2id KDF tests', () => {
  it('skipped: no argon2 library available', () => {
    try {
      require('argon2')
    } catch {
      console.log('Argon2id tests skipped: no argon2 library')
      return
    }
    assert.fail('argon2 library found — add KDF tests here')
  })
})

// ---------------------------------------------------------------------------
// Crypto scenarios
// ---------------------------------------------------------------------------

describe('test_scenario_1_encrypt_decrypt_roundtrip', () => {
  it('decrypts the valid round-trip fixture to the expected plaintext', () => {
    const fixture = loadFixture('01-valid-round-trip.json')
    const result = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(result.ok, `expected ok but got error: ${result.error}`)
    assert.strictEqual(result.plaintext.toString('hex'), fixture.plaintext_hex)
  })
})

describe('test_scenario_7_two_members_use_same_scope_key', () => {
  it('two members can each decrypt the same payload using the shared scope key', () => {
    const fixture = loadFixture('02-two-members.json')

    // Simulate member A decryption
    const resultA = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(resultA.ok, `member A decrypt failed: ${resultA.error}`)
    assert.strictEqual(resultA.plaintext.toString('hex'), fixture.plaintext_hex)

    // Simulate member B decryption (same key, same result)
    const resultB = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(resultB.ok, `member B decrypt failed: ${resultB.error}`)
    assert.strictEqual(resultB.plaintext.toString('hex'), fixture.plaintext_hex)

    // Both members are listed
    assert.ok(fixture.member_user_ids.includes(fixture.event_meta.author_user_id))
    assert.strictEqual(fixture.member_user_ids.length, 2)
  })
})

describe('test_scenario_14_offline_decrypt', () => {
  it('ciphertext created at T decrypts correctly at T+3600000ms without modification', () => {
    const fixture = loadFixture('03-offline-decrypt.json')
    assert.ok(fixture.decrypted_at_ms - fixture.created_at_ms === 3600000, 'offset should be 1 hour')

    // Decryption uses the original aad.timestamp — not the current time
    const result = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(result.ok, `offline decrypt failed: ${result.error}`)
    assert.strictEqual(result.plaintext.toString('hex'), fixture.plaintext_hex)
  })
})

describe('test_scenario_negative_tampered_ciphertext_fails_with_DECRYPT_FAILED', () => {
  it('one flipped byte in ciphertext results in DECRYPT_FAILED', () => {
    const fixture = loadFixture('negative-01-tampered-ciphertext.json')
    const result = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(!result.ok, 'expected decryption to fail')
    assert.strictEqual(result.error, ERROR_CODES.DECRYPT_FAILED)
  })
})

describe('test_scenario_negative_aad_mismatch_detected', () => {
  it('mismatched aad.scope_id is caught as AAD_MISMATCH before decryption', () => {
    const fixture = loadFixture('negative-02-aad-mismatch.json')
    // payload.aad.scope_id differs from event_meta.scope_id
    assert.notStrictEqual(
      fixture.payload.aad.scope_id,
      fixture.event_meta.scope_id,
      'fixture setup: scope_id should differ',
    )
    const result = validatePayload(fixture.payload, fixture.scope_key_hex, fixture.event_meta)
    assert.ok(!result.ok, 'expected validation to fail')
    assert.strictEqual(result.error, ERROR_CODES.AAD_MISMATCH)
  })

  it('when decrypting with wrong CBOR AAD GCM tag also fails', () => {
    const fixture = loadFixture('negative-02-aad-mismatch.json')
    // Attempt decrypt without event_meta check — the computed CBOR will be wrong and GCM fails
    const result = validatePayload(fixture.payload, fixture.scope_key_hex, null)
    assert.ok(!result.ok, 'expected GCM to fail with wrong AAD')
    assert.strictEqual(result.error, ERROR_CODES.DECRYPT_FAILED)
  })
})

// ---------------------------------------------------------------------------
// Validate all fixtures pass/fail schema as expected
// ---------------------------------------------------------------------------

describe('all event-payload fixtures pass schema where expected valid', () => {
  const validFixtures = ['01-valid-round-trip.json', '02-two-members.json', '03-offline-decrypt.json']
  for (const name of validFixtures) {
    it(`${name} payload passes schema`, () => {
      const fixture = loadFixture(name)
      assert.ok(validateSchema(fixture.payload), `${name} payload should pass schema`)
    })
  }

  const negativeFixtures = ['negative-01-tampered-ciphertext.json', 'negative-02-aad-mismatch.json']
  for (const name of negativeFixtures) {
    it(`${name} payload passes schema (structure is valid; crypto fails)`, () => {
      const fixture = loadFixture(name)
      // Schema validates structure only — tampered bytes and wrong scope_id are structurally valid
      assert.ok(validateSchema(fixture.payload), `${name} payload should pass schema structurally`)
    })
  }
})
