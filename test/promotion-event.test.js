'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-promotion-event'
const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/promotion-event')

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/extensions/uacp-promotion-event.schema.json'), 'utf8'
  ))
  ajv.addSchema(schema, SCHEMA_ID)
  return (doc) => ajv.validate(SCHEMA_ID, doc)
}

function loadVector(filename) {
  const raw = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, filename), 'utf8'))
  return raw.promotion
}

function validateMissingSummary(promotion) {
  if (promotion.mode === 'with_summary' && promotion.summary_payload === null) {
    return 'MISSING_SUMMARY'
  }
  return null
}

const IDENTITY_PUB = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function basePromotion(overrides = {}) {
  return {
    type: 'promotion',
    source_scope_id: '40000000-0000-4000-8000-000000000001',
    source_event_ids: ['50000000-0000-4000-8000-000000000001'],
    destination_scope_id: '40000000-0000-4000-8000-000000000002',
    mode: 'as_is',
    summary_payload: null,
    context_note: null,
    promoted_at: 1700000000,
    promoter_identity: IDENTITY_PUB,
    ...overrides,
  }
}

const validate = loadValidator()

describe('promotion-event schema', () => {
  it('valid as_is promotion validates', () => {
    assert.ok(validate(basePromotion()), 'as_is with null summary should be valid')
  })

  it('unknown mode rejects', () => {
    assert.ok(!validate(basePromotion({ mode: 'move' })), 'unknown mode should fail schema')
  })

  it('missing source_event_ids (empty array) rejects', () => {
    assert.ok(!validate(basePromotion({ source_event_ids: [] })), 'empty source_event_ids must be rejected')
  })

  it('invalid UUID in source_event_ids rejects', () => {
    assert.ok(!validate(basePromotion({ source_event_ids: ['not-a-uuid'] })), 'invalid UUID should fail')
  })

  it('promoter_identity wrong length rejects', () => {
    assert.ok(!validate(basePromotion({ promoter_identity: 'tooshort' })), 'short identity should fail')
  })
})

describe('test_scenario_8_pm_promotes_prd_as_is', () => {
  it('fixture 01-as-is-promotion validates against schema', () => {
    const promotion = loadVector('01-as-is-promotion.json')
    assert.equal(promotion.mode, 'as_is')
    assert.equal(promotion.summary_payload, null)
    assert.ok(validate(promotion), 'as_is promotion should be schema-valid')
  })
})

describe('test_scenario_2_with_summary_validates', () => {
  it('fixture 02-with-summary validates against schema', () => {
    const promotion = loadVector('02-with-summary.json')
    assert.equal(promotion.mode, 'with_summary')
    assert.ok(promotion.summary_payload !== null, 'summary_payload must be set')
    assert.ok(validate(promotion), 'with_summary promotion should be schema-valid')
  })
})

describe('test_scenario_9_bulk_summary_only', () => {
  it('fixture 03-summary-only validates and has multiple source events', () => {
    const promotion = loadVector('03-summary-only.json')
    assert.equal(promotion.mode, 'summary_only')
    assert.ok(promotion.source_event_ids.length >= 2, 'bulk promotion should have multiple source events')
    assert.ok(validate(promotion), 'summary_only promotion should be schema-valid')
  })
})

describe('test_negative_missing_summary_detected', () => {
  it('mode=with_summary + summary_payload=null passes schema but fails semantic check', () => {
    const promotion = loadVector('negative-01-missing-summary.json')
    assert.equal(promotion.mode, 'with_summary')
    assert.equal(promotion.summary_payload, null)
    assert.ok(validate(promotion), 'schema should pass (null is allowed structurally)')
    assert.equal(validateMissingSummary(promotion), 'MISSING_SUMMARY', 'semantic check must return MISSING_SUMMARY')
  })

  it('mode=with_summary + non-null summary passes semantic check', () => {
    const promotion = basePromotion({ mode: 'with_summary', summary_payload: 'dGVzdA' })
    assert.ok(validate(promotion), 'should be schema-valid')
    assert.equal(validateMissingSummary(promotion), null, 'no error when summary provided')
  })

  it('mode=as_is + null summary has no semantic error', () => {
    const promotion = basePromotion({ mode: 'as_is', summary_payload: null })
    assert.equal(validateMissingSummary(promotion), null)
  })
})

describe('negative schema cases', () => {
  it('fixture negative-02-unknown-mode fails schema', () => {
    const promotion = loadVector('negative-02-unknown-mode.json')
    assert.ok(!validate(promotion), 'unknown mode must be rejected by schema')
  })
})
