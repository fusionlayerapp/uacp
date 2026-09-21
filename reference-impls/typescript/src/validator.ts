import type { UACPDocument, ValidationResult } from './types.js'
import { KIND_SCHEMAS } from './kind-schemas.js'
import { checkSchema } from './schema-subset.js'

const VALID_ROLES = new Set(['user', 'assistant', 'system', 'tool'])
const VALID_MSG_STATUS = new Set(['complete', 'in_progress', 'error'])
const VALID_CONTENT_TYPES = new Set([
  'text', 'image', 'file', 'code', 'thinking', 'artifact_ref', 'audio', 'video', 'pdf', 'latex',
])
const VALID_ARTIFACT_TYPES = new Set(['code', 'html', 'svg', 'markdown', 'react', 'text'])
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
const SHA256_RE = /^[a-f0-9]{64}$/
const HTTPS_RE = /^https?:\/\//

const VALID_ROOT_KEYS = new Set([
  'uacp', 'id', 'tool', 'tool_chain', 'model', 'title', 'extensions',
  'created_at', 'updated_at', 'tags', 'project', 'branches', 'messages',
  'metadata',
])

const VALID_MSG_KEYS = new Set([
  'id', 'parent_id', 'role', 'content', 'timestamp', 'model', 'tokens',
  'status', 'tool_calls', 'call_id', 'tool_call_id', 'name', 'attachments',
  'citations', 'artifacts', 'redactions', 'metadata', 'provenance',
  'confidence', 'provenance_source',
  'branch_parent_id', 'branch_label', 'reasoning',
])

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function validateModel(model: unknown, prefix: string, errors: string[]): void {
  if (typeof model === 'string') return
  if (isObject(model)) {
    if (typeof (model as Record<string, unknown>).id !== 'string') {
      errors.push(`${prefix}: model object must have an 'id' string field`)
    }
    return
  }
  errors.push(`${prefix}: model must be a string or object`)
}

function validateMessage(msg: unknown, idx: number, errors: string[]): void {
  const p = `messages[${idx}]`
  if (!isObject(msg)) { errors.push(`${p}: must be an object`); return }

  for (const key of Object.keys(msg)) {
    if (!VALID_MSG_KEYS.has(key)) {
      errors.push(`${p}: unknown property '${key}'`)
    }
  }

  if (!VALID_ROLES.has(msg.role as string)) {
    errors.push(`${p}.role: must be one of ${[...VALID_ROLES].join(', ')}`)
  }
  if (msg.content === undefined || msg.content === null) {
    errors.push(`${p}.content: required`)
  } else if (Array.isArray(msg.content)) {
    if ((msg.content as unknown[]).length === 0) {
      errors.push(`${p}.content: array must contain at least one item`)
    } else {
      ;(msg.content as unknown[]).forEach((block, j) => validateContentBlock(block, `${p}.content[${j}]`, errors))
    }
  } else if (typeof msg.content === 'string') {
    if ((msg.content as string).length > 1048576) {
      errors.push(`${p}.content: must not exceed 1048576 characters`)
    }
  } else {
    errors.push(`${p}.content: must be a string or array of content blocks`)
  }

  if (msg.status !== undefined && !VALID_MSG_STATUS.has(msg.status as string)) {
    errors.push(`${p}.status: must be one of ${[...VALID_MSG_STATUS].join(', ')}`)
  }
  if (msg.timestamp !== undefined && !ISO8601_RE.test(msg.timestamp as string)) {
    errors.push(`${p}.timestamp: must be an ISO 8601 datetime string`)
  }

  if (msg.model !== undefined) {
    validateModel(msg.model, `${p}.model`, errors)
  }

  if (msg.tokens !== undefined) {
    if (!isObject(msg.tokens)) {
      errors.push(`${p}.tokens: must be an object`)
    } else {
      const t = msg.tokens as Record<string, unknown>
      if (t.input !== undefined && (typeof t.input !== 'number' || (t.input as number) < 0)) {
        errors.push(`${p}.tokens.input: must be a non-negative number`)
      }
      if (t.output !== undefined && (typeof t.output !== 'number' || (t.output as number) < 0)) {
        errors.push(`${p}.tokens.output: must be a non-negative number`)
      }
    }
  }

  if (msg.provenance !== undefined) {
    const prov = msg.provenance as string
    if (prov === 'inferred' && msg.confidence === undefined) {
      errors.push(`${p}.confidence: required when provenance is 'inferred'`)
    }
    if (prov === 'extracted' && msg.confidence !== undefined) {
      errors.push(`${p}.confidence: must not be present when provenance is 'extracted'`)
    }
  }

  if (msg.confidence !== undefined) {
    const c = msg.confidence as number
    if (typeof c !== 'number' || c < 0 || c > 1) {
      errors.push(`${p}.confidence: must be a number between 0 and 1`)
    }
  }

  if (msg.tool_calls !== undefined) {
    if (!Array.isArray(msg.tool_calls)) {
      errors.push(`${p}.tool_calls: must be an array`)
    } else {
      ;(msg.tool_calls as unknown[]).forEach((tc, j) => validateToolCall(tc, `${p}.tool_calls[${j}]`, errors))
    }
  }

  if (msg.attachments !== undefined) {
    if (!Array.isArray(msg.attachments)) {
      errors.push(`${p}.attachments: must be an array`)
    } else {
      ;(msg.attachments as unknown[]).forEach((a, j) => validateAttachment(a, `${p}.attachments[${j}]`, errors))
    }
  }

  if (msg.redactions !== undefined) {
    validateRedactions(msg.redactions, `${p}.redactions`, errors)
  }

  if (msg.citations !== undefined) {
    if (!Array.isArray(msg.citations)) {
      errors.push(`${p}.citations: must be an array`)
    } else {
      ;(msg.citations as unknown[]).forEach((c, j) => validateCitation(c, `${p}.citations[${j}]`, errors))
    }
  }
  if (msg.artifacts !== undefined) {
    if (!Array.isArray(msg.artifacts)) {
      errors.push(`${p}.artifacts: must be an array`)
    } else {
      ;(msg.artifacts as unknown[]).forEach((a, j) => validateArtifact(a, `${p}.artifacts[${j}]`, errors))
    }
  }
}

