#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const T = {
  scopeA: '40000000-0000-4000-8000-000000000001',
  scopeB: '40000000-0000-4000-8000-000000000002',
  evt1:   '50000000-0000-4000-8000-000000000001',
  evt2:   '50000000-0000-4000-8000-000000000002',
}
const SCOPE_KEY_BYTES = 32

// ---- CBOR encoder (minimal, deterministic, definite-length) ----

function cborUint(n) {
  if (n < 24) return Buffer.from([n])
  if (n < 0x100) return Buffer.from([0x18, n])
  if (n < 0x10000) return Buffer.from([0x19, n >> 8, n & 0xff])
  if (n < 0x100000000) {
    const b = Buffer.alloc(5)
    b[0] = 0x1a
    b.writeUInt32BE(n, 1)
    return b
  }
  const b = Buffer.alloc(9)
  b[0] = 0x1b
  b.writeBigUInt64BE(BigInt(n), 1)
  return b
}

function cborBytes(buf) {
  const head = cborUint(buf.length)
  head[0] |= 0x40
  return Buffer.concat([head, buf])
}

function cborText(str) {
  const encoded = Buffer.from(str, 'utf8')
  const head = cborUint(encoded.length)
  head[0] |= 0x60
  return Buffer.concat([head, encoded])
}

function cborArray(items) {
  const head = cborUint(items.length)
  head[0] |= 0x80
  return Buffer.concat([head, ...items])
}

function cborMap(pairs) {
  const head = cborUint(pairs.length)
  head[0] |= 0xa0
  const parts = pairs.flatMap(([k, v]) => [cborText(k), v])
  return Buffer.concat([head, ...parts])
}

// ---- CBOR encode MemberSet (excluding signature) ----

function encodeMemberForCbor(member) {
  const keyBytes = Buffer.from(member.identity_public_key, 'base64url')
  return cborMap([
    ['identity_public_key', cborBytes(keyBytes)],
    ['role', cborText(member.role)],
    ['joined_at', cborUint(member.joined_at)],
    ['joined_via_event_id', cborText(member.joined_via_event_id)],
  ])
}

function encodeEntryForCbor(entry) {
  return cborMap([
    ['recipient_identity_key', cborBytes(Buffer.from(entry.recipient_identity_key, 'base64url'))],
    ['ciphertext', cborBytes(Buffer.from(entry.ciphertext, 'base64url'))],
    ['nonce', cborBytes(Buffer.from(entry.nonce, 'base64url'))],
  ])
}

function encodeMemberSetForSigning(ms) {
  return cborMap([
    ['scope_id', cborText(ms.scope_id)],
    ['members', cborArray(ms.members.map(encodeMemberForCbor))],
    ['scope_key', cborMap([
      ['algorithm', cborText(ms.scope_key.algorithm)],
      ['encrypted_key_per_member', cborArray(ms.scope_key.encrypted_key_per_member.map(encodeEntryForCbor))],
    ])],
    ['version', cborUint(ms.version)],
  ])
}

// ---- Crypto helpers ----

function rawPub(keyObj) {
  const spki = keyObj.export({ type: 'spki', format: 'der' })
  return spki.slice(-32)
}

function rawPriv(keyObj) {
  // PKCS8 for X25519: last 32 bytes are key material (preceded by 2-byte header + 32-byte key)
  // Structure: PKCS8 header (16 bytes) + OCTET STRING (2 bytes) + raw (32 bytes)
  const pkcs8 = keyObj.export({ type: 'pkcs8', format: 'der' })
  return pkcs8.slice(-32)
}

