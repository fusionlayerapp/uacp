# UACP Governance

This document describes how the Unified AI Context Protocol (UACP) is
maintained, how changes are proposed and accepted, and how decisions are
made until community governance is established.

## 1. Stewardship

UACP was drafted by the FusionLayer team and is currently stewarded by them
until the public repository (`github.com/hn2/uacp`) opens to external
contribution. Stewardship means:

- Accepting and reviewing pull requests.
- Publishing releases and maintaining the conformance registry.
- Enforcing the process in this document.

When at least three independent third-party implementations have reached L2+
conformance, stewardship transfers to a lightweight editor group of no
fewer than three people from at least two organizations. Until then, the
steward has final say on ambiguous decisions but MUST document the rationale.

## 2. Change process

Every change lands through a pull request. Changes are categorized as:

- **Editorial** — typo, clarification, non-normative rewording. Merged at
  steward discretion after one review. Patch version bump.
- **Additive** — new optional field, new enum value explicitly documented
  as "readers MUST accept unknown values", new test vector, new conformance
  profile. Merged after two reviews from independent reviewers. Minor
  version bump.
- **Breaking** — anything matching §12 of the spec's "What counts as
  breaking" list. Requires a written rationale, a 2-week public comment
  window, and sign-off from the steward (or, post-transfer, two of three
  editors). Major version bump.

## 3. Versioning

UACP follows [Semantic Versioning 2.0.0](https://semver.org).

- **MAJOR** — breaking changes (see spec §12).
- **MINOR** — additive, backward-compatible.
- **PATCH** — editorial.

The v1.0 freeze gate is:

1. At least three independent L2+ implementations verified.
2. Zero open "breaking" issues.
3. A 4-week public-comment window on a candidate `v1.0.0-rc` release.
4. Stewardship transferred or explicitly retained with rationale.

## 4. Compatibility guarantees

Within a major version:
- No required field is removed.
- No optional field is made required.
- No enum value is removed or repurposed.
- Encryption parameters locked in spec §6 are not changed.

These guarantees begin at v1.0.0. Pre-1.0 drafts may break compatibility on
minor bumps, and SHOULD call out breakage in the CHANGELOG.

## 5. Intellectual property

- The spec text (`README.md`, `CONFORMANCE.md`, `GOVERNANCE.md`, `CHANGELOG.md`)
  is licensed under CC BY 4.0.
- Schemas (`schema/*.json`), test vectors (`test-vectors/*.json`), and any
  reference code are licensed under the MIT License.
- See `LICENSE` for full text.
- Contributors certify that they have the right to contribute under these
  licenses (the [Developer Certificate of Origin](https://developercertificate.org)
  applies to all PRs; sign commits with `git commit -s`).
- The steward and contributors make **no patent claims** against conforming
  implementations of UACP. This is a non-assertion, not a grant — if the
  spec incorporates prior third-party IP, that will be disclosed in a
  dedicated NOTICE file before inclusion.

## 6. Security issues

Security-relevant defects (especially in the encryption envelope or
conformance harness) MUST be reported privately to the steward before
public disclosure. The steward will publish a fix and coordinate the
advisory within 14 days of confirmation, unless an earlier public
disclosure is necessary to prevent ongoing harm.

Contact: See `SECURITY.md` in this repository for the current responsible disclosure contact.

## 7. Media type and file extension

UACP uses the media type `application/uacp+json` and the file extension
`.uacp.json`. IANA provisional registration is planned before v1.0.0.

## 8. Amending this document

Changes to `GOVERNANCE.md` follow the "breaking" process in §2 — because
governance changes are, by definition, not editorial.