function validateContentBlock(block: unknown, prefix: string, errors: string[]): void {
  if (!isObject(block)) { errors.push(`${prefix}: must be an object`); return }
  if (!block.type || !VALID_CONTENT_TYPES.has(block.type as string)) {
    errors.push(`${prefix}.type: must be one of ${[...VALID_CONTENT_TYPES].join(', ')}`)
  }
  if (block.type === 'text' && typeof block.text !== 'string') {
    errors.push(`${prefix}: text block requires text (string)`)
  }
  if (block.type === 'thinking' && typeof block.text !== 'string') {
    errors.push(`${prefix}: thinking block requires text (string)`)
  }
  if (block.type === 'artifact_ref' && typeof block.id !== 'string') {
    errors.push(`${prefix}: artifact_ref block requires id (string)`)
  }
  if (block.type === 'code' && typeof block.code !== 'string') {
    errors.push(`${prefix}: code block requires code (string)`)
  }
  if (block.type === 'latex' && typeof block.text !== 'string') {
    errors.push(`${prefix}: latex block requires text (string)`)
  }
  if (block.type === 'image') {
    if (typeof block.url !== 'string' && typeof block.data !== 'string') {
      errors.push(`${prefix}: image block requires url or data`)
    }
  }
}

function validateToolCall(tc: unknown, prefix: string, errors: string[]): void {
  if (!isObject(tc)) { errors.push(`${prefix}: must be an object`); return }
  if (typeof tc.call_id !== 'string' || !(tc.call_id as string)) {
    errors.push(`${prefix}.call_id: required, must be a non-empty string`)
  }
  if (typeof tc.name !== 'string' || !(tc.name as string)) {
    errors.push(`${prefix}.name: required, must be a non-empty string`)
  }
}

function validateAttachment(a: unknown, prefix: string, errors: string[]): void {
  if (!isObject(a)) { errors.push(`${prefix}: must be an object`); return }
  if (typeof a.id !== 'string' || !(a.id as string)) {
    errors.push(`${prefix}.id: required, must be a non-empty string`)
  }
  if (typeof a.mime_type !== 'string' || !(a.mime_type as string)) {
    errors.push(`${prefix}.mime_type: required, must be a non-empty string`)
  }
  if (a.sha256 !== undefined && !SHA256_RE.test(a.sha256 as string)) {
    errors.push(`${prefix}.sha256: must match /^[a-f0-9]{64}$/`)
  }
}

function validateRedactions(r: unknown, prefix: string, errors: string[]): void {
  if (!isObject(r)) { errors.push(`${prefix}: must be an object`); return }
  if (typeof r.count !== 'number' || !Number.isInteger(r.count)) {
    errors.push(`${prefix}.count: required, must be an integer`)
  }
  if (typeof r.placeholder_format !== 'string') {
    errors.push(`${prefix}.placeholder_format: required, must be a string`)
  }
}

function validateCitation(c: unknown, prefix: string, errors: string[]): void {
  if (!isObject(c)) { errors.push(`${prefix}: must be an object`); return }
  if (!Array.isArray(c.span) || c.span.length !== 2 || (c.span as unknown[]).some(v => typeof v !== 'number')) {
    errors.push(`${prefix}.span: must be [number, number]`)
  }
  if (!isObject(c.source)) {
    errors.push(`${prefix}.source.url: required`)
  } else {
    const src = c.source as Record<string, unknown>
    if (typeof src.url !== 'string') {
      errors.push(`${prefix}.source.url: required`)
    } else if (!HTTPS_RE.test(src.url as string)) {
      errors.push(`${prefix}.source.url: must start with http:// or https://`)
    }
  }
}