function encryptScopeKey(scopeKey, recipientX25519Pub) {
  const ephemeral = crypto.generateKeyPairSync('x25519')
  const ephemeralPubRaw = rawPub(ephemeral.publicKey)

  // Import recipient public key from raw bytes
  const recipientKeyObj = crypto.createPublicKey({
    key: Buffer.concat([
      // SPKI header for X25519
      Buffer.from('302a300506032b656e032100', 'hex'),
      recipientX25519Pub,
    ]),
    format: 'der',
    type: 'spki',
  })

  const shared = crypto.diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: recipientKeyObj,
  })

  // HKDF-SHA256 to derive AES-256 key
  const aesKey = Buffer.alloc(32)
  crypto.hkdfSync('sha256', shared, Buffer.alloc(0), 'uacp-scope-key-v1', 32)
  const derived = crypto.hkdfSync('sha256', shared, Buffer.alloc(0), 'uacp-scope-key-v1', 32)
  // hkdfSync returns ArrayBuffer
  const aesKeyBuf = Buffer.from(derived)

  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKeyBuf, nonce)
  const ct = Buffer.concat([cipher.update(scopeKey), cipher.final()])
  const tag = cipher.getAuthTag()

  // ciphertext = ephemeral_pub(32) + gcm_ct(32) + auth_tag(16) = 80 bytes
  const fullCiphertext = Buffer.concat([ephemeralPubRaw, ct, tag])

  return {
    ciphertext: fullCiphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
  }
}

function signMemberSet(ms, adminEdPrivKey) {
  const cbor = encodeMemberSetForSigning(ms)
  const sig = crypto.sign(null, cbor, adminEdPrivKey)
  return sig.toString('base64url')
}

function makeMemberSet({ scopeId, members, scopeKey, version, adminEdPrivKey }) {
  const entries = members.map(m => {
    const enc = encryptScopeKey(scopeKey, m.x25519PubRaw)
    return {
      recipient_identity_key: m.x25519PubRaw.toString('base64url'),
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
    }
  })

  const ms = {
    scope_id: scopeId,
    members: members.map(m => ({
      identity_public_key: m.identityPubBase64url,
      role: m.role,
      joined_at: m.joined_at,
      joined_via_event_id: m.joined_via_event_id,
    })),
    scope_key: {
      algorithm: 'X25519-AES256GCM',
      encrypted_key_per_member: entries,
    },
    version,
  }

  ms.signature = signMemberSet(ms, adminEdPrivKey)
  return ms
}

// ---- Key generation helpers ----

function genIdentity() {
  const ed = crypto.generateKeyPairSync('ed25519')
  const x = crypto.generateKeyPairSync('x25519')
  return {
    edPub: ed.publicKey,
    edPriv: ed.privateKey,
    xPub: x.publicKey,
    xPriv: x.privateKey,
    identityPubBase64url: rawPub(ed.publicKey).toString('base64url'),
    x25519PubRaw: rawPub(x.publicKey),
  }
}

// ---- Output paths ----

const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/member-set')
const KEYS_DIR = path.join(VECTORS_DIR, 'keys')
fs.mkdirSync(VECTORS_DIR, { recursive: true })
fs.mkdirSync(KEYS_DIR, { recursive: true })

function writeVector(name, data) {
  fs.writeFileSync(path.join(VECTORS_DIR, name), JSON.stringify(data, null, 2))
  console.log(`wrote ${name}`)
}

function saveKeys(prefix, identity) {
  const xPrivPkcs8 = identity.xPriv.export({ type: 'pkcs8', format: 'der' })
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-x25519-priv.pkcs8.hex`), xPrivPkcs8.toString('hex'))

  const xPubSpki = identity.xPub.export({ type: 'spki', format: 'der' })
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-x25519-pub.spki.hex`), xPubSpki.toString('hex'))

  const edPubSpki = identity.edPub.export({ type: 'spki', format: 'der' })
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-ed25519-pub.spki.hex`), edPubSpki.toString('hex'))

  const edPrivPkcs8 = identity.edPriv.export({ type: 'pkcs8', format: 'der' })
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-ed25519-priv.pkcs8.hex`), edPrivPkcs8.toString('hex'))
}

// ---- Generate fixtures ----

// Fixture 01: two-member-scope (Scenario 7)
{
  const alice = genIdentity()
  const bob = genIdentity()
  saveKeys('01-alice', alice)
  saveKeys('01-bob', bob)

  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)
  fs.writeFileSync(path.join(KEYS_DIR, '01-scope-key.hex'), scopeKey.toString('hex'))

  const members = [
    { ...alice, role: 'owner', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
    { ...bob, role: 'member', joined_at: 1700000001000, joined_via_event_id: T.evt2 },
  ]

  const ms = makeMemberSet({
    scopeId: T.scopeA,
    members,
    scopeKey,
    version: 0,
    adminEdPrivKey: alice.edPriv,
  })

  writeVector('01-two-member-scope.json', {
    fixture_id: 'member-set/01-two-member-scope',
    description: 'Scenario 7: Two members in a scope. Both have encrypted key entries. Both can decrypt.',
    expected: 'valid',
    member_set: ms,
  })
}

