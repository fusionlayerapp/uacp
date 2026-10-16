#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/withdraw-event')

const T = {
  userA:        '10000000-0000-4000-8000-000000000001',
  userB:        '10000000-0000-4000-8000-000000000002',
  scopePrivate: '40000000-0000-4000-8000-000000000001',
  scopeTeam:    '40000000-0000-4000-8000-000000000002',
  scopeHandoff: '40000000-0000-4000-8000-000000000003',
  evt1:         '50000000-0000-4000-8000-000000000001',
  evt2:         '50000000-0000-4000-8000-000000000002',
  evt3:         '50000000-0000-4000-8000-000000000003',
}
const IDENTITY_PUB = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const vectors = [
  {
    filename: '01-author-retracted.json',
    fixture_id: 'withdraw-event/01-author-retracted',
    description: 'Scenario 15: Author retracts a wrongly-scoped event.',
    expected: 'valid',
    withdraw: {
      type: 'withdraw',
      target_event_ids: [T.evt1],
      reason: 'author_retracted',
      withdrawn_at: 1700001000,
      withdrawer_identity: IDENTITY_PUB,
    },
  },
  {
    filename: '02-dlp-violation.json',
    fixture_id: 'withdraw-event/02-dlp-violation',
    description: 'Scenario 15 (secret leak): On-device DLP emits withdrawal on author\'s behalf.',
    expected: 'valid',
    withdraw: {
      type: 'withdraw',
      target_event_ids: [T.evt2, T.evt3],
      reason: 'dlp_violation',
      withdrawn_at: 1700001001,
      withdrawer_identity: IDENTITY_PUB,
    },
  },
  {
    filename: '03-admin-action.json',
    fixture_id: 'withdraw-event/03-admin-action',
    description: 'Scenario 10: Scope admin withdraws a flagged family event.',
    expected: 'valid',
    withdraw: {
      type: 'withdraw',
      target_event_ids: [T.evt1],
      reason: 'admin_action',
      withdrawn_at: 1700001002,
      withdrawer_identity: IDENTITY_PUB,
    },
  },
  {
    filename: 'negative-01-unknown-reason.json',
    fixture_id: 'withdraw-event/negative-01-unknown-reason',
    description: "reason='user_request' is not in the enum. Schema MUST reject this.",
    expected: 'schema_error',
    withdraw: {
      type: 'withdraw',
      target_event_ids: [T.evt1],
      reason: 'user_request',
      withdrawn_at: 1700001003,
      withdrawer_identity: IDENTITY_PUB,
    },
  },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const { filename, ...rest } of vectors) {
  const outPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(outPath, JSON.stringify(rest, null, 2) + '\n')
  console.log(`wrote ${outPath}`)
}
console.log(`generated ${vectors.length} withdraw-event vectors`)
