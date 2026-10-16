#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.resolve(__dirname, '../test-vectors/extensions/promotion-event')

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
    filename: '01-as-is-promotion.json',
    fixture_id: 'promotion-event/01-as-is-promotion',
    description: 'Scenario 8: PM promotes PRD as_is to designer scope. No summary needed.',
    expected: 'valid',
    promotion: {
      type: 'promotion',
      source_scope_id: T.scopePrivate,
      source_event_ids: [T.evt1],
      destination_scope_id: T.scopeTeam,
      mode: 'as_is',
      summary_payload: null,
      context_note: null,
      promoted_at: 1700000000,
      promoter_identity: IDENTITY_PUB,
    },
  },
  {
    filename: '02-with-summary.json',
    fixture_id: 'promotion-event/02-with-summary',
    description: 'Scenario 2: Opus session promotes architectural decision with summary; Sonnet sessions decrypt.',
    expected: 'valid',
    promotion: {
      type: 'promotion',
      source_scope_id: T.scopePrivate,
      source_event_ids: [T.evt1, T.evt2],
      destination_scope_id: T.scopeTeam,
      mode: 'with_summary',
      summary_payload: 'dGhpcyBpcyBhIHN1bW1hcnk',
      context_note: 'YXJjaGl0ZWN0dXJlLWRlY2lzaW9u',
      promoted_at: 1700000001,
      promoter_identity: IDENTITY_PUB,
    },
  },
  {
    filename: '03-summary-only.json',
    fixture_id: 'promotion-event/03-summary-only',
    description: 'Scenario 9: Source team bulk-promotes artifacts to handoff scope as summary_only. Originals stay in source.',
    expected: 'valid',
    promotion: {
      type: 'promotion',
      source_scope_id: T.scopePrivate,
      source_event_ids: [T.evt1, T.evt2, T.evt3],
      destination_scope_id: T.scopeHandoff,
      mode: 'summary_only',
      summary_payload: 'aGFuZG9mZi1zdW1tYXJ5LWJ1bGs',
      context_note: null,
      promoted_at: 1700000002,
      promoter_identity: IDENTITY_PUB,
    },
  },
  {
    filename: 'negative-01-missing-summary.json',
    fixture_id: 'promotion-event/negative-01-missing-summary',
    description: 'mode=with_summary but summary_payload=null. Schema allows null; semantic validator must catch MISSING_SUMMARY.',
    expected: 'MISSING_SUMMARY',
    promotion: {
      type: 'promotion',
      source_scope_id: T.scopePrivate,
      source_event_ids: [T.evt1],
      destination_scope_id: T.scopeTeam,
      mode: 'with_summary',
      summary_payload: null,
      context_note: null,
      promoted_at: 1700000003,
      promoter_identity: IDENTITY_PUB,
    },
  },
  {
    filename: 'negative-02-unknown-mode.json',
    fixture_id: 'promotion-event/negative-02-unknown-mode',
    description: "mode='move' is not in the enum. Schema MUST reject this.",
    expected: 'schema_error',
    promotion: {
      type: 'promotion',
      source_scope_id: T.scopePrivate,
      source_event_ids: [T.evt1],
      destination_scope_id: T.scopeTeam,
      mode: 'move',
      summary_payload: null,
      context_note: null,
      promoted_at: 1700000004,
      promoter_identity: IDENTITY_PUB,
    },
  },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const { filename, ...rest } of vectors) {
  const outPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(outPath, JSON.stringify(rest, null, 2) + '\n')
  console.log(`wrote ${outPath}`)
}
console.log(`generated ${vectors.length} promotion-event vectors`)