// Fixture 02: five-member-team (Scenario 8)
{
  const admin = genIdentity()
  const m1 = genIdentity()
  const m2 = genIdentity()
  const m3 = genIdentity()
  const m4 = genIdentity()
  saveKeys('02-admin', admin)
  saveKeys('02-m1', m1)
  saveKeys('02-m2', m2)
  saveKeys('02-m3', m3)
  saveKeys('02-m4', m4)

  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)
  fs.writeFileSync(path.join(KEYS_DIR, '02-scope-key.hex'), scopeKey.toString('hex'))

  const members = [
    { ...admin, role: 'admin', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
    { ...m1, role: 'member', joined_at: 1700000001000, joined_via_event_id: T.evt1 },
    { ...m2, role: 'member', joined_at: 1700000002000, joined_via_event_id: T.evt1 },
    { ...m3, role: 'member', joined_at: 1700000003000, joined_via_event_id: T.evt1 },
    { ...m4, role: 'member', joined_at: 1700000004000, joined_via_event_id: T.evt1 },
  ]

  const ms = makeMemberSet({
    scopeId: T.scopeA,
    members,
    scopeKey,
    version: 0,
    adminEdPrivKey: admin.edPriv,
  })

  writeVector('02-five-member-team.json', {
    fixture_id: 'member-set/02-five-member-team',
    description: 'Scenario 8: Five-member team scope with one admin and four members.',
    expected: 'valid',
    member_set: ms,
  })
}

// Fixture 03: team-version-increment (Scenario 8 — add member)
{
  const admin = genIdentity()
  const m1 = genIdentity()
  const m2 = genIdentity()
  const m3 = genIdentity()
  const m4 = genIdentity()
  const m5 = genIdentity()
  saveKeys('03-admin', admin)
  saveKeys('03-m1', m1)
  saveKeys('03-m2', m2)
  saveKeys('03-m3', m3)
  saveKeys('03-m4', m4)
  saveKeys('03-m5', m5)

  const scopeKey1 = crypto.randomBytes(SCOPE_KEY_BYTES)
  const scopeKey2 = crypto.randomBytes(SCOPE_KEY_BYTES)
  fs.writeFileSync(path.join(KEYS_DIR, '03-scope-key-v1.hex'), scopeKey1.toString('hex'))
  fs.writeFileSync(path.join(KEYS_DIR, '03-scope-key-v2.hex'), scopeKey2.toString('hex'))

  const baseMembers = [
    { ...admin, role: 'admin', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
    { ...m1, role: 'member', joined_at: 1700000001000, joined_via_event_id: T.evt1 },
    { ...m2, role: 'member', joined_at: 1700000002000, joined_via_event_id: T.evt1 },
    { ...m3, role: 'member', joined_at: 1700000003000, joined_via_event_id: T.evt1 },
    { ...m4, role: 'member', joined_at: 1700000004000, joined_via_event_id: T.evt1 },
  ]

  const msV1 = makeMemberSet({
    scopeId: T.scopeB,
    members: baseMembers,
    scopeKey: scopeKey1,
    version: 1,
    adminEdPrivKey: admin.edPriv,
  })

  const msV2 = makeMemberSet({
    scopeId: T.scopeB,
    members: [...baseMembers, { ...m5, role: 'member', joined_at: 1700000005000, joined_via_event_id: T.evt2 }],
    scopeKey: scopeKey2,
    version: 2,
    adminEdPrivKey: admin.edPriv,
  })

  writeVector('03-team-version-increment.json', {
    fixture_id: 'member-set/03-team-version-increment',
    description: 'Scenario 8 — add member: Version 1 (5 members) followed by Version 2 (6 members). Scope key rotated on add.',
    expected: 'valid',
    member_sets: [msV1, msV2],
  })
}

// Fixture 04: family-parent-child (Scenario 10)
{
  const parent = genIdentity()
  const child = genIdentity()
  saveKeys('04-parent', parent)
  saveKeys('04-child', child)

  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)
  fs.writeFileSync(path.join(KEYS_DIR, '04-scope-key.hex'), scopeKey.toString('hex'))

  const members = [
    { ...parent, role: 'parent', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
    { ...child, role: 'child', joined_at: 1700000001000, joined_via_event_id: T.evt1 },
  ]

  const ms = makeMemberSet({
    scopeId: T.scopeA,
    members,
    scopeKey,
    version: 0,
    adminEdPrivKey: parent.edPriv,
  })

  writeVector('04-family-parent-child.json', {
    fixture_id: 'member-set/04-family-parent-child',
    description: 'Scenario 10: Family scope with parent and child roles.',
    expected: 'valid',
    member_set: ms,
  })
}

// Fixture 05: read-only-handoff (Scenario 9)
{
  const owner = genIdentity()
  const guest = genIdentity()
  saveKeys('05-owner', owner)
  saveKeys('05-guest', guest)

  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)
  fs.writeFileSync(path.join(KEYS_DIR, '05-scope-key.hex'), scopeKey.toString('hex'))

  const members = [
    { ...owner, role: 'owner', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
    { ...guest, role: 'guest', joined_at: 1700000001000, joined_via_event_id: T.evt2 },
  ]

  const ms = makeMemberSet({
    scopeId: T.scopeA,
    members,
    scopeKey,
    version: 0,
    adminEdPrivKey: owner.edPriv,
  })

  writeVector('05-read-only-handoff.json', {
    fixture_id: 'member-set/05-read-only-handoff',
    description: 'Scenario 9: Owner and guest. Guest can decrypt but cannot rotate scope key.',
    expected: 'valid',
    member_set: ms,
  })
}

// Negative 01: version regression (semantic, not schema)
{
  const owner = genIdentity()
  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)

  const members = [
    { ...owner, role: 'owner', joined_at: 1700000000000, joined_via_event_id: T.evt1 },
  ]

  const ms = makeMemberSet({
    scopeId: T.scopeA,
    members,
    scopeKey,
    version: 0,
    adminEdPrivKey: owner.edPriv,
  })

  writeVector('negative-01-version-regression.json', {
    fixture_id: 'member-set/negative-01-version-regression',
    description: 'Version regression: MemberSet has version 0 but version 5 is already known. Semantic error, not schema error.',
    expected: 'MEMBERSET_VERSION_REGRESSION',
    known_version: 5,
    member_set: ms,
  })
}

