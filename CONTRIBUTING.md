# Contributing

## Workflow
1. Open an issue for spec changes.
2. Add or update test vectors in `test-vectors/`.
3. Keep schema + README + conformance docs aligned.
4. Run `node validate.js` before opening PR.

## PR Requirements
- Explain normative impact (MUST/SHOULD/MAY changes).
- Include compatibility notes for previous minor versions.
- Add negative vectors for invalid cases.
