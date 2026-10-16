#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const yaml = require('js-yaml')

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k])
  return out
}

function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj))
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const KIND_RE = /^([a-z][a-z0-9-]*|[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)$/
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function validateEnvelope(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error('envelope_not_object')

  const required = ['uacp_version', 'kind', 'id', 'schema_version', 'version', 'subject', 'author', 'created_at', 'signature', 'body']
  for (const k of required) if (!(k in env)) throw new Error(`missing_required:${k}`)

  if (env.uacp_version !== 1) throw new Error('uacp_version_must_be_1')
  if (typeof env.kind !== 'string' || !KIND_RE.test(env.kind)) throw new Error('kind_invalid')
  if (typeof env.id !== 'string' || env.id.length < 1) throw new Error('id_invalid')
  if (!Number.isInteger(env.schema_version) || env.schema_version < 1) throw new Error('schema_version_invalid')
  if (typeof env.version !== 'string' || !SEMVER_RE.test(env.version)) throw new Error('version_invalid')
  if (typeof env.subject !== 'string' || env.subject.length < 1) throw new Error('subject_invalid')
  if (typeof env.author !== 'string' || env.author.length < 1) throw new Error('author_invalid')
  if (typeof env.created_at !== 'string' || !ISO_Z_RE.test(env.created_at)) throw new Error('created_at_invalid')
  if (typeof env.signature !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(env.signature)) throw new Error('signature_invalid')
  if (typeof env.body !== 'object' || env.body === null) throw new Error('body_invalid')

  if ('audience' in env) {
    if (!Array.isArray(env.audience)) throw new Error('audience_must_be_array')
    for (const p of env.audience) {
      if (typeof p !== 'string' || p.length < 1) throw new Error('audience_entry_invalid')
    }
  }
  if ('scope' in env && typeof env.scope !== 'string') throw new Error('scope_must_be_string')

  const declared = env.signature.slice('sha256:'.length)
  const clone = JSON.parse(JSON.stringify(env))
  delete clone.signature
  const computed = sha256Hex(canonicalJson(clone))
  if (computed !== declared) throw new Error(`signature_mismatch:${declared}:${computed}`)
}

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node tools/uacp-validate/index.js <path-to-envelope.yml>')
    process.exit(2)
  }

  const abs = path.resolve(process.cwd(), file)
  const raw = fs.readFileSync(abs, 'utf8')
  const env = yaml.load(raw)

  try {
    validateEnvelope(env)
    console.log(`PASS: ${file}`)
  } catch (err) {
    console.error(`FAIL: ${file}: ${err.message}`)
    process.exit(1)
  }
}

if (require.main === module) main()

module.exports = { canonicalJson, sha256Hex, validateEnvelope }

