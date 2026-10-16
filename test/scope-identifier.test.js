'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-scope-identifier'

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/extensions/uacp-scope-identifier.schema.json'),
    'utf8'
  ))
  ajv.addSchema(schema, SCHEMA_ID)
  return ajv
}

const ajv = loadValidator()
const validateSchema = (doc) => ajv.validate(SCHEMA_ID, doc)

function validateScope(scope) {
  if (!validateSchema(scope)) {
    const errors = ajv.errors || []
    for (const e of errors) {
      if (e.keyword === 'enum') return 'UNKNOWN_AXIS_VALUE'
      if (e.keyword === 'required') return 'MISSING_AXIS'
      if (e.instancePath === '/id') return 'INVALID_SCOPE_ID'
    }
    return 'schema_error'
  }
  return 'valid'
}

const IDENTITY_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SCOPE_ID_1 = '40000000-0000-4000-8000-000000000001'
const SCOPE_ID_2 = '40000000-0000-4000-8000-000000000002'

function makeScope(overrides = {}) {
  return {
    id: SCOPE_ID_1,
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
    created_by: IDENTITY_A,
    ...overrides,
  }
}

describe('scope-identifier schema', () => {
  it('valid scope passes', () => {
    assert.equal(validateScope(makeScope()), 'valid')
  })

  it('missing cardinality fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.cardinality
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing invite_model fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.invite_model
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing role_structure fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.role_structure
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing override fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.override
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing audit fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.audit
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing default_sync fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.default_sync
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('missing lifecycle fails with MISSING_AXIS', () => {
    const s = makeScope()
    delete s.governance.lifecycle
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('unknown cardinality value fails with UNKNOWN_AXIS_VALUE', () => {
    const s = makeScope({ governance: { ...makeScope().governance, cardinality: 'unlimited' } })
    assert.equal(validateScope(s), 'UNKNOWN_AXIS_VALUE')
  })
})

describe('scope-identifier scenarios', () => {
  it('test_scenario_1_private_preset_validates', () => {
    const s = makeScope({
      governance: {
        cardinality: 'solo',
        invite_model: 'self_only',
        role_structure: 'flat',
        override: 'none',
        audit: 'none',
        default_sync: 'realtime',
        lifecycle: 'permanent',
      },
    })
    assert.equal(validateScope(s), 'valid')
  })

  it('test_scenario_8_team_and_project_scopes_coexist', () => {
    const teamScope = makeScope({
      id: SCOPE_ID_1,
      governance: {
        cardinality: 'medium',
        invite_model: 'admin_gated',
        role_structure: 'member_lead_admin',
        override: 'none',
        audit: 'members_see_membership',
        default_sync: 'realtime',
        lifecycle: 'permanent',
      },
    })
    const projectScope = makeScope({
      id: SCOPE_ID_2,
      governance: {
        cardinality: 'small',
        invite_model: 'peer',
        role_structure: 'member_lead_admin',
        override: 'none',
        audit: 'members_see_content',
        default_sync: 'realtime',
        lifecycle: 'project_bounded',
      },
    })
    assert.equal(validateScope(teamScope), 'valid')
    assert.equal(validateScope(projectScope), 'valid')
  })

  it('test_scenario_10_family_override_parental_flagged_only', () => {
    const s = makeScope({
      governance: {
        cardinality: 'small',
        invite_model: 'admin_gated',
        role_structure: 'parent_child',
        override: 'parental_flagged_only',
        audit: 'members_see_membership',
        default_sync: 'eventual',
        lifecycle: 'permanent',
      },
    })
    assert.equal(validateScope(s), 'valid')
  })

  it('test_scenario_11_personal_carve_out_has_no_override', () => {
    const s = makeScope({
      governance: {
        cardinality: 'solo',
        invite_model: 'self_only',
        role_structure: 'flat',
        override: 'none',
        audit: 'none',
        default_sync: 'realtime',
        lifecycle: 'permanent',
      },
    })
    assert.equal(validateScope(s), 'valid')
  })

  it('test_scenario_negative_unknown_axis_value', () => {
    const s = makeScope({ governance: { ...makeScope().governance, cardinality: 'unlimited' } })
    assert.equal(validateScope(s), 'UNKNOWN_AXIS_VALUE')
  })

  it('test_scenario_negative_missing_axis', () => {
    const s = makeScope()
    delete s.governance.override
    assert.equal(validateScope(s), 'MISSING_AXIS')
  })

  it('test_scenario_negative_invalid_scope_id', () => {
    const s = makeScope({ id: 'not-a-uuid' })
    assert.equal(validateScope(s), 'INVALID_SCOPE_ID')
  })
})

describe('test_six_preset_tuples_all_validate', () => {
  const presets = [
    {
      name: 'private',
      governance: { cardinality: 'solo', invite_model: 'self_only', role_structure: 'flat', override: 'none', audit: 'none', default_sync: 'realtime', lifecycle: 'permanent' },
    },
    {
      name: 'project',
      governance: { cardinality: 'small', invite_model: 'peer', role_structure: 'member_lead_admin', override: 'none', audit: 'members_see_content', default_sync: 'realtime', lifecycle: 'project_bounded' },
    },
    {
      name: 'team',
      governance: { cardinality: 'medium', invite_model: 'admin_gated', role_structure: 'member_lead_admin', override: 'none', audit: 'members_see_membership', default_sync: 'realtime', lifecycle: 'permanent' },
    },
    {
      name: 'family',
      governance: { cardinality: 'small', invite_model: 'admin_gated', role_structure: 'parent_child', override: 'parental_flagged_only', audit: 'members_see_membership', default_sync: 'eventual', lifecycle: 'permanent' },
    },
    {
      name: 'group',
      governance: { cardinality: 'small', invite_model: 'peer', role_structure: 'flat', override: 'none', audit: 'members_see_membership', default_sync: 'realtime', lifecycle: 'permanent' },
    },
    {
      name: 'interest',
      governance: { cardinality: 'open', invite_model: 'open', role_structure: 'flat', override: 'none', audit: 'members_see_membership', default_sync: 'eventual', lifecycle: 'permanent' },
    },
  ]

  for (const preset of presets) {
    it(`preset "${preset.name}" validates`, () => {
      const s = makeScope({ governance: preset.governance })
      assert.equal(validateScope(s), 'valid', `preset ${preset.name} should be valid`)
    })
  }
})
