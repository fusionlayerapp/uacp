#!/usr/bin/env node
// UACP signing utilities — ed25519 verify + RFC 8785 canonical JSON
//
// Canonical JSON: uses @noble/ed25519 for ed25519 verify.
// RFC 8785 (JSON Canonicalization Scheme) is implemented directly:
//   - UTF-8 encoding
//   - Object keys sorted lexicographically at every object level
//   - No extra whitespace
//   - Numbers serialized per ES2019 (JSON.stringify behaviour)
//
// canonicalize npm package is ESM-only and incompatible with this CommonJS
// repo, so RFC 8785 is implemented inline.

'use strict'

const { createHash } = require('node:crypto')
const ed = require('@noble/ed25519')

// @noble/ed25519 v3 requires sha512 to be wired up in Node.js environments.
// The async variant uses webcrypto (available in Node 18+), but the sync
// variant (needed for CommonJS callers) requires explicit wiring.
ed.hashes.sha512 = (...msgs) => {
  const h = createHash('sha512')
  for (const m of msgs) h.update(m)
  return h.digest()
}

function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value)
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJSON).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k]))
    return '{' + pairs.join(',') + '}'
  }
  return JSON.stringify(value)
}

// verifySignedEvent — verifies the ed25519 signature on a signed event envelope.
//
// envelope: the full parsed signed-event-envelope object
// options.publicKey: hex or base64 string of the 32-byte ed25519 public key
//   (if omitted, falls back to envelope.author_device_key)
//
// Returns { valid: boolean, error?: string }
function verifySignedEvent(envelope, { publicKey } = {}) {
  try {
    const keyStr = publicKey || envelope.author_device_key
    if (!keyStr || typeof keyStr !== 'string') {
      return { valid: false, error: 'missing public key' }
    }

    // Decode public key — accept base64 or hex
    let keyBytes
    if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
      keyBytes = hexToBytes(keyStr)
    } else {
      keyBytes = base64ToBytes(keyStr)
    }
    if (keyBytes.length !== 32) {
      return { valid: false, error: `public key must be 32 bytes, got ${keyBytes.length}` }
    }

    const sigHex = envelope.signature
    if (typeof sigHex !== 'string' || !/^[0-9a-f]+$/.test(sigHex) || sigHex.length !== 128) {
      return { valid: false, error: 'signature must be 128 hex chars (64 bytes)' }
    }
    const sigBytes = hexToBytes(sigHex)

    // Build payload: envelope without signature field, canonical JSON
    const payload = Object.fromEntries(
      Object.entries(envelope).filter(([k]) => k !== 'signature')
    )
    const canonical = canonicalJSON(payload)
    const msgBytes = new TextEncoder().encode(canonical)

    const valid = ed.verify(sigBytes, msgBytes, keyBytes)
    if (!valid) {
      return { valid: false, error: 'signature verification failed' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

module.exports = { verifySignedEvent, canonicalJSON }
