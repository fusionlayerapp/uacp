import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate, parse, serialize, validateMemorySequence } from '../src/index.js'
import type { UACPDocument } from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VECTORS_DIR = join(__dirname, '../../../../test-vectors')

const minimal: UACPDocument = {
  uacp: '0.6.0',
  id: 'test-conv-id-001',
  tool: 'test-tool',
  messages: [{ role: 'user', content: 'Hello' }],
}

describe('validate', () => {
  it('accepts a minimal valid document', () => {
    const r = validate(minimal)
    assert.deepEqual(r, { ok: true })
  })

  it('rejects non-object input', () => {
    const r = validate('not an object')
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('Root must be')))
  })

  it('rejects missing uacp field', () => {
    const r = validate({ id: 'x', tool: 'y', messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('uacp')))
  })

  it('rejects invalid uacp semver', () => {
    const r = validate({ ...minimal, uacp: 'not-semver' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('uacp')))
  })

  it('rejects missing id', () => {
    const { id: _, ...noId } = minimal
    const r = validate(noId)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('id')))
  })

  it('rejects missing tool', () => {
    const { tool: _, ...noTool } = minimal
    const r = validate(noTool)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tool')))
  })

  it('rejects missing messages', () => {
    const { messages: _, ...noMsgs } = minimal
    const r = validate(noMsgs)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('messages')))
  })

  it('rejects empty messages array', () => {
    const r = validate({ ...minimal, messages: [] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('messages')))
  })

  it('rejects invalid message role', () => {
    const r = validate({ ...minimal, messages: [{ role: 'bot', content: 'hi' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('role')))
  })

  it('validates content blocks', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', text: 'reasoning...' },
          { type: 'code', code: 'console.log("hi")', language: 'javascript' },
        ],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects invalid content block type', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: [{ type: 'unknown-type' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('type')))
  })

  it('validates citations with span and source.url', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: 'Source: ...',
        citations: [{ span: [0, 6], source: { url: 'https://example.com' } }],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects citation without source.url', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: 'text',
        citations: [{ span: [0, 1], source: {} }],
      }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('source.url')))
  })

  it('validates artifacts', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the code' },
          { type: 'artifact_ref', id: 'art-1' },
        ],
        artifacts: [{ id: 'art-1', type: 'code', title: 'example.ts', content: 'const x = 1' }],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects extensions array over 32 items', () => {
    const extensions = Array.from({ length: 33 }, (_, i) => ({ id: `ext-${i}` }))
    const r = validate({ ...minimal, extensions })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('extensions')))
  })

  it('accepts exactly 32 extensions', () => {
    const extensions = Array.from({ length: 32 }, (_, i) => `uacp-ext-${i}`)
    const r = validate({ ...minimal, extensions })
    assert.equal(r.ok, true)
  })

  it('validates ISO 8601 timestamps', () => {
    const r = validate({
      ...minimal,
      created_at: '2026-05-09T12:00:00Z',
      updated_at: '2026-05-09T12:00:01.000Z',
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects non-ISO timestamps', () => {
    const r = validate({ ...minimal, created_at: 'not-a-date' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('created_at')))
  })

  // --- New constraint tests ---

  it('rejects tool as empty string', () => {
    const r = validate({ ...minimal, tool: '' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tool')))
  })

  it('rejects tool string exceeding 128 characters', () => {
    const r = validate({ ...minimal, tool: 'a'.repeat(129) })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tool')))
  })

  it('accepts tool string of exactly 128 characters', () => {
    const r = validate({ ...minimal, tool: 'a'.repeat(128) })
    assert.equal(r.ok, true)
  })

  it('accepts tool as non-empty array', () => {
    const r = validate({ ...minimal, tool: ['chatgpt', 'claude'] })
    assert.equal(r.ok, true)
  })

  it('rejects tool as empty array', () => {
    const r = validate({ ...minimal, tool: [] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tool')))
  })

  it('rejects id exceeding 256 characters', () => {
    const r = validate({ ...minimal, id: 'a'.repeat(257) })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('id')))
  })

  it('accepts id of exactly 256 characters', () => {
    const r = validate({ ...minimal, id: 'a'.repeat(256) })
    assert.equal(r.ok, true)
  })

  it('rejects content array with zero items', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: [] }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('content')))
  })

  it('rejects content string exceeding 1048576 characters', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: 'x'.repeat(1048577) }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('content')))
  })

  it('accepts content string of exactly 1048576 characters', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: 'x'.repeat(1048576) }] })
    assert.equal(r.ok, true)
  })

  it('rejects confidence out of range (above 1)', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', provenance: 'inferred', confidence: 1.5 }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('confidence')))
  })

  it('rejects confidence out of range (below 0)', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', provenance: 'inferred', confidence: -0.1 }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('confidence')))
  })

  it('accepts confidence at boundaries 0 and 1', () => {
    for (const confidence of [0, 0.5, 1]) {
      const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', provenance: 'inferred', confidence }] })
      assert.equal(r.ok, true, `confidence=${confidence} should be valid`)
    }
  })

  it('rejects provenance inferred without confidence', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', provenance: 'inferred' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('confidence')))
  })

  it('rejects provenance extracted with confidence present', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', provenance: 'extracted', confidence: 0.9 }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('confidence')))
  })

  it('accepts provenance extracted without confidence', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: 'source text', provenance: 'extracted' }] })
    assert.equal(r.ok, true)
  })

  it('rejects tokens.input negative', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', tokens: { input: -1, output: 50 } }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tokens.input')))
  })

  it('rejects tokens.output negative', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', tokens: { input: 10, output: -5 } }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tokens.output')))
  })

  it('accepts tokens with zero values', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', tokens: { input: 0, output: 0 } }] })
    assert.equal(r.ok, true)
  })

  it('rejects tool_call missing call_id', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'assistant', content: 'running', tool_calls: [{ name: 'web_search' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('call_id')))
  })

  it('rejects tool_call with empty call_id', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'assistant', content: 'running', tool_calls: [{ call_id: '', name: 'web_search' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('call_id')))
  })

  it('rejects tool_call missing name', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'assistant', content: 'running', tool_calls: [{ call_id: 'c1' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('name')))
  })

  it('rejects tool_call with empty name', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'assistant', content: 'running', tool_calls: [{ call_id: 'c1', name: '' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('name')))
  })

  it('accepts valid tool_calls', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'assistant', content: 'running', tool_calls: [{ call_id: 'c1', name: 'web_search', arguments: { q: 'test' } }] }],
    })
    assert.equal(r.ok, true)
  })

  it('rejects attachment missing id', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: 'see attachment', attachments: [{ mime_type: 'application/pdf' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('attachments') || e.includes('.id')))
  })

  it('rejects attachment missing mime_type', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: 'see attachment', attachments: [{ id: 'att-1' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('mime_type')))
  })

  it('rejects attachment with invalid sha256', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: 'file', attachments: [{ id: 'a1', mime_type: 'text/plain', sha256: 'not-hex' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('sha256')))
  })

  it('accepts attachment with valid sha256', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: 'file', attachments: [{ id: 'a1', mime_type: 'text/plain', sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' }] }],
    })
    assert.equal(r.ok, true)
  })

  it('rejects redactions missing count', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: '[REDACTED]', redactions: { placeholder_format: '[REDACTED]' } }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('count')))
  })

  it('rejects redactions missing placeholder_format', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: '[REDACTED]', redactions: { count: 1 } }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('placeholder_format')))
  })

  it('accepts valid redactions', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: '[REDACTED]', redactions: { count: 1, placeholder_format: '[REDACTED]' } }],
    })
    assert.equal(r.ok, true)
  })

  it('rejects model object at root missing id', () => {
    const r = validate({ ...minimal, model: {} })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('model')))
  })

  it('accepts model at root as string', () => {
    const r = validate({ ...minimal, model: 'claude-opus-4-7' })
    assert.equal(r.ok, true)
  })

  it('accepts model at root as object with id', () => {
    const r = validate({ ...minimal, model: { id: 'claude-opus-4-7', provider: 'anthropic' } })
    assert.equal(r.ok, true)
  })

  it('rejects model object on message missing id', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', model: {} }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('model')))
  })

  it('accepts model on message as string', () => {
    const r = validate({ ...minimal, messages: [{ role: 'assistant', content: 'hi', model: 'gpt-4' }] })
    assert.equal(r.ok, true)
  })

  it('rejects unknown root property', () => {
    const r = validate({ ...minimal, extra_field: 'foo' } as unknown)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('extra_field')))
  })

  it('rejects unknown message property', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: 'hi', sentiment: 'positive' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('sentiment')))
  })

  it('rejects text content block missing text field', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: [{ type: 'text' }] }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('text')))
  })

  it('rejects image content block missing url and data', () => {
    const r = validate({ ...minimal, messages: [{ role: 'user', content: [{ type: 'image', mime_type: 'image/png' }] }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('image')))
  })

  it('rejects citation with non-https url', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: 'text',
        citations: [{ span: [0, 4], source: { url: 'ftp://example.com/doc.pdf' } }],
      }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('source.url') || e.includes('http')))
  })
})

