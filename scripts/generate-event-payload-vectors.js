#!/usr/bin/env node
'use strict'
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

// ---------------------------------------------------------------------------
// Minimal deterministic CBOR encoder (subset needed for CanonicalAAD)
// ---------------------------------------------------------------------------

function cborUint(n) {
  if (n < 24) return Buffer.from([n])
  if (n < 0x100) return Buffer.from([0x18, n])
  if (n < 0x10000) return Buffer.from([0x19, n >> 8, n & 0xff])
  if (n < 0x100000000) {
    return Buffer.from([0x1a, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
  }
  // For uint64 values beyond 32-bit range we use BigInt
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

function toB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(s) {
  const padded = s + '==='.slice(0, (4 - (s.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

function encrypt(key, nonce, plaintext, aadBuf) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(aadBuf)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: ct, tag }
}

function decrypt(key, nonce, ciphertextBuf, tagBuf, aadBuf) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAAD(aadBuf)
  decipher.setAuthTag(tagBuf)
  return Buffer.concat([decipher.update(ciphertextBuf), decipher.final()])
}

// ---------------------------------------------------------------------------
// Test UUIDs
// ---------------------------------------------------------------------------

const TEST = {
  userA:   '10000000-0000-4000-8000-000000000001',
  userB:   '10000000-0000-4000-8000-000000000002',
  deviceA1:'20000000-0000-4000-8000-000000000001',
  deviceB1:'20000000-0000-4000-8000-000000000003',
  conv1:   '30000000-0000-4000-8000-000000000001',
  scope1:  '40000000-0000-4000-8000-000000000001',
  scope2:  '40000000-0000-4000-8000-000000000002',
}

const EVENT_IDS = {
  e1: 'e0000000-0000-4000-8000-000000000001',
  e2: 'e0000000-0000-4000-8000-000000000002',
  e3: 'e0000000-0000-4000-8000-000000000003',
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makePayload(key, aad, plaintext) {
  const nonceBuf = crypto.randomBytes(12)
  const aadBuf = encodeCanonicalAAD(aad)
  const { ciphertext, tag } = encrypt(key, nonceBuf, plaintext, aadBuf)
  return {
    algorithm: 'AES-256-GCM',
    nonce: toB64url(nonceBuf),
    ciphertext: toB64url(ciphertext),
    tag: toB64url(tag),
    aad,
  }
}

// ---------------------------------------------------------------------------
// Generate fixtures
// ---------------------------------------------------------------------------

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/event-payload')
fs.mkdirSync(OUT_DIR, { recursive: true })

function write(filename, obj) {
  const p = path.join(OUT_DIR, filename)
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
  console.log('wrote', filename)
}

// Fixture 01 — valid round-trip (Scenario 1)
{
  const scopeKey = crypto.randomBytes(32)
  const plaintext = Buffer.from('hello from scenario 1', 'utf8')
  const aad = {
    conversation_id:  TEST.conv1,
    event_id:         EVENT_IDS.e1,
    parent_event_id:  null,
    scope_id:         TEST.scope1,
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1700000000000,
  }
  const payload = makePayload(scopeKey, aad, plaintext)
  const fixture = {
    fixture_id: '01-valid-round-trip',
    description: 'Scenario 1: encrypt/decrypt round-trip with a random scope key.',
    expected: 'valid',
    scope_key_hex: scopeKey.toString('hex'),
    plaintext_hex: plaintext.toString('hex'),
    event_meta: { ...aad },
    payload,
  }
  write('01-valid-round-trip.json', fixture)

  // Verify round-trip before writing
  const aadBuf = encodeCanonicalAAD(payload.aad)
  const pt = decrypt(
    scopeKey,
    fromB64url(payload.nonce),
    fromB64url(payload.ciphertext),
    fromB64url(payload.tag),
    aadBuf,
  )
  if (pt.toString('utf8') !== 'hello from scenario 1') {
    throw new Error('fixture 01 round-trip self-check failed')
  }
}

// Fixture 02 — two members decrypt same payload (Scenario 7)
{
  const scopeKey = crypto.randomBytes(32)
  const plaintext = Buffer.from('shared message for two members', 'utf8')
  const aad = {
    conversation_id:  TEST.conv1,
    event_id:         EVENT_IDS.e2,
    parent_event_id:  EVENT_IDS.e1,
    scope_id:         TEST.scope1,
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1700000001000,
  }
  const payload = makePayload(scopeKey, aad, plaintext)
  const fixture = {
    fixture_id: '02-two-members',
    description: 'Scenario 7: same EncryptedPayload decrypted independently by two members sharing the same scope key. Both userA and userB hold scope_key_hex and can decrypt.',
    expected: 'valid',
    scope_key_hex: scopeKey.toString('hex'),
    plaintext_hex: plaintext.toString('hex'),
    member_user_ids: [TEST.userA, TEST.userB],
    event_meta: { ...aad },
    payload,
  }
  write('02-two-members.json', fixture)
}

// Fixture 03 — offline decrypt (Scenario 14)
{
  const scopeKey = crypto.randomBytes(32)
  const plaintext = Buffer.from('queued offline message', 'utf8')
  const createdAt = 1700000000000
  const aad = {
    conversation_id:  TEST.conv1,
    event_id:         EVENT_IDS.e3,
    parent_event_id:  EVENT_IDS.e2,
    scope_id:         TEST.scope1,
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        createdAt,
  }
  const payload = makePayload(scopeKey, aad, plaintext)
  const fixture = {
    fixture_id: '03-offline-decrypt',
    description: 'Scenario 14: ciphertext created at timestamp T, decrypted at T+3600000ms. Decryption is timestamp-independent; aad.timestamp is the original creation time.',
    expected: 'valid',
    scope_key_hex: scopeKey.toString('hex'),
    plaintext_hex: plaintext.toString('hex'),
    created_at_ms: createdAt,
    decrypted_at_ms: createdAt + 3600000,
    event_meta: { ...aad },
    payload,
  }
  write('03-offline-decrypt.json', fixture)
}

// Negative 01 — tampered ciphertext
{
  const scopeKey = crypto.randomBytes(32)
  const plaintext = Buffer.from('tamper me', 'utf8')
  const aad = {
    conversation_id:  TEST.conv1,
    event_id:         'f0000000-0000-4000-8000-000000000001',
    parent_event_id:  null,
    scope_id:         TEST.scope1,
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1700000002000,
  }
  const payload = makePayload(scopeKey, aad, plaintext)

  // Flip one byte in ciphertext
  const ctBuf = fromB64url(payload.ciphertext)
  ctBuf[0] ^= 0x01
  payload.ciphertext = toB64url(ctBuf)

  const fixture = {
    fixture_id: 'negative-01-tampered-ciphertext',
    description: 'Negative: one byte flipped in ciphertext — GCM tag verification must fail with DECRYPT_FAILED.',
    expected: 'DECRYPT_FAILED',
    scope_key_hex: scopeKey.toString('hex'),
    plaintext_hex: plaintext.toString('hex'),
    event_meta: { ...aad },
    payload,
  }
  write('negative-01-tampered-ciphertext.json', fixture)
}

// Negative 02 — AAD mismatch
{
  const scopeKey = crypto.randomBytes(32)
  const plaintext = Buffer.from('aad mismatch test', 'utf8')
  const correctScopeId = TEST.scope1
  const wrongScopeId   = TEST.scope2
  const correctAad = {
    conversation_id:  TEST.conv1,
    event_id:         'f0000000-0000-4000-8000-000000000002',
    parent_event_id:  null,
    scope_id:         correctScopeId,
    author_user_id:   TEST.userA,
    author_device_id: TEST.deviceA1,
    timestamp:        1700000003000,
  }

  // Encrypt with the correct AAD
  const nonceBuf = crypto.randomBytes(12)
  const aadBuf = encodeCanonicalAAD(correctAad)
  const { ciphertext, tag } = encrypt(scopeKey, nonceBuf, plaintext, aadBuf)

  // Store wrong scope_id in the payload aad so receiver computes different CBOR
  const tamperedAad = { ...correctAad, scope_id: wrongScopeId }

  const payload = {
    algorithm:  'AES-256-GCM',
    nonce:      toB64url(nonceBuf),
    ciphertext: toB64url(ciphertext),
    tag:        toB64url(tag),
    aad:        tamperedAad,
  }

  const fixture = {
    fixture_id: 'negative-02-aad-mismatch',
    description: 'Negative: payload.aad.scope_id is wrong. Receiver detects AAD_MISMATCH by comparing against event_meta before decryption, or GCM tag fails when wrong CBOR AAD is used.',
    expected: 'AAD_MISMATCH',
    scope_key_hex: scopeKey.toString('hex'),
    plaintext_hex: plaintext.toString('hex'),
    event_meta: { ...correctAad },
    payload,
  }
  write('negative-02-aad-mismatch.json', fixture)
}

console.log('All fixtures generated in', OUT_DIR)
