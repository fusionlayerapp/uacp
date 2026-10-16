# Custom Kind Registry and Namespace Governance v1

This document specifies the namespace format, registration process, and governance rules for custom UACP event kinds. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## §1 — Namespace Format

Custom kind names MUST follow the format:

```
<vendor_did>/<kind_name>
```

Example: `did:web:fusionlayer.app/CROWD_WISDOM_SIGNAL`

- `<vendor_did>` MUST be a valid Decentralized Identifier (DID) string as defined by the W3C DID Core specification.
- `<kind_name>` MUST match the pattern `[A-Z][A-Z0-9_]{0,127}` (uppercase ASCII letters, digits, and underscores; 1–128 characters; MUST start with a letter).
- The full namespace string MUST NOT exceed 512 characters.

## §2 — Reserved Prefixes

The following kind names and prefixes are reserved for core UACP use and MUST NOT be claimed as custom kind namespaces:

- `CONVERSATION`
- `CONTEXT_SHARED`
- `CONTEXT_RECEIVED`
- `TRACE`
- `PLAYBOOK`

Any `POST /kinds/claim` request whose `kind_name` matches a reserved prefix MUST be rejected with error code `RESERVED_NAMESPACE`.

## §3 — Registry API

The authoritative UACP kind registry is hosted at `https://registry.uacp.dev`.

### §3.1 — List All Registrations

```
GET https://registry.uacp.dev/kinds
```

Returns an array of `KindRegistration` objects for all registered namespace prefixes.

### §3.2 — Lookup by Prefix

```
GET https://registry.uacp.dev/kinds/:prefix
```

`:prefix` is the URL-encoded vendor DID. Returns the `KindRegistration` for that prefix, or HTTP 404 if not found.

### §3.3 — Claim a Namespace

```
POST https://registry.uacp.dev/kinds/claim
Content-Type: application/json

{
  "namespace_prefix": "did:web:example.com",
  "vendor_did": "did:web:example.com",
  "display_name": "Example Corp",
  "description": "Custom kinds for Example Corp integrations.",
  "kinds": [
    {
      "name": "MY_CUSTOM_EVENT",
      "schema_url": "https://example.com/uacp-schemas/MY_CUSTOM_EVENT.json",
      "status": "active"
    }
  ]
}
```

On success, the registry MUST return HTTP 201 with the created `KindRegistration`.

If the namespace prefix is already registered, the registry MUST return HTTP 409 with error code `NAMESPACE_ALREADY_CLAIMED`.

If the namespace prefix matches a reserved prefix, the registry MUST return HTTP 422 with error code `RESERVED_NAMESPACE`.

If DID verification fails, the registry MUST return HTTP 422 with error code `DID_VERIFICATION_FAILED`.

## §4 — Types

```typescript
interface KindRegistration {
  namespace_prefix: string;
  vendor_did: string;
  display_name: string;
  description: string;
  kinds: KindEntry[];
  registered_at: string; // ISO 8601
}

interface KindEntry {
  name: string;
  schema_url: string;
  status: 'active' | 'deprecated';
}
```

## §5 — Registration Rules

### §5.1 — First-Registered Wins

The first successful `POST /kinds/claim` for a given `namespace_prefix` establishes ownership. Subsequent claims for the same prefix MUST be rejected with `NAMESPACE_ALREADY_CLAIMED`. The registry MUST NOT allow transfer of ownership except through an explicit transfer API (not specified in v1).

### §5.2 — DID Verification

Before accepting a claim, the registry MUST verify the `vendor_did` as follows:

- For `did:web:` DIDs, the registry MUST retrieve the DID Document at `https://<host>/.well-known/did.json` and confirm it is a valid DID Document.
- The request to `/.well-known/did.json` MUST be made over HTTPS.
- If the DID Document cannot be fetched or does not conform to the W3C DID Core specification, the claim MUST be rejected with `DID_VERIFICATION_FAILED`.

### §5.3 — Deprecated Kinds

A kind MAY be marked `"status": "deprecated"` by the namespace owner. Receivers MUST continue to accept events of deprecated kinds for a minimum of 12 months after the deprecation date. After the 12-month window, receivers MAY begin rejecting deprecated kinds.

The deprecation date MUST be recorded as an additional `deprecated_at` field (ISO 8601) on the `KindEntry` when status is set to `"deprecated"`.

## §6 — Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `NAMESPACE_ALREADY_CLAIMED` | 409 | The requested namespace prefix is already registered. |
| `RESERVED_NAMESPACE` | 422 | The requested namespace prefix matches a core UACP reserved kind. |
| `DID_VERIFICATION_FAILED` | 422 | The vendor DID could not be verified via its `/.well-known/did.json` document. |

## §7 — Test Vectors

Conformance implementations MUST pass all cases in `conformance/vectors/custom-kinds.json`. The five named cases are:

| Vector name | Description |
|---|---|
| `test_first_claim_succeeds` | A valid claim for an unclaimed namespace with a verifiable `did:web:` DID. Result: HTTP 201, `KindRegistration` returned. |
| `test_duplicate_claim_returns_409` | A second claim for the same `namespace_prefix` after a successful first claim. Result: HTTP 409, error `NAMESPACE_ALREADY_CLAIMED`. |
| `test_core_kind_prefix_reserved` | A claim whose `namespace_prefix` vendor DID resolves to a kind named `TRACE`. Result: HTTP 422, error `RESERVED_NAMESPACE`. |
| `test_did_web_verified_before_registration` | A claim with a `did:web:` DID whose `/.well-known/did.json` endpoint returns HTTP 404. Result: HTTP 422, error `DID_VERIFICATION_FAILED`. |
| `test_deprecated_kind_still_accepted_by_receiver` | An event using a kind whose registry entry has `status: "deprecated"` and `deprecated_at` within the last 12 months. Result: receiver MUST accept the event. |

## §8 — Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-17 | Initial spec. |
