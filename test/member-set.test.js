'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set'
const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/member-set')
const KEYS_DIR = path.join(VECTORS_DIR, 'keys')

// ---- Schema validator ----

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/extensions/uacp-member-set.schema.json'), 'utf8'))
  ajv.addSchema(schema, SCHEMA_ID)
  return ajv
}

const ajv = loadValidator()

function schemaValidate(ms) {
  const valid = ajv.validate(SCHEMA_ID, ms)
  return { valid, errors: ajv.errors || [] }
}

// ---- CBOR encoder (matches generate script) ----

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

function encodeMemberForCbor(member) {
  return cborMap([
    ['identity_public_key', cborBytes(Buffer.from(member.identity_public_key, 'base64url'))],
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

// ---- Key loading helpers ----

function loadX25519Priv(prefix) {
  const hex = fs.readFileSync(path.join(KEYS_DIR, `${prefix}-x25519-priv.pkcs8.hex`), 'utf8').trim()
  return crypto.createPrivateKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'pkcs8' })
}

function loadEd25519Pub(prefix) {
  const hex = fs.readFileSync(path.join(KEYS_DIR, `${prefix}-ed25519-pub.spki.hex`), 'utf8').trim()
  return crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' })
}

function loadEd25519Priv(prefix) {
  const hex = fs.readFileSync(path.join(KEYS_DIR, `${prefix}-ed25519-priv.pkcs8.hex`), 'utf8').trim()
  return crypto.createPrivateKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'pkcs8' })
}

// ---- Decryption helper ----

function decryptScopeKey(entry, recipientX25519Priv) {
  const fullCt = Buffer.from(entry.ciphertext, 'base64url')
  const ephemeralPubRaw = fullCt.slice(0, 32)
  const gcmCt = fullCt.slice(32, 64)
  const authTag = fullCt.slice(64, 80)
  const nonce = Buffer.from(entry.nonce, 'base64url')

  const ephemeralPubKey = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), ephemeralPubRaw]),
    format: 'der',
    type: 'spki',
  })

  const shared = crypto.diffieHellman({ privateKey: recipientX25519Priv, publicKey: ephemeralPubKey })
  const derived = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), 'uacp-scope-key-v1', 32))

  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, nonce)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(gcmCt), decipher.final()])
}

// ---- MemberSet validator ----

function validateMemberSet(fixture, knownVersion = -1) {
  const ms = fixture.member_set || (Array.isArray(fixture.member_sets) ? fixture.member_sets[0] : null)
  if (!ms) throw new Error('no member_set in fixture')

  // 1. Schema validation
  const { valid, errors } = schemaValidate(ms)
  if (!valid) {
    const reason = errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
    return { ok: false, error: 'SCHEMA_INVALID', reason }
  }

  // 2. Version regression check
  if (ms.version <= knownVersion) {
    return { ok: false, error: 'MEMBERSET_VERSION_REGRESSION' }
  }

  // 3. Ed25519 signature verification
  // The admin's key is the first member with role owner or admin
  const adminMember = ms.members.find(m => m.role === 'owner' || m.role === 'admin' || m.role === 'parent')
  if (!adminMember) return { ok: false, error: 'MEMBERSET_NO_ADMIN' }

  const adminPubKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(adminMember.identity_public_key, 'base64url'),
    ]),
    format: 'der',
    type: 'spki',
  })

  const cbor = encodeMemberSetForSigning(ms)
  const sigBuf = Buffer.from(ms.signature, 'base64url')
  const sigOk = crypto.verify(null, cbor, adminPubKey, sigBuf)
  if (!sigOk) return { ok: false, error: 'MEMBERSET_SIG_INVALID' }

  // 4. Key count check
  if (ms.scope_key.encrypted_key_per_member.length !== ms.members.length) {
    return { ok: false, error: 'MEMBERSET_KEY_COUNT_MISMATCH' }
  }

  return { ok: true }
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, name), 'utf8'))
}

// ---- Tests ----