// Negative 02: unknown role (schema rejects)
{
  const owner = genIdentity()

  // Build a member set with an invalid role; we can't use makeMemberSet since it would pass
  // valid identity_public_key. We build a deliberately invalid member_set.
  const scopeKey = crypto.randomBytes(SCOPE_KEY_BYTES)

  // Generate a valid-looking entry to satisfy scope_key requirements
  const ephemeral = crypto.generateKeyPairSync('x25519')
  const shared = crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: owner.xPub })
  const derived = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), 'uacp-scope-key-v1', 32))
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, nonce)
  const ct = Buffer.concat([cipher.update(scopeKey), cipher.final()])
  const tag = cipher.getAuthTag()
  const fullCt = Buffer.concat([rawPub(ephemeral.publicKey), ct, tag])

  // Build ms without going through makeMemberSet (role is invalid)
  const ms = {
    scope_id: T.scopeA,
    members: [{
      identity_public_key: owner.identityPubBase64url,
      role: 'superuser',
      joined_at: 1700000000000,
      joined_via_event_id: T.evt1,
    }],
    scope_key: {
      algorithm: 'X25519-AES256GCM',
      encrypted_key_per_member: [{
        recipient_identity_key: owner.x25519PubRaw.toString('base64url'),
        ciphertext: fullCt.toString('base64url'),
        nonce: nonce.toString('base64url'),
      }],
    },
    version: 0,
    signature: 'A'.repeat(86),
  }

  writeVector('negative-02-unknown-role.json', {
    fixture_id: 'member-set/negative-02-unknown-role',
    description: 'Member with role "superuser" — not in the normative enum. Schema rejects.',
    expected: 'UNKNOWN_ROLE',
    member_set: ms,
  })
}

console.log('\nAll member-set vectors generated.')
