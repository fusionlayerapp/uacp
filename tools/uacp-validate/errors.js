'use strict'

const UACP_ERROR_CATALOG = Object.freeze({
  E_UACP_ENVELOPE_INVALID: {
    code: 'E_UACP_ENVELOPE_INVALID',
    level: 'ERROR',
    category: 'schema',
    retryable: false,
    message: 'UACP envelope is missing required fields or has an invalid schema version.',
    hint: 'Ensure uacp_version=1, kind, id, schema_version, version, subject, author, created_at, signature, and body are present.',
  },
  E_UACP_SIGNATURE_MISMATCH: {
    code: 'E_UACP_SIGNATURE_MISMATCH',
    level: 'SECURITY',
    category: 'crypto',
    retryable: false,
    message: 'UACP envelope canonical SHA-256 or Ed25519 signature does not match the payload.',
    hint: 'Recompute canonicalJson(envelopeWithoutSignature) and verify the Ed25519 signing key.',
  },
  E_UACP_SENSITIVE_UNENCRYPTED: {
    code: 'E_UACP_SENSITIVE_UNENCRYPTED',
    level: 'SECURITY',
    category: 'privacy',
    retryable: false,
    message: 'Sensitive UACP memory category (health, financial) must use an encrypted envelope.',
    hint: 'Wrap the payload in an encrypted envelope (XChaCha20-Poly1305 / AES-256-GCM) before export.',
  },
  E_UACP_VECTOR_CLOCK_CONFLICT: {
    code: 'E_UACP_VECTOR_CLOCK_CONFLICT',
    level: 'WARN',
    category: 'sync',
    retryable: true,
    message: 'Concurrent vector clock update detected across UACP event chain.',
    hint: 'Run deterministic CRDT merge or prompt user conflict resolution.',
  },
  E_UACP_RETENTION_EXPIRED: {
    code: 'E_UACP_RETENTION_EXPIRED',
    level: 'INFO',
    category: 'lifecycle',
    retryable: false,
    message: 'UACP memory item has passed its retention policy TTL (GDPR Art. 17).',
    hint: 'Purge or re-consent the expired memory item.',
  },
})

function lookupUacpError(codeOrErr) {
  if (!codeOrErr) return null
  const raw = typeof codeOrErr === 'string' ? codeOrErr : (codeOrErr.code || codeOrErr.message || '')
  const upper = raw.trim().toUpperCase()
  if (UACP_ERROR_CATALOG[upper]) return UACP_ERROR_CATALOG[upper]
  if (raw.includes('signature_mismatch') || raw.includes('signature_invalid')) {
    return UACP_ERROR_CATALOG.E_UACP_SIGNATURE_MISMATCH
  }
  if (raw.includes('missing_required') || raw.includes('invalid')) {
    return UACP_ERROR_CATALOG.E_UACP_ENVELOPE_INVALID
  }
  return null
}

module.exports = { UACP_ERROR_CATALOG, lookupUacpError }
