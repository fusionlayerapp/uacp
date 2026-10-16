'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-withdraw-event'
const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/withdraw-event')

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/extensions/uacp-withdraw-event.schema.json'), 'utf8'
  ))
  ajv.addSchema(schema, SCHEMA_ID)
  return (doc) => ajv.validate(SCHEMA_ID, doc)
}

function loadVector(filename) {
  const raw = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, filename), 'utf8'))
  return raw.withdraw
}

const IDENTITY_PUB = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function baseWithdraw(overrides = {}) {
  return {
    type: 'withdraw',
    target_event_ids: ['50000000-0000-4000-8000-000000000001'],
    reason: 'author_retracted',
    withdrawn_at: 1700001000,
    withdrawer_identity: IDENTITY_PUB,
    ...overrides,
  }
}

const validate = loadValidator()

describe('withdraw-event schema', () => {
  it('valid withdrawal validates', () => {
    assert.ok(validate(baseWithdraw()), 'basic withdrawal should be valid')
  })

  it('unknown reason rejects', () => {
    assert.ok(!validate(baseWithdraw({ reason: 'user_request' })), 'unknown reason must be rejected')
  })

  it('empty target_event_ids rejects', () => {
    assert.ok(!validate(baseWithdraw({ target_event_ids: [] })), 'empty target_event_ids must be rejected')
  })

  it('invalid UUID in target_event_ids rejects', () => {
    assert.ok(!validate(baseWithdraw({ target_event_ids: ['not-a-uuid'] })), 'invalid UUID should fail')
  })

  it('withdrawer_identity wrong length rejects', () => {
    assert.ok(!validate(baseWithdraw({ withdrawer_identity: 'tooshort' })), 'short identity should fail')
  })

  it('all valid reason values pass schema', () => {
    for (const reason of ['author_retracted', 'dlp_violation', 'wrong_scope', 'admin_action']) {
      assert.ok(validate(baseWithdraw({ reason })), `reason=${reason} should be valid`)
    }
  })
})

describe('test_scenario_15_author_retraction', () => {
  it('fixture 01-author-retracted validates', () => {
    const withdraw = loadVector('01-author-retracted.json')
    assert.equal(withdraw.reason, 'author_retracted')
    assert.ok(validate(withdraw), 'author_retracted withdrawal should be schema-valid')
  })
})

describe('test_scenario_15_dlp_withdrawal', () => {
  it('fixture 02-dlp-violation validates', () => {
    const withdraw = loadVector('02-dlp-violation.json')
    assert.equal(withdraw.reason, 'dlp_violation')
    assert.ok(withdraw.target_event_ids.length >= 1, 'must have at least one target')
    assert.ok(validate(withdraw), 'dlp_violation withdrawal should be schema-valid')
  })
})

describe('test_scenario_10_admin_withdrawal', () => {
  it('fixture 03-admin-action validates', () => {
    const withdraw = loadVector('03-admin-action.json')
    assert.equal(withdraw.reason, 'admin_action')
    assert.ok(validate(withdraw), 'admin_action withdrawal should be schema-valid')
  })
})

describe('test_negative_unknown_reason_rejects', () => {
  it('fixture negative-01-unknown-reason fails schema', () => {
    const withdraw = loadVector('negative-01-unknown-reason.json')
    assert.ok(!validate(withdraw), 'unknown reason must be rejected by schema')
  })

  it('non-author withdraw scenario returns WITHDRAWER_NOT_AUTHORIZED (semantic)', () => {
    const authorId = IDENTITY_PUB
    const nonAuthorId = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    function checkWithdrawerAuth(withdraw, originalAuthorId) {
      if (withdraw.reason === 'author_retracted' || withdraw.reason === 'wrong_scope') {
        if (withdraw.withdrawer_identity !== originalAuthorId) return 'WITHDRAWER_NOT_AUTHORIZED'
      }
      return null
    }
    const withdraw = baseWithdraw({ reason: 'author_retracted', withdrawer_identity: nonAuthorId })
    assert.equal(checkWithdrawerAuth(withdraw, authorId), 'WITHDRAWER_NOT_AUTHORIZED')
    const withdraw2 = baseWithdraw({ reason: 'author_retracted', withdrawer_identity: authorId })
    assert.equal(checkWithdrawerAuth(withdraw2, authorId), null)
  })
})
