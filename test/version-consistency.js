'use strict'
// Asserts that package.json version, schema $id, and README title all agree.

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version

// Schema $id must end with /<version>/conversation
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'conversation.schema.json'), 'utf8'))
const schemaId = schema['$id'] ?? ''
const schemaVersionMatch = schemaId.match(/\/schema\/([^/]+)\/conversation$/)
if (!schemaVersionMatch) fail(`schema $id has unexpected format: ${schemaId}`)
const schemaVersion = schemaVersionMatch[1]
if (schemaVersion !== version) {
  fail(`schema $id version (${schemaVersion}) does not match package.json version (${version})`)
}

// README title must mention the same version
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const readmeLine = readme.split('\n').find(l => l.startsWith('# '))
if (!readmeLine) fail('README.md has no top-level heading')
if (!readmeLine.includes(version)) {
  fail(`README.md title does not mention version ${version}: ${readmeLine.trim()}`)
}

// All extension schemas must have $id containing the current version
const extDir = path.join(ROOT, 'schema', 'extensions')
const extSchemas = fs.readdirSync(extDir).filter(n => n.endsWith('.schema.json'))
for (const name of extSchemas) {
  const ext = JSON.parse(fs.readFileSync(path.join(extDir, name), 'utf8'))
  const id = ext['$id'] ?? ''
  if (!id.includes(version)) {
    fail(`schema/extensions/${name} $id does not contain version ${version}: ${id}`)
  }
}

console.log(`OK — version ${version} consistent across package.json, schema $id, README title, and ${extSchemas.length} extension schemas.`)
