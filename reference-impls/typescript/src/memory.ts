// Semantic checks for kind: memory envelopes. Mirrors lib/memory-lifecycle.js,
// lib/memory-topics.js, lib/memory-profile.js and conformance/memory/run.js so
// the reference validator rejects exactly what validate.js rejects (uacp#107).
import { createHash } from 'node:crypto'

type Obj = Record<string, unknown>
type Ref = { memory_id?: unknown; revision?: unknown }

const SENSITIVE_CATEGORIES = new Set(['health', 'financial'])
const ACTIVE_ACTIONS = new Set(['create', 'confirm', 'update', 'supersede', 'rollback'])
const CORE_TOPICS = new Set([
  'accessibility', 'career', 'education', 'family', 'finance', 'health',
  'identity', 'location', 'preference', 'project', 'relationship',
])
const CORE_METADATA_KEYS = new Set(['importance', 'locale', 'effective_from'])
const CORE_PROFILE_SCHEMAS = new Set(['user', 'project', 'team'])
const NAMESPACED_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/
const SIGNATURE_RE = /^sha256:[a-f0-9]{64}$/

function hasReference(references: unknown): boolean {
  return Array.isArray(references) && references.length > 0
}

export function validateMemoryLifecycle(body: Obj, { memoryId }: { memoryId?: string } = {}): string[] {
  const errors: string[] = []

  if (SENSITIVE_CATEGORIES.has(body.category as string) && body.consent !== 'explicit') {
    errors.push('MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT')
  }

  const lifecycle = body.lifecycle as Obj | undefined
  if (!lifecycle) return errors

  const { action, status, revision } = lifecycle as { action?: string; status?: string; revision?: number }
  const previousRevision = lifecycle.previous_revision as Ref | undefined

  if ((revision as number) > 1 && !previousRevision) {
    errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_REQUIRED')
  }
  if (revision === 1 && previousRevision) {
    errors.push('MEMORY_LIFECYCLE_INITIAL_REVISION_HAS_PREDECESSOR')
  }
  if (memoryId && previousRevision && previousRevision.memory_id !== memoryId) {
    errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH')
  }
  if (previousRevision && previousRevision.revision !== (revision as number) - 1) {
    errors.push('MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION')
  }
  if (action === 'create' && revision !== 1) {
    errors.push('MEMORY_LIFECYCLE_CREATE_MUST_START_AT_REVISION_ONE')
  }
  if (action === 'supersede' && !hasReference(body.supersedes)) {
    errors.push('MEMORY_LIFECYCLE_SUPERSEDE_REQUIRES_SUPERSEDES')
  }
  if (action === 'tombstone' && status !== 'tombstoned') {
    errors.push('MEMORY_LIFECYCLE_TOMBSTONE_REQUIRES_TOMBSTONED_STATUS')
  }
  if (status === 'tombstoned' && action !== 'tombstone') {
    errors.push('MEMORY_LIFECYCLE_TOMBSTONED_STATUS_REQUIRES_TOMBSTONE_ACTION')
  }
  if (action === 'expire' && status !== 'expired') {
    errors.push('MEMORY_LIFECYCLE_EXPIRE_REQUIRES_EXPIRED_STATUS')
  }
  if (status === 'expired' && action !== 'expire') {
    errors.push('MEMORY_LIFECYCLE_EXPIRED_STATUS_REQUIRES_EXPIRE_ACTION')
  }
  if (action === 'rollback' && (!previousRevision || !hasReference(body.derived_from))) {
    errors.push('MEMORY_LIFECYCLE_ROLLBACK_REQUIRES_LINEAGE')
  }
  if (ACTIVE_ACTIONS.has(action as string) && status !== 'active') {
    errors.push('MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS')
  }

  return errors
}