describe('kind+body envelopes', () => {
  const doc = { uacp: '0.6.0', id: 'k1', kind: 'memory', body: { content: 'Prefers dark mode' } }

  it('validates the body against its kind schema', () => {
    assert.deepEqual(validate(doc), { ok: true })
    const bad = validate({ ...doc, body: { content: 'x', confidence: 2 } })
    assert.equal(bad.ok, false)
    assert.ok(bad.errors?.some(e => e.includes('body.confidence')))
  })

  it('passes an unknown kind through', () => {
    assert.deepEqual(validate({ uacp: '0.6.0', id: 'k2', kind: 'vendor/custom', body: { x: 1 } }), { ok: true })
  })

  it('checks the uri and date-time formats', () => {
    const persona = { uacp: '0.6.0', id: 'k3', kind: 'persona', body: { name: 'n', description: 'd', system_prompt: 'p', avatar_url: 'https://example.com/a.png' } }
    assert.deepEqual(validate(persona), { ok: true })
    const badUrl = validate({ ...persona, body: { ...persona.body, avatar_url: 'this is not a url at all!!' } })
    assert.equal(badUrl.ok, false)
    assert.ok(badUrl.errors?.some(e => e.includes('body.avatar_url')))
    const memory = { uacp: '0.6.0', id: 'k4', kind: 'memory', body: { content: 'c', expires_at: '2024-02-29T00:00:00Z' } }
    assert.deepEqual(validate(memory), { ok: true })
    for (const value of ['9999-99-99T99:99:99Z', '2026-02-29T00:00:00Z']) {
      const bad = validate({ ...memory, body: { content: 'c', expires_at: value } })
      assert.equal(bad.ok, false)
      assert.ok(bad.errors?.some(e => e.includes('body.expires_at')))
    }
  })
})

