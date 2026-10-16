#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/vector-clock')

const D = {
  d1: '20000000-0000-4000-8000-000000000001',
  d2: '20000000-0000-4000-8000-000000000002',
  d3: '20000000-0000-4000-8000-000000000003',
  d4: '20000000-0000-4000-8000-000000000004',
  d5: '20000000-0000-4000-8000-000000000005',
}

function write(filename, fixture) {
  const p = path.join(OUT_DIR, filename)
  fs.writeFileSync(p, JSON.stringify(fixture, null, 2) + '\n', 'utf8')
  console.log(`wrote ${filename}`)
}

// Scenario 2: six sessions, one device, strictly linear chain
write('01-linear-chain-one-device.json', {
  fixture_id: 'vector-clock/01-linear-chain-one-device',
  description: 'Six sessions from a single device. Each clock strictly dominates the previous. Expected relationship: linear.',
  expected_relationship: 'linear',
  clocks: [
    { [D.d1]: 1 },
    { [D.d1]: 2 },
    { [D.d1]: 3 },
    { [D.d1]: 4 },
    { [D.d1]: 5 },
    { [D.d1]: 6 },
  ],
})

// Scenario 3: 5 devices interleaving, each new clock dominates the previous
write('02-five-devices-interleave.json', {
  fixture_id: 'vector-clock/02-five-devices-interleave',
  description: 'Five devices interleave contributions. Each successive clock dominates its predecessor, forming a total partial order. Expected relationship: linear.',
  expected_relationship: 'linear',
  clocks: [
    { [D.d1]: 1 },
    { [D.d1]: 1, [D.d2]: 1 },
    { [D.d1]: 2, [D.d2]: 1 },
    { [D.d1]: 2, [D.d2]: 1, [D.d3]: 1 },
    { [D.d1]: 2, [D.d2]: 2, [D.d3]: 1 },
    { [D.d1]: 2, [D.d2]: 2, [D.d3]: 1, [D.d4]: 1 },
    { [D.d1]: 2, [D.d2]: 2, [D.d3]: 1, [D.d4]: 1, [D.d5]: 1 },
    { [D.d1]: 3, [D.d2]: 2, [D.d3]: 2, [D.d4]: 1, [D.d5]: 1 },
  ],
})

// Scenario 4 (Tier-1): two vendor SDKs produce concurrent clocks; merge converges
write('03-two-vendor-sdk-converge.json', {
  fixture_id: 'vector-clock/03-two-vendor-sdk-converge',
  description: 'Two vendor SDKs (d1, d2) both produce events independently from a common parent clock {d1:3, d2:2}. Their resulting clocks are concurrent. The merged view is the component-wise maximum. Expected relationship: branch.',
  expected_relationship: 'branch',
  common_parent: { [D.d1]: 3, [D.d2]: 2 },
  concurrent_clocks: [
    { [D.d1]: 4, [D.d2]: 2 },
    { [D.d1]: 3, [D.d2]: 3 },
  ],
  merged: { [D.d1]: 4, [D.d2]: 3 },
  clocks: [
    { [D.d1]: 3, [D.d2]: 2 },
    { [D.d1]: 4, [D.d2]: 2 },
    { [D.d1]: 3, [D.d2]: 3 },
    { [D.d1]: 4, [D.d2]: 3 },
  ],
})

// Scenario 6: 23 events queued offline, merged against post-partition state
function buildOfflineReplay() {
  const prePartition = { [D.d1]: 10 }

  // d2 produces 23 events offline, all rooted at pre-partition d1:10
  const offlineClocks = []
  for (let i = 1; i <= 23; i++) {
    offlineClocks.push({ [D.d1]: 10, [D.d2]: i })
  }

  // Meanwhile d1 continued online: d1:11, d1:12
  const onlineClocks = [
    { [D.d1]: 11 },
    { [D.d1]: 12 },
  ]

  // All 23 offline clocks are concurrent with d1:11 and d1:12
  // because d2's offline clocks have d1:10 < d1:11, and d1's online clocks have no d2 slot (treated as 0)
  // The merged post-reconnect view for each pair would be {d1:11, d2:N} or {d1:12, d2:N}

  return {
    fixture_id: 'vector-clock/04-offline-replay',
    description: 'Device d2 queues 23 events offline from pre-partition state {d1:10}. Meanwhile d1 continues to {d1:11} and {d1:12} online. On reconnect, all 23 offline d2 events are concurrent (branch) relative to the post-partition d1 state. Expected relationship: branch.',
    expected_relationship: 'branch',
    pre_partition: prePartition,
    offline_clocks: offlineClocks,
    online_clocks: onlineClocks,
    clocks: [prePartition, ...offlineClocks, ...onlineClocks],
  }
}

write('04-offline-replay.json', buildOfflineReplay())

// Scenario 14: two users offline, both append, reconnect — two branches detectable
write('05-two-users-offline-branch.json', {
  fixture_id: 'vector-clock/05-two-users-offline-branch',
  description: 'User A (d1) and User B (d2) both work offline from a common parent {d1:5, d2:3}. d1 produces {d1:6, d2:3}; d2 produces {d1:5, d2:4}. These clocks are concurrent — neither dominates the other. On reconnect, two branches are detectable. Expected relationship: branch.',
  expected_relationship: 'branch',
  common_parent: { [D.d1]: 5, [D.d2]: 3 },
  concurrent_clocks: [
    { [D.d1]: 6, [D.d2]: 3 },
    { [D.d1]: 5, [D.d2]: 4 },
  ],
  clocks: [
    { [D.d1]: 5, [D.d2]: 3 },
    { [D.d1]: 6, [D.d2]: 3 },
    { [D.d1]: 5, [D.d2]: 4 },
  ],
})

// Negative: CLOCK_OVERFLOW documentation fixture
// JSON cannot represent 2^63 accurately (beyond Number.MAX_SAFE_INTEGER).
// This fixture documents the requirement. The overflow value is represented as a string
// in overflow_value_string to avoid JSON precision loss.
write('negative-01-overflow.json', {
  fixture_id: 'vector-clock/negative-01-overflow',
  description: 'Documents the CLOCK_OVERFLOW requirement. Any slot value exceeding 2^63 - 1 (9223372036854775807) MUST be rejected with CLOCK_OVERFLOW. The overflow boundary cannot be enforced at the JSON Schema layer due to IEEE-754 precision limits (values above Number.MAX_SAFE_INTEGER = 9007199254740991 lose precision in standard JSON parsers). Enforcement is normative at the implementation layer.',
  expected: 'CLOCK_OVERFLOW',
  max_valid_value: 9007199254740991,
  overflow_value_string: '9223372036854775808',
  note: 'overflow_value_string is the string representation of 2^63 (one beyond the allowed maximum). Implementations MUST reject clocks with any slot >= this value. max_valid_value is Number.MAX_SAFE_INTEGER, used in tests to verify boundary behavior within safe JSON integer range.',
  clocks: [
    { [D.d1]: 9007199254740991 },
  ],
})

console.log('\nAll vector-clock fixtures generated.')
