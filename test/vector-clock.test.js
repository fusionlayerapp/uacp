'use strict'
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vector-clock'
const VECTORS_DIR = path.resolve(__dirname, '../test-vectors/extensions/vector-clock')

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/extensions/uacp-vector-clock.schema.json'), 'utf8'
  ))
  ajv.addSchema(schema, SCHEMA_ID)
  return (doc) => ajv.validate(SCHEMA_ID, doc)
}

function loadFixture(filename) {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, filename), 'utf8'))
}

function dominates(a, b) {
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)])
  let hasGreater = false
  for (const d of allDevices) {
    const av = a[d] ?? 0
    const bv = b[d] ?? 0
    if (av < bv) return false
    if (av > bv) hasGreater = true
  }
  return hasGreater
}

function concurrent(a, b) {
  return !dominates(a, b) && !dominates(b, a)
}

function merge(a, b) {
  const result = { ...a }
  for (const [k, v] of Object.entries(b)) {
    result[k] = Math.max(result[k] ?? 0, v)
  }
  return result
}

function increment(clock, deviceId) {
  return { ...clock, [deviceId]: (clock[deviceId] ?? 0) + 1 }
}

const validate = loadValidator()

const D = {
  d1: '20000000-0000-4000-8000-000000000001',
  d2: '20000000-0000-4000-8000-000000000002',
  d3: '20000000-0000-4000-8000-000000000003',
  d4: '20000000-0000-4000-8000-000000000004',
  d5: '20000000-0000-4000-8000-000000000005',
}

describe('vector clock — schema validation', () => {
  it('valid single-entry clock passes schema', () => {
    assert.ok(validate({ [D.d1]: 1 }))
  })

  it('valid multi-entry clock passes schema', () => {
    assert.ok(validate({ [D.d1]: 10, [D.d2]: 5, [D.d3]: 3 }))
  })

  it('non-UUID key rejects', () => {
    assert.ok(!validate({ 'not-a-uuid': 1 }))
  })

  it('negative value rejects', () => {
    assert.ok(!validate({ [D.d1]: -1 }))
  })

  it('empty object rejects (minProperties: 1)', () => {
    assert.ok(!validate({}))
  })

  it('zero value is valid', () => {
    assert.ok(validate({ [D.d1]: 0 }))
  })
})

describe('vector clock — dominates()', () => {
  it('test_scenario_2_linear_chain_dominates: each clock dominates the previous', () => {
    const fixture = loadFixture('01-linear-chain-one-device.json')
    const clocks = fixture.clocks
    for (let i = 1; i < clocks.length; i++) {
      assert.ok(dominates(clocks[i], clocks[i - 1]),
        `clocks[${i}] should dominate clocks[${i - 1}]`)
    }
  })

  it('test_scenario_2_linear_chain_no_concurrency: no two adjacent clocks are concurrent', () => {
    const fixture = loadFixture('01-linear-chain-one-device.json')
    const clocks = fixture.clocks
    for (let i = 1; i < clocks.length; i++) {
      assert.ok(!concurrent(clocks[i], clocks[i - 1]),
        `clocks[${i}] and clocks[${i - 1}] should not be concurrent`)
    }
  })
})

describe('vector clock — five devices partial order', () => {
  it('test_scenario_3_five_devices_partial_order: each clock dominates the previous', () => {
    const fixture = loadFixture('02-five-devices-interleave.json')
    const clocks = fixture.clocks
    for (let i = 1; i < clocks.length; i++) {
      assert.ok(dominates(clocks[i], clocks[i - 1]),
        `clocks[${i}] should dominate clocks[${i - 1}]`)
    }
  })
})

