# Signed Event Envelope (Context Sharing) v1

This document defines the canonical envelope for signed context-sharing events. It is used to transport event payloads between devices and scopes with integrity and replay protection.

## §1 — Fields

All fields are REQUIRED unless stated otherwise.

| Field | Type | Notes |
|---|---|---|
| `event_id` | UUID string | Unique per event (idempotency key). |
| `event_type` | string | E.g. `promotion`, `withdraw`, `scope-key-envelope` (payload-defined). |
| `scope_id` | string | The target scope identifier. |
| `author_device_key` | base64 string | ed25519 public key bytes (32 bytes). |
| `payload` | object | Event-type specific payload object. |
| `vector_clock` | object | Map of `device_id → int counter`. |
| `timestamp` | ISO 8601 string | UTC timestamp (`...Z`). |
| `signature` | hex string | ed25519 signature over canonical JSON bytes (see §2). |

## §2 — Signing

1. Serialize the envelope to canonical JSON:
   1. UTF-8 encoding.
   2. Object keys sorted lexicographically at every object level.
   3. No extra whitespace.
2. Remove the `signature` field from the serialized object.
3. Sign the resulting canonical JSON bytes with the author device ed25519 private key.
4. Encode the signature bytes as lowercase hex and set `signature`.

Verifiers MUST repeat the same canonicalization and verify the ed25519 signature using `author_device_key`.

## §3 — JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SignedEventEnvelope",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "event_id",
    "event_type",
    "scope_id",
    "author_device_key",
    "payload",
    "vector_clock",
    "timestamp",
    "signature"
  ],
  "properties": {
    "event_id": { "type": "string", "format": "uuid" },
    "event_type": { "type": "string", "minLength": 1, "maxLength": 128 },
    "scope_id": { "type": "string", "minLength": 1, "maxLength": 256 },
    "author_device_key": {
      "type": "string",
      "pattern": "^[A-Za-z0-9+/]+={0,2}$",
      "description": "Base64-encoded 32-byte ed25519 public key"
    },
    "payload": { "type": "object" },
    "vector_clock": {
      "type": "object",
      "additionalProperties": { "type": "integer", "minimum": 0 },
      "description": "Map of device_id -> counter"
    },
    "timestamp": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$"
    },
    "signature": {
      "type": "string",
      "pattern": "^[0-9a-f]+$",
      "minLength": 128,
      "maxLength": 256,
      "description": "ed25519 signature bytes encoded as lowercase hex"
    }
  }
}
```

## §4 — Example

```json
{
  "event_id": "b5b2e1af-8ac4-4b46-9cf5-0b64e9b2c4bb",
  "event_type": "promotion",
  "scope_id": "4a0a0f7f-0c5f-4ab8-9b0c-88d0b4f00b3a",
  "author_device_key": "cHVibGljLWtleS1iYXNlNjQtMzItYnl0ZXM=",
  "payload": {
    "event_type": "promotion",
    "artifact_id": "1f83d9ab-6b2e-4b9a-a3e7-1ee3cf3c6a23",
    "from_scope_id": "11111111-1111-1111-1111-111111111111",
    "to_scope_id": "4a0a0f7f-0c5f-4ab8-9b0c-88d0b4f00b3a",
    "re_encrypted_body": "YmFzZTY0LWJsb2I=",
    "scope_key_id_used": "d8b3f9a1-0b0a-4a2e-a5b1-4aa7c0e5d3b6"
  },
  "vector_clock": { "device-A": 3, "device-B": 1 },
  "timestamp": "2026-05-16T00:00:00Z",
  "signature": "00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff"
}
```

