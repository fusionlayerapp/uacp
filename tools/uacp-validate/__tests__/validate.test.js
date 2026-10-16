const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { canonicalJson, sha256Hex, validateEnvelope } = require('../index.js')

function loadExample() {
  const p = path.resolve(__dirname, '../../../spec/v1/examples/envelope-only.yml')
  return fs.readFileSync(p, 'utf8')
}

test('valid example validates', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  assert.doesNotThrow(() => validateEnvelope(env))
})

test('signed example hash verified', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  const clone = JSON.parse(JSON.stringify(env))
  const declared = clone.signature.slice('sha256:'.length)
  delete clone.signature
  const computed = sha256Hex(canonicalJson(clone))
  assert.equal(computed, declared)
})

test('missing required field rejected', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  delete env.author
  assert.throws(() => validateEnvelope(env), /missing_required:author/)
})

test('missing subject rejected', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  delete env.subject
  assert.throws(() => validateEnvelope(env), /missing_required:subject/)
})

test('audience must be array', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  env.audience = 'not-an-array'
  const clone = JSON.parse(JSON.stringify(env))
  delete clone.signature
  env.signature = `sha256:${sha256Hex(canonicalJson(clone))}`
  assert.throws(() => validateEnvelope(env), /audience_must_be_array/)
})

test('audience array of principals validates', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  env.audience = ['did:key:z6MkAbc123', 'did:web:example.com:users:bob']
  const clone = JSON.parse(JSON.stringify(env))
  delete clone.signature
  env.signature = `sha256:${sha256Hex(canonicalJson(clone))}`
  assert.doesNotThrow(() => validateEnvelope(env))
})

test('unknown namespaced kind passes through without modification', () => {
  const yaml = require('js-yaml')
  const env = yaml.load(loadExample())
  env.kind = 'acme/custom-kind'
  env.body = { any: { nested: ['shape'] } }

  const clone = JSON.parse(JSON.stringify(env))
  delete clone.signature
  env.signature = `sha256:${sha256Hex(canonicalJson(clone))}`

  const before = JSON.parse(JSON.stringify(env))
  validateEnvelope(env)
  assert.deepEqual(env, before)
})

