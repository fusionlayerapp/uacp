# UACP Version Negotiation v1

This document specifies version negotiation and downgrade-protection rules for UACP implementations. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## §1 — Version Header

Every UACP event transport MUST include the following HTTP header (or equivalent transport-layer field):

```
X-UACP-Version: <semver>
```

`<semver>` MUST be a valid Semantic Versioning 2.0.0 string (e.g. `1.0.0`, `2.1.3`). A version string that does not conform to SemVer MUST be rejected with `INVALID_VERSION_STRING`.

## §2 — Negotiation Rules

The following four rules govern version negotiation between a sender and a receiver.

**Rule 1.** A receiver MUST accept events whose declared version is greater than or equal to the receiver's `minimum_version`.

**Rule 2.** A receiver MUST reject events whose declared version is less than the receiver's `minimum_version` with error code `DOWNGRADE_REJECTED`.

**Rule 3.** A sender SHOULD send events using the highest UACP version it supports.

**Rule 4.** A receiver MUST process an accepted event using the semantics of the version declared in the event's `X-UACP-Version` header, not the receiver's own maximum version.

## §3 — Downgrade Attack Prevention

A downgrade attack occurs when a man-in-the-middle modifies the `X-UACP-Version` header to a lower value in order to force the receiver to process an event under a weaker or deprecated version's semantics.

Receivers MUST defend against downgrade attacks as follows:

1. The receiver's `minimum_version` MUST be persisted out-of-band (e.g. in configuration) and MUST NOT be derived from incoming event headers.
2. Any event declaring a version below `minimum_version` MUST be rejected with `DOWNGRADE_REJECTED` regardless of the sender's claimed capabilities.
3. Implementations MUST NOT silently coerce a received version to a higher version.

## §4 — Types

```typescript
interface ReceiverVersionPolicy {
  minimum_version: string;   // SemVer string; REQUIRED
  maximum_version?: string;  // SemVer string; OPTIONAL — no upper bound if absent
}

interface VersionNegotiationResult {
  accepted: boolean;
  declared_version: string;      // The version string from the event header
  effective_version: string;     // Version used for processing (equals declared_version when accepted)
  error?: VersionErrorCode;
}

type VersionErrorCode =
  | 'VERSION_INCOMPATIBLE'
  | 'DOWNGRADE_REJECTED'
  | 'INVALID_VERSION_STRING';
```

`VERSION_INCOMPATIBLE` is returned when the declared version is structurally valid but falls outside the range the receiver can process for reasons other than a downgrade policy violation (e.g. declared version exceeds `maximum_version`).

`DOWNGRADE_REJECTED` is returned when the declared version is below `minimum_version`.

`INVALID_VERSION_STRING` is returned when the declared version string does not conform to SemVer 2.0.0.

## §5 — Edge Cases

### v1 sender, v2 receiver

If a receiver has `minimum_version: "2.0.0"` and receives an event with `X-UACP-Version: 1.0.0`, the receiver MUST reject with `DOWNGRADE_REJECTED`. The receiver MUST NOT attempt to process the event under v1 semantics.

### Non-semver version string

If the `X-UACP-Version` header value is not a valid SemVer string (e.g. `"latest"`, `"1.0"`, `"v2"`) the receiver MUST reject with `INVALID_VERSION_STRING` before performing any other validation.

### Pinned minimum version

An operator MAY configure a pinned `minimum_version` to enforce a hard floor. Once pinned, the receiver MUST apply Rule 2 regardless of what any individual sender claims its version to be. The pin MUST NOT be overridden by an incoming event field.

### v2 sender, v1 receiver

If a receiver has no configured `maximum_version` it MUST accept events from any version ≥ `minimum_version` and process them under the declared version's semantics per Rule 4.

## §6 — Test Vectors

Conformance implementations MUST pass all cases in `conformance/vectors/versioning.json`. The five named cases are:

| Vector name | Description |
|---|---|
| `test_v2_sender_v2_receiver_accepted` | Sender declares `2.0.0`; receiver minimum is `2.0.0`. Result: accepted, effective version `2.0.0`. |
| `test_v1_sender_v2_minimum_receiver_rejected` | Sender declares `1.0.0`; receiver minimum is `2.0.0`. Result: rejected, error `DOWNGRADE_REJECTED`. |
| `test_v2_sender_v1_receiver_downgrade_accepted` | Sender declares `2.0.0`; receiver minimum is `1.0.0`, no maximum. Result: accepted, effective version `2.0.0`. |
| `test_minimum_version_pin_prevents_downgrade_attack` | Receiver minimum pinned to `1.5.0`; incoming event declares `1.4.9`. Result: rejected, error `DOWNGRADE_REJECTED`. |
| `test_invalid_version_string_rejected` | Sender declares `"v2"` (non-semver). Result: rejected, error `INVALID_VERSION_STRING`. |

## §7 — Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-17 | Initial spec. |
