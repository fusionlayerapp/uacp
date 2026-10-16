'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/conversation'

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../schema/conversation.schema.json'), 'utf8'))
  ajv.addSchema(schema, SCHEMA_ID)
  return (doc) => ajv.validate(SCHEMA_ID, doc)
}

function minimal(overrides = {}) {
  return {
    uacp: '0.6.0',
    id: 'test',
    tool: 'test-tool',
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  }
}

const validate = loadValidator()

describe('resource limits — maxLength on data fields', () => {
  it('content_block.data at exactly maxLength (16 MB) is valid', () => {
    const data = 'A'.repeat(16777216)
    const doc = minimal({
      messages: [{ role: 'user', content: [{ type: 'image', data }] }],
    })
    assert.ok(validate(doc), 'should be valid at limit')
  })

  it('content_block.data over maxLength (16 MB + 1) is invalid', () => {
    const data = 'A'.repeat(16777217)
    const doc = minimal({
      messages: [{ role: 'user', content: [{ type: 'image', data }] }],
    })
    assert.ok(!validate(doc), 'should be invalid over limit')
  })

  it('attachment.data at 64 MB is valid', () => {
    const data = 'A'.repeat(67108864)
    const doc = minimal({
      messages: [{
        role: 'user',
        content: 'hello',
        attachments: [{ id: 'att1', mime_type: 'image/png', data }],
      }],
    })
    assert.ok(validate(doc), 'should be valid at attachment limit')
  })

  it('attachment.data over 64 MB is invalid', () => {
    const data = 'A'.repeat(67108865)
    const doc = minimal({
      messages: [{
        role: 'user',
        content: 'hello',
        attachments: [{ id: 'att1', mime_type: 'image/png', data }],
      }],
    })
    assert.ok(!validate(doc), 'should be invalid over attachment limit')
  })
})

describe('resource limits — maxItems', () => {
  it('10000 messages is valid', () => {
    const messages = Array.from({ length: 10000 }, () => ({ role: 'user', content: 'x' }))
    assert.ok(validate(minimal({ messages })), 'should be valid at limit')
  })

  it('10001 messages is invalid', () => {
    const messages = Array.from({ length: 10001 }, () => ({ role: 'user', content: 'x' }))
    assert.ok(!validate(minimal({ messages })), 'should be invalid over limit')
  })

  it('256 content blocks is valid', () => {
    const content = Array.from({ length: 256 }, () => ({ type: 'text', text: 'x' }))
    const doc = minimal({ messages: [{ role: 'user', content }] })
    assert.ok(validate(doc), 'should be valid at content limit')
  })

  it('257 content blocks is invalid', () => {
    const content = Array.from({ length: 257 }, () => ({ type: 'text', text: 'x' }))
    const doc = minimal({ messages: [{ role: 'user', content }] })
    assert.ok(!validate(doc), 'should be invalid over content limit')
  })

  it('32 extensions is valid', () => {
    const extensions = Array.from({ length: 32 }, (_, i) => `ext-${i}`)
    assert.ok(validate(minimal({ extensions })), 'should be valid at limit')
  })

  it('33 extensions is invalid', () => {
    const extensions = Array.from({ length: 33 }, (_, i) => `ext-${i}`)
    assert.ok(!validate(minimal({ extensions })), 'should be invalid over limit')
  })
})

describe('resource limits — metadata maxProperties', () => {
  it('metadata with 64 properties is valid', () => {
    const metadata = {}
    for (let i = 0; i < 64; i++) metadata[`key${i}`] = i
    assert.ok(validate(minimal({ metadata })), 'should be valid at limit')
  })

  it('metadata with 65 properties is invalid', () => {
    const metadata = {}
    for (let i = 0; i < 65; i++) metadata[`key${i}`] = i
    assert.ok(!validate(minimal({ metadata })), 'should be invalid over limit')
  })
})