describe('member-set schema validation', () => {
  it('valid fixture passes schema', () => {
    const f = readFixture('01-two-member-scope.json')
    const { valid } = schemaValidate(f.member_set)
    assert.ok(valid, 'expected valid')
  })

  it('unknown role fails schema', () => {
    const f = readFixture('negative-02-unknown-role.json')
    const { valid } = schemaValidate(f.member_set)
    assert.ok(!valid, 'expected schema rejection for unknown role')
  })

  it('signature must be 86 base64url chars', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = { ...f.member_set, signature: 'tooshort' }
    const { valid } = schemaValidate(ms)
    assert.ok(!valid)
  })

  it('identity_public_key must be 43 base64url chars', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = JSON.parse(JSON.stringify(f.member_set))
    ms.members[0].identity_public_key = 'bad'
    const { valid } = schemaValidate(ms)
    assert.ok(!valid)
  })

  it('nonce must be 16 base64url chars', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = JSON.parse(JSON.stringify(f.member_set))
    ms.scope_key.encrypted_key_per_member[0].nonce = 'bad'
    const { valid } = schemaValidate(ms)
    assert.ok(!valid)
  })

  it('algorithm must be X25519-AES256GCM', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = JSON.parse(JSON.stringify(f.member_set))
    ms.scope_key.algorithm = 'AES-CBC'
    const { valid } = schemaValidate(ms)
    assert.ok(!valid)
  })

  it('version must be a non-negative integer', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = JSON.parse(JSON.stringify(f.member_set))
    ms.version = -1
    const { valid } = schemaValidate(ms)
    assert.ok(!valid)
  })
})

describe('test_scenario_7_two_member_scope_both_decrypt', () => {
  it('both members can decrypt scope key', () => {
    const f = readFixture('01-two-member-scope.json')
    const ms = f.member_set
    const scopeKeyHex = fs.readFileSync(path.join(KEYS_DIR, '01-scope-key.hex'), 'utf8').trim()

    const alicePriv = loadX25519Priv('01-alice')
    const bobPriv = loadX25519Priv('01-bob')

    const aliceDecrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[0], alicePriv)
    const bobDecrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[1], bobPriv)

    assert.equal(aliceDecrypted.toString('hex'), scopeKeyHex)
    assert.equal(bobDecrypted.toString('hex'), scopeKeyHex)
  })

  it('validates signature and structure', () => {
    const f = readFixture('01-two-member-scope.json')
    const result = validateMemberSet(f)
    assert.ok(result.ok, `expected ok, got ${result.error}: ${result.reason}`)
  })
})

describe('test_scenario_8_five_member_team_validates', () => {
  it('five-member team passes full validation', () => {
    const f = readFixture('02-five-member-team.json')
    const result = validateMemberSet(f)
    assert.ok(result.ok, `expected ok, got ${result.error}: ${result.reason}`)
  })

  it('all five members can decrypt scope key', () => {
    const f = readFixture('02-five-member-team.json')
    const ms = f.member_set
    const scopeKeyHex = fs.readFileSync(path.join(KEYS_DIR, '02-scope-key.hex'), 'utf8').trim()

    const prefixes = ['02-admin', '02-m1', '02-m2', '02-m3', '02-m4']
    for (let i = 0; i < prefixes.length; i++) {
      const priv = loadX25519Priv(prefixes[i])
      const decrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[i], priv)
      assert.equal(decrypted.toString('hex'), scopeKeyHex, `member ${prefixes[i]} could not decrypt`)
    }
  })
})

describe('test_scenario_8_version_increment_accepted', () => {
  it('v1 and v2 both pass schema', () => {
    const f = readFixture('03-team-version-increment.json')
    for (const ms of f.member_sets) {
      const { valid } = schemaValidate(ms)
      assert.ok(valid, `version ${ms.version} failed schema`)
    }
  })

  it('v2 has higher version than v1', () => {
    const f = readFixture('03-team-version-increment.json')
    const [v1, v2] = f.member_sets
    assert.ok(v2.version > v1.version, 'v2 version should be > v1')
  })

  it('v2 has one more member than v1', () => {
    const f = readFixture('03-team-version-increment.json')
    const [v1, v2] = f.member_sets
    assert.equal(v2.members.length, v1.members.length + 1)
  })

  it('v2 scope key differs from v1 scope key (rotation)', () => {
    const scopeKey1 = fs.readFileSync(path.join(KEYS_DIR, '03-scope-key-v1.hex'), 'utf8').trim()
    const scopeKey2 = fs.readFileSync(path.join(KEYS_DIR, '03-scope-key-v2.hex'), 'utf8').trim()
    assert.notEqual(scopeKey1, scopeKey2, 'scope key should rotate on member add')
  })
})

