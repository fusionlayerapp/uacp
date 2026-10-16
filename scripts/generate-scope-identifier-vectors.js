#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/scope-identifier')

const scope1 = '40000000-0000-4000-8000-000000000001'
const scope2 = '40000000-0000-4000-8000-000000000002'
const scope3 = '40000000-0000-4000-8000-000000000003'
const identityA_pub_b64url = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const fixtures = [
  {
    filename: '01-private-preset-axes.json',
    fixture_id: 'scope-identifier-01-private-preset-axes',
    description: 'Scenario 1: private preset — solo/self_only/flat/none/none/realtime/permanent',
    expected: 'valid',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'solo',
          invite_model: 'self_only',
          role_structure: 'flat',
          override: 'none',
          audit: 'none',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: '02-team-and-project-coexist.json',
    fixture_id: 'scope-identifier-02-team-and-project-coexist',
    description: 'Scenario 8: team scope and project scope with different axes coexist on same user identity',
    expected: 'valid',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'medium',
          invite_model: 'admin_gated',
          role_structure: 'member_lead_admin',
          override: 'none',
          audit: 'members_see_membership',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
      {
        id: scope2,
        governance: {
          cardinality: 'small',
          invite_model: 'peer',
          role_structure: 'member_lead_admin',
          override: 'none',
          audit: 'members_see_content',
          default_sync: 'realtime',
          lifecycle: 'project_bounded',
        },
        created_at: 1700000001000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: '03-family-parental-override.json',
    fixture_id: 'scope-identifier-03-family-parental-override',
    description: 'Scenario 10: family preset includes override=parental_flagged_only',
    expected: 'valid',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'small',
          invite_model: 'admin_gated',
          role_structure: 'parent_child',
          override: 'parental_flagged_only',
          audit: 'members_see_membership',
          default_sync: 'eventual',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: '04-personal-carve-out-no-legal-hold.json',
    fixture_id: 'scope-identifier-04-personal-carve-out-no-legal-hold',
    description: 'Scenario 11: solo scope (personal carve-out) with override=none is valid. Personal scopes MUST NOT carry override=legal_hold_only.',
    expected: 'valid',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'solo',
          invite_model: 'self_only',
          role_structure: 'flat',
          override: 'none',
          audit: 'none',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: 'negative-01-unknown-axis-value.json',
    fixture_id: 'scope-identifier-negative-01-unknown-axis-value',
    description: 'Negative: cardinality value "unlimited" is not in the enum — UNKNOWN_AXIS_VALUE',
    expected: 'UNKNOWN_AXIS_VALUE',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'unlimited',
          invite_model: 'self_only',
          role_structure: 'flat',
          override: 'none',
          audit: 'none',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: 'negative-02-missing-axis.json',
    fixture_id: 'scope-identifier-negative-02-missing-axis',
    description: 'Negative: governance object missing the override axis — MISSING_AXIS',
    expected: 'MISSING_AXIS',
    scopes: [
      {
        id: scope1,
        governance: {
          cardinality: 'solo',
          invite_model: 'self_only',
          role_structure: 'flat',
          audit: 'none',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
  {
    filename: 'negative-03-invalid-scope-id.json',
    fixture_id: 'scope-identifier-negative-03-invalid-scope-id',
    description: 'Negative: id is not a valid UUID v4 — INVALID_SCOPE_ID',
    expected: 'INVALID_SCOPE_ID',
    scopes: [
      {
        id: 'not-a-uuid',
        governance: {
          cardinality: 'solo',
          invite_model: 'self_only',
          role_structure: 'flat',
          override: 'none',
          audit: 'none',
          default_sync: 'realtime',
          lifecycle: 'permanent',
        },
        created_at: 1700000000000,
        created_by: identityA_pub_b64url,
      },
    ],
  },
]

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const { filename, ...data } of fixtures) {
  const filePath = path.join(OUT_DIR, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote ${filename}`)
}

console.log(`\nGenerated ${fixtures.length} fixtures in ${OUT_DIR}`)