export function validateMemoryTopics(body: Obj): string[] {
  const errors: string[] = []
  for (const topic of (body.topics as string[] | undefined) || []) {
    if (!CORE_TOPICS.has(topic) && !NAMESPACED_RE.test(topic)) {
      errors.push('MEMORY_TOPIC_UNKNOWN_UNNAMESPACED')
    }
  }
  for (const entry of (body.metadata as Array<{ key: string }> | undefined) || []) {
    if (!NAMESPACED_RE.test(entry.key) && !CORE_METADATA_KEYS.has(entry.key)) {
      errors.push('MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY')
    }
  }
  return [...new Set(errors)]
}

export function validateMemoryProfile(body: Obj): string[] {
  const link = body.profile_link as { schema_id: string } | undefined
  if (!link) return []
  return !CORE_PROFILE_SCHEMAS.has(link.schema_id) && !NAMESPACED_RE.test(link.schema_id)
    ? ['MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA']
    : []
}

// Same serialization as canonicalJSON() in signing.js.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const obj = value as Obj
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function validateEnvelopeSignature(memory: Obj): string | null {
  const signature = memory.signature
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) {
    return 'MEMORY_SEQUENCE_SIGNATURE_REQUIRED'
  }
  const { signature: _signature, ...unsigned } = memory
  const expected = `sha256:${createHash('sha256').update(canonicalJson(unsigned)).digest('hex')}`
  return signature === expected ? null : 'MEMORY_SEQUENCE_SIGNATURE_INVALID'
}

function referenceKey(reference: Ref): string {
  return `${reference.memory_id}@${reference.revision}`
}

// Validates an ordered sequence of memory revisions, as conformance/memory/run.js does.
export function validateMemorySequence(
  memories: Obj[],
  { requireSignedEnvelopes = false }: { requireSignedEnvelopes?: boolean } = {},
): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const profileClaims = new Map<string, string[]>()

  for (const memory of memories) {
    if (requireSignedEnvelopes) {
      const signatureError = validateEnvelopeSignature(memory)
      if (signatureError) errors.push(signatureError)
    }

    const body = (memory.body || {}) as Obj
    const lifecycle = body.lifecycle as Obj | undefined
    if (!lifecycle) {
      errors.push('MEMORY_SEQUENCE_LIFECYCLE_REQUIRED')
      continue
    }

    errors.push(...validateMemoryLifecycle(body, { memoryId: memory.id as string }))
    errors.push(...validateMemoryProfile(body))
    const key = `${memory.id}@${lifecycle.revision}`
    if (seen.has(key)) {
      errors.push('MEMORY_SEQUENCE_DUPLICATE_REVISION')
      continue
    }

    const previousRevision = lifecycle.previous_revision as Ref | undefined
    if (previousRevision) {
      if (!seen.has(referenceKey(previousRevision))) {
        errors.push('MEMORY_SEQUENCE_PREDECESSOR_NOT_FOUND')
      }
      if (previousRevision.revision !== (lifecycle.revision as number) - 1) {
        errors.push('MEMORY_SEQUENCE_NON_CONTIGUOUS_REVISION')
      }
    }

    for (const reference of [...((body.supersedes as Ref[]) || []), ...((body.derived_from as Ref[]) || [])]) {
      if (!seen.has(referenceKey(reference))) {
        errors.push('MEMORY_SEQUENCE_REFERENCE_NOT_FOUND')
      }
    }

    seen.add(key)

    const link = body.profile_link as { schema_id: string; schema_version: unknown; field: unknown; conflict?: string } | undefined
    const status = (lifecycle.status as string) || 'active'
    if (link && status === 'active') {
      const claimKey = `${memory.subject || 'anonymous'}|${memory.scope || 'individual'}|${link.schema_id}@${link.schema_version}|${link.field}`
      const claims = profileClaims.get(claimKey) || []
      claims.push(link.conflict || 'none')
      profileClaims.set(claimKey, claims)
    }
  }

  for (const claims of profileClaims.values()) {
    if (claims.length > 1 && claims.some(conflict => conflict !== 'unresolved')) {
      errors.push('MEMORY_PROFILE_FIELD_CONFLICT')
    }
  }

  return [...new Set(errors)]
}