describe('test_scenario_9_guest_role_validates', () => {
  it('member set with guest role passes full validation', () => {
    const f = readFixture('05-read-only-handoff.json')
    const result = validateMemberSet(f)
    assert.ok(result.ok, `expected ok, got ${result.error}: ${result.reason}`)
  })

  it('guest member is present in members array', () => {
    const f = readFixture('05-read-only-handoff.json')
    const guestMember = f.member_set.members.find(m => m.role === 'guest')
    assert.ok(guestMember, 'expected a guest member')
  })

  it('guest can decrypt scope key', () => {
    const f = readFixture('05-read-only-handoff.json')
    const ms = f.member_set
    const scopeKeyHex = fs.readFileSync(path.join(KEYS_DIR, '05-scope-key.hex'), 'utf8').trim()
    const guestIdx = ms.members.findIndex(m => m.role === 'guest')
    const guestPriv = loadX25519Priv('05-guest')
    const decrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[guestIdx], guestPriv)
    assert.equal(decrypted.toString('hex'), scopeKeyHex)
  })
})

describe('test_scenario_10_family_parent_child_roles', () => {
  it('parent+child scope passes full validation', () => {
    const f = readFixture('04-family-parent-child.json')
    const result = validateMemberSet(f)
    assert.ok(result.ok, `expected ok, got ${result.error}: ${result.reason}`)
  })

  it('has exactly one parent and one child', () => {
    const f = readFixture('04-family-parent-child.json')
    const ms = f.member_set
    assert.equal(ms.members.filter(m => m.role === 'parent').length, 1)
    assert.equal(ms.members.filter(m => m.role === 'child').length, 1)
  })

  it('both parent and child can decrypt scope key', () => {
    const f = readFixture('04-family-parent-child.json')
    const ms = f.member_set
    const scopeKeyHex = fs.readFileSync(path.join(KEYS_DIR, '04-scope-key.hex'), 'utf8').trim()
    const parentPriv = loadX25519Priv('04-parent')
    const childPriv = loadX25519Priv('04-child')
    const parentDecrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[0], parentPriv)
    const childDecrypted = decryptScopeKey(ms.scope_key.encrypted_key_per_member[1], childPriv)
    assert.equal(parentDecrypted.toString('hex'), scopeKeyHex)
    assert.equal(childDecrypted.toString('hex'), scopeKeyHex)
  })
})

describe('test_negative_version_regression', () => {
  it('rejects member set with version <= known version', () => {
    const f = readFixture('negative-01-version-regression.json')
    const result = validateMemberSet(f, f.known_version)
    assert.ok(!result.ok)
    assert.equal(result.error, 'MEMBERSET_VERSION_REGRESSION')
  })

  it('accepts same member set when known version is -1', () => {
    const f = readFixture('negative-01-version-regression.json')
    const result = validateMemberSet(f, -1)
    assert.ok(result.ok, `expected ok, got ${result.error}`)
  })

  it('member set is schema-valid despite semantic error', () => {
    const f = readFixture('negative-01-version-regression.json')
    const { valid } = schemaValidate(f.member_set)
    assert.ok(valid, 'schema should accept version 0 as valid integer')
  })
})

describe('test_negative_unknown_role', () => {
  it('schema rejects member with unknown role', () => {
    const f = readFixture('negative-02-unknown-role.json')
    const { valid, errors } = schemaValidate(f.member_set)
    assert.ok(!valid)
    const roleError = errors.find(e => e.instancePath.includes('role'))
    assert.ok(roleError, 'expected a role validation error')
  })

  it('validateMemberSet returns SCHEMA_INVALID for unknown role', () => {
    const f = readFixture('negative-02-unknown-role.json')
    const result = validateMemberSet(f)
    assert.ok(!result.ok)
    assert.equal(result.error, 'SCHEMA_INVALID')
  })
})