describe('parse', () => {
  it('parses a valid JSON string', () => {
    const doc = parse(JSON.stringify(minimal))
    assert.equal(doc.id, minimal.id)
    assert.equal(doc.tool, minimal.tool)
  })

  it('parses a plain object', () => {
    const doc = parse(minimal)
    assert.equal(doc.uacp, '0.6.0')
  })

  it('throws on invalid document', () => {
    assert.throws(() => parse({ uacp: 'bad', id: '', tool: '', messages: [] }), /UACP parse failed/)
  })
})

describe('serialize', () => {
  it('serializes a valid document to JSON string', () => {
    const json = serialize(minimal)
    const parsed = JSON.parse(json)
    assert.equal(parsed.id, minimal.id)
    assert.equal(parsed.uacp, '0.6.0')
  })

  it('throws on invalid document', () => {
    const bad = { ...minimal, messages: [] } as unknown as UACPDocument
    assert.throws(() => serialize(bad), /UACP serialize failed/)
  })

  it('parse → serialize round-trips cleanly', () => {
    const complex: UACPDocument = {
      uacp: '0.6.0',
      id: 'round-trip-001',
      tool: 'test',
      title: 'Round-trip test',
      created_at: '2026-05-09T00:00:00Z',
      messages: [
        { role: 'user', content: 'Write a bubble sort function' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Here it is:' },
            { type: 'code', code: 'function bubbleSort(arr) { ... }', language: 'javascript' },
          ],
        },
      ],
      metadata: { session: 'abc123' },
    }
    const json = serialize(complex)
    const back = parse(json)
    assert.equal(back.id, complex.id)
    assert.equal(back.title, complex.title)
    assert.equal(back.messages.length, 2)
  })
})

function getExpect(doc: Record<string, unknown>): string | undefined {
  const meta = doc.metadata as Record<string, unknown> | undefined
  if (!meta) return undefined
  return (meta['uacp.test.expect'] as string | undefined)
}

function isConversationDoc(doc: Record<string, unknown>): boolean {
  return 'uacp' in doc || 'messages' in doc
}

