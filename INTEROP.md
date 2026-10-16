# UACP Interoperability Matrix

This file tracks independently-verified UACP implementations. To register your implementation, open a PR that adds a row to the table below and includes a harness log as a comment on the PR.

## How to verify

```bash
# Clone this repo
git clone https://github.com/hn2/uacp.git
cd uacp
npm install

# Self-test (reference harness, no impl):
node conformance/harness/run.js

# Test your implementation:
node conformance/harness/run.js --level L3 --impl ./path/to/my-impl.js
```

Paste the full output as a PR comment. PRs without a harness log will not be merged.

## Verified implementations

| Implementation | Language | Core level | Extensions declared | Verified date | Harness SHA | Impl SHA | Notes |
|---|---|---|---|---|---|---|---|
| UACP reference harness | JavaScript (Node.js) | L3 | uacp-encryption, uacp-sync-event, uacp-device-registration, uacp-event-payload, uacp-scope-identifier, uacp-member-set, uacp-promotion-event, uacp-withdraw-event, uacp-audit-event | 2026-05-14 | `master` | — | Ships with this repo |

## Extension coverage matrix

A second row can declare which extensions pass. Leave blank if not tested.

| Implementation | sync-event (#36) | identity-chain (#42) | event-payload (#43) | vector-clock (#37) | scope-identifier (#38) | member-set (#39) | promotion (#40) | withdraw (#41) | audit (#44) |
|---|---|---|---|---|---|---|---|---|---|
| UACP reference harness | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Adding an entry

1. Fork the repo and add a row to both tables.
2. Run `node conformance/harness/run.js --impl ./your-impl.js` and paste the output.
3. Open a PR. Title: `interop: <language> — <impl name> — <core level>`.
4. A maintainer will verify and merge.
