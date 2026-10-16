#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const readmePath = path.resolve(process.cwd(), 'README.md')
const readme = fs.readFileSync(readmePath, 'utf8')

const specMatch = readme.match(/Specification v(\d+\.\d+\.\d+)/i)
if (!specMatch) {
  console.error('README guard: could not find "Specification vX.Y.Z" in README title.')
  process.exit(1)
}

const version = specMatch[1]
const stalePatterns = [
  /slated for extraction/i,
  /"uacp"\s*:\s*"0\.1\.0"/,
  /"uacp_context"\s*:\s*"0\.1\.0"/,
  /"uacp_export"\s*:\s*"0\.1\.0"/
]

let failed = false
for (const pattern of stalePatterns) {
  if (pattern.test(readme)) {
    console.error(`README guard: stale pattern found: ${pattern}`)
    failed = true
  }
}

const requiredCurrent = [
  new RegExp(`"uacp"\\s*:\\s*"${version.replace(/\./g, '\\.')}"`),
  new RegExp(`"uacp_context"\\s*:\\s*"${version.replace(/\./g, '\\.')}"`),
  new RegExp(`"uacp_export"\\s*:\\s*"${version.replace(/\./g, '\\.')}"`)
]

for (const pattern of requiredCurrent) {
  if (!pattern.test(readme)) {
    console.error(`README guard: expected current version snippet missing: ${pattern}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}
console.log(`README guard: PASS (version ${version})`)