describe('vector clock — concurrent branch detection', () => {
  it('test_scenario_4_concurrent_branches_detectable: two clocks from common parent are concurrent', () => {
    const fixture = loadFixture('03-two-vendor-sdk-converge.json')
    const [c1, c2] = fixture.concurrent_clocks
    assert.ok(concurrent(c1, c2), 'the two vendor clocks should be concurrent')
    assert.ok(!dominates(c1, c2), 'c1 should not dominate c2')
    assert.ok(!dominates(c2, c1), 'c2 should not dominate c1')
  })

  it('test_scenario_4_merge_combines_max_values: merged clock has component-wise max', () => {
    const fixture = loadFixture('03-two-vendor-sdk-converge.json')
    const [c1, c2] = fixture.concurrent_clocks
    const merged = merge(c1, c2)
    const expected = fixture.merged
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(merged[k], v, `merged[${k}] should be ${v}`)
    }
  })
})

describe('vector clock — offline replay', () => {
  it('test_scenario_6_offline_replay_branch_detected: offline clocks are concurrent with online clocks', () => {
    const fixture = loadFixture('04-offline-replay.json')
    const onlineClocks = fixture.online_clocks
    const offlineClocks = fixture.offline_clocks

    for (const offClock of offlineClocks) {
      for (const onClock of onlineClocks) {
        assert.ok(concurrent(offClock, onClock),
          `offline ${JSON.stringify(offClock)} should be concurrent with online ${JSON.stringify(onClock)}`)
      }
    }
  })
})

describe('vector clock — two users offline branch', () => {
  it('test_scenario_14_two_users_offline_concurrent: user A and user B clocks are concurrent', () => {
    const fixture = loadFixture('05-two-users-offline-branch.json')
    const [clockA, clockB] = fixture.concurrent_clocks
    assert.ok(concurrent(clockA, clockB), 'user A and user B offline clocks should be concurrent')
  })
})

describe('vector clock — increment rule', () => {
  it('test_increment_rule_increments_own_slot_preserves_others', () => {
    const clock = { [D.d1]: 3, [D.d2]: 2, [D.d3]: 1 }
    const after = increment(clock, D.d1)
    assert.equal(after[D.d1], 4)
    assert.equal(after[D.d2], 2)
    assert.equal(after[D.d3], 1)
    assert.ok(dominates(after, clock))
  })

  it('increment on new device starts at 1', () => {
    const clock = { [D.d1]: 5 }
    const after = increment(clock, D.d2)
    assert.equal(after[D.d2], 1)
    assert.equal(after[D.d1], 5)
  })
})

describe('vector clock — missing key treated as zero', () => {
  it('test_missing_key_treated_as_zero: clock with extra device dominates one without it', () => {
    const a = { [D.d1]: 1, [D.d2]: 1 }
    const b = { [D.d1]: 1 }
    assert.ok(dominates(a, b), 'a (with d2:1) should dominate b (d2 missing = 0)')
    assert.ok(!dominates(b, a), 'b should not dominate a')
  })

  it('equal clocks do not dominate each other', () => {
    const a = { [D.d1]: 5 }
    const b = { [D.d1]: 5 }
    assert.ok(!dominates(a, b), 'a should not dominate equal b')
    assert.ok(!dominates(b, a), 'b should not dominate equal a')
  })
})

describe('vector clock — fixture schema validation', () => {
  const fixtures = fs.readdirSync(VECTORS_DIR).filter(n => n.endsWith('.json'))

  for (const filename of fixtures) {
    it(`fixture ${filename} has valid clocks array passing schema`, () => {
      const fixture = loadFixture(filename)
      assert.ok(Array.isArray(fixture.clocks), 'fixture must have clocks array')
      for (const clock of fixture.clocks) {
        const result = validate(clock)
        if (!result) {
          const ajv = new Ajv({ strict: false, allErrors: true })
          addFormats(ajv)
          const schema = JSON.parse(fs.readFileSync(
            path.resolve(__dirname, '../schema/extensions/uacp-vector-clock.schema.json'), 'utf8'
          ))
          ajv.addSchema(schema, SCHEMA_ID)
          ajv.validate(SCHEMA_ID, clock)
        }
        assert.ok(result, `clock in ${filename} failed schema: ${JSON.stringify(clock)}`)
      }
    })
  }
})