function validateArtifact(a: unknown, prefix: string, errors: string[]): void {
  if (!isObject(a)) { errors.push(`${prefix}: must be an object`); return }
  if (typeof a.id !== 'string' || !a.id) errors.push(`${prefix}.id: required`)
  if (!VALID_ARTIFACT_TYPES.has(a.type as string)) {
    errors.push(`${prefix}.type: must be one of ${[...VALID_ARTIFACT_TYPES].join(', ')}`)
  }
  if (typeof a.title !== 'string' || !a.title) errors.push(`${prefix}.title: required`)
  if (typeof a.content !== 'string') errors.push(`${prefix}.content: required (string)`)
}

function validateKindEnvelope(doc: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  if (typeof doc.uacp !== 'string' || !SEMVER_RE.test(doc.uacp)) {
    errors.push('uacp: must be a semver string (e.g. "0.6.0")')
  }
  if (typeof doc.id !== 'string' || !doc.id.trim()) {
    errors.push('id: required, must be a non-empty string')
  } else if (doc.id.length > 256) {
    errors.push('id: must not exceed 256 characters')
  }
  const kind = doc.kind as string
  const schema = Object.prototype.hasOwnProperty.call(KIND_SCHEMAS, kind) ? KIND_SCHEMAS[kind] : undefined
  if (!isObject(schema)) {
    errors.push(`kind: unknown artifact kind '${kind}'`)
  } else {
    checkSchema(schema, doc.body, 'body', schema, errors)
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function validate(doc: unknown): ValidationResult {
  const errors: string[] = []

  if (!isObject(doc)) {
    return { ok: false, errors: ['Root must be a JSON object'] }
  }

  // A kind+body artifact envelope (memory, persona, ...) is not a conversation:
  // its body is judged by its kind schema, as in validate.js (uacp#102, #105).
  if (typeof doc.kind === 'string' && 'body' in doc) {
    return validateKindEnvelope(doc)
  }

  for (const key of Object.keys(doc)) {
    if (!VALID_ROOT_KEYS.has(key)) {
      errors.push(`unknown root property '${key}'`)
    }
  }

  if (!doc.uacp || typeof doc.uacp !== 'string' || !SEMVER_RE.test(doc.uacp as string)) {
    errors.push('uacp: must be a semver string (e.g. "0.6.0")')
  }

  if (!doc.id || typeof doc.id !== 'string' || !(doc.id as string).trim()) {
    errors.push('id: required, must be a non-empty string')
  } else if ((doc.id as string).length > 256) {
    errors.push('id: must not exceed 256 characters')
  }

  if (doc.tool === undefined || doc.tool === null) {
    errors.push('tool: required, must be a string or non-empty array of strings')
  } else if (typeof doc.tool === 'string') {
    if ((doc.tool as string).length === 0) {
      errors.push('tool: must not be an empty string')
    } else if ((doc.tool as string).length > 128) {
      errors.push('tool: must not exceed 128 characters')
    }
  } else if (Array.isArray(doc.tool)) {
    if ((doc.tool as unknown[]).length === 0) {
      errors.push('tool: array must contain at least one item')
    }
  } else {
    errors.push('tool: must be a string or array of strings')
  }

  if (doc.model !== undefined) {
    validateModel(doc.model, 'model', errors)
  }

  if (!Array.isArray(doc.messages)) {
    errors.push('messages: required, must be an array')
  } else if ((doc.messages as unknown[]).length === 0) {
    errors.push('messages: must contain at least one message')
  } else {
    ;(doc.messages as unknown[]).forEach((msg, i) => validateMessage(msg, i, errors))
  }

  if (doc.created_at !== undefined && !ISO8601_RE.test(doc.created_at as string)) {
    errors.push('created_at: must be an ISO 8601 datetime string')
  }

  if (doc.updated_at !== undefined && !ISO8601_RE.test(doc.updated_at as string)) {
    errors.push('updated_at: must be an ISO 8601 datetime string')
  }

  if (doc.branches !== undefined && !Array.isArray(doc.branches)) {
    errors.push('branches: must be an array of strings')
  }

  if (doc.extensions !== undefined) {
    if (!Array.isArray(doc.extensions)) {
      errors.push('extensions: must be an array')
    } else if ((doc.extensions as unknown[]).length > 32) {
      errors.push('extensions: must not contain more than 32 items')
    } else {
      ;(doc.extensions as unknown[]).forEach((ext, i) => {
        if (typeof ext !== 'string' || !(ext as string)) {
          errors.push(`extensions[${i}]: must be a non-empty string`)
        }
      })
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
