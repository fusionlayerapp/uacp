#!/usr/bin/env node
// Ensures all schema files in schema/ use the same canonical version in their $id.
// Run: node scripts/schema-lint.js
// CI: add as a step in .github/workflows/

const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_DIR = path.join(__dirname, '../schema')
const VERSION_RE = /\/uacp\/schema\/(\d+\.\d+\.\d+)\//

let errors = 0
const versions = new Set()

for (const file of fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.schema.json'))) {
  const full = path.join(SCHEMA_DIR, file)
  const doc = JSON.parse(fs.readFileSync(full, 'utf8'))
  const id = doc['$id'] ?? ''
  const m = id.match(VERSION_RE)
  if (!m) {
    console.error(`ERROR ${file}: $id missing or no version segment — got: ${id}`)
    errors++
    continue
  }
  versions.add(m[1])
  console.log(`  ${file}: ${m[1]}`)
}

if (versions.size > 1) {
  console.error(`\nERROR: schema version mismatch — found ${[...versions].join(', ')}`)
  console.error('All schema files must reference the same canonical version.')
  errors++
}

if (errors) {
  process.exit(1)
} else {
  const [v] = [...versions]
  console.log(`\nAll schemas consistent at ${v}`)
}