describe('test vectors — valid', () => {
  const vectorFiles = readdirSync(VECTORS_DIR).filter(f => f.endsWith('.uacp.json'))
  for (const file of vectorFiles) {
    const doc = JSON.parse(readFileSync(join(VECTORS_DIR, file), 'utf-8')) as Record<string, unknown>
    const expect = getExpect(doc)

    if (!isConversationDoc(doc)) {
      it(`skips non-conversation vector ${file}`, () => {})
      continue
    }

    if (expect === 'invalid') {
      it(`rejects (per metadata) ${file}`, () => {
        const r = validate(doc)
        assert.equal(r.ok, false, `Expected invalid per metadata but got ok=true for ${file}`)
      })
    } else {
      it(`accepts ${file}`, () => {
        const r = validate(doc)
        assert.equal(r.ok, true, `Expected valid but got errors: ${JSON.stringify(r.errors)}`)
      })
    }
  }
})

describe('test vectors — invalid', () => {
  const invalidDir = join(VECTORS_DIR, 'invalid')
  const vectorFiles = readdirSync(invalidDir).filter(f => f.endsWith('.uacp.json'))
  for (const file of vectorFiles) {
    it(`rejects ${file}`, () => {
      const doc = JSON.parse(readFileSync(join(invalidDir, file), 'utf-8'))
      const r = validate(doc)
      assert.equal(r.ok, false, `Expected invalid but got ok=true for ${file}`)
      assert.ok(r.errors && r.errors.length > 0, `Expected errors array to be non-empty for ${file}`)
    })
  }
})

const MEMORY_VECTORS_DIR = join(__dirname, '../../../../conformance/memory/vectors')

describe('memory semantic checks (uacp#107)', () => {
  const memory = (body: Record<string, unknown>) => ({ uacp: '0.6.0', id: 'mem-1', kind: 'memory', body })

  it('accepts a schema-valid, semantically valid memory', () => {
    const r = validate(memory({ content: 'Prefers dark mode', topics: ['preference'], lifecycle: { action: 'create', status: 'active', revision: 1 } }))
    assert.deepEqual(r, { ok: true })
  })

  it('rejects a broken lifecycle revision chain like validate.js', () => {
    const r = validate(memory({ content: 'x', lifecycle: { action: 'update', status: 'active', revision: 3, previous_revision: { memory_id: 'mem-1', revision: 1 } } }))
    assert.equal(r.ok, false)
    assert.ok(r.errors!.includes('body.lifecycle: MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION'), JSON.stringify(r.errors))
  })

  it('rejects a predecessor that names another memory', () => {
    const r = validate(memory({ content: 'x', lifecycle: { action: 'update', status: 'active', revision: 2, previous_revision: { memory_id: 'mem-other', revision: 1 } } }))
    assert.ok(r.errors!.includes('body.lifecycle: MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH'), JSON.stringify(r.errors))
  })

  it('rejects sensitive memories without explicit consent', () => {
    const r = validate(memory({ content: 'x', category: 'health' }))
    assert.ok(r.errors!.includes('body.lifecycle: MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT'), JSON.stringify(r.errors))
  })

  it('rejects unknown unnamespaced topics and profile schemas', () => {
    const r = validate(memory({ content: 'x', topics: ['hobbies'], profile_link: { schema_id: 'custom', schema_version: 1, field: 'f' } }))
    assert.ok(r.errors!.includes('body: MEMORY_TOPIC_UNKNOWN_UNNAMESPACED'), JSON.stringify(r.errors))
    assert.ok(r.errors!.includes('body: MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA'), JSON.stringify(r.errors))
  })

  it('accepts namespaced topics and profile schemas', () => {
    assert.deepEqual(validate(memory({ content: 'x', topics: ['acme/hobbies'], profile_link: { schema_id: 'acme/crm', schema_version: 1, field: 'f' } })), { ok: true })
  })
})

describe('conformance/memory vectors', () => {
  const files = readdirSync(MEMORY_VECTORS_DIR).filter(f => f.endsWith('.json')).sort()
  it('finds the shared memory vectors', () => {
    assert.ok(files.length >= 9, `expected at least 9 vectors, found ${files.length}`)
  })
  for (const file of files) {
    const vector = JSON.parse(readFileSync(join(MEMORY_VECTORS_DIR, file), 'utf-8'))
    it(`${vector.expected_outcome} ${file}`, () => {
      const errors = validateMemorySequence(vector.memories || [], { requireSignedEnvelopes: vector.require_signed_envelopes === true })
      assert.equal(errors.length === 0 ? 'accepted' : 'rejected', vector.expected_outcome, JSON.stringify(errors))
      if (vector.expected_error) assert.ok(errors.includes(vector.expected_error), JSON.stringify(errors))
    })
  }
})
