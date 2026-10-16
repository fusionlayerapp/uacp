# uacp-validate

A minimal Node.js validator for UACP v1 artifact envelopes. It reads a YAML file,
checks that all required envelope fields are present and correctly typed (per
`spec/v1/envelope.schema.json`), and verifies the SHA-256 integrity signature. Run it with:

```
node tools/uacp-validate/index.js <path-to-envelope.yml>
```

Exit code 0 means the artifact passed all checks (`PASS: <filename>`). Exit code 1
means validation failed with a clear error message indicating which field or constraint
was violated.
