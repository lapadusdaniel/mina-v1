import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  accessTokensMatch,
  didSelectionFinalize,
  isGalleryOpenForClientSelection,
  normalizeAccessToken,
  normalizeSelectionStatus,
  toClientSelectionId,
} = require('../../functions/src/services/selection-finalization.service.js')

test('selection status defaults to draft and recognizes finalized', () => {
  assert.equal(normalizeSelectionStatus(undefined), 'draft')
  assert.equal(normalizeSelectionStatus(' FINALIZED '), 'finalized')
  assert.equal(normalizeSelectionStatus('sent'), 'draft')
})

test('finalization notification fires only on the first transition', () => {
  assert.equal(didSelectionFinalize({}, { status: 'finalized' }), true)
  assert.equal(didSelectionFinalize({ status: 'draft' }, { status: 'finalized' }), true)
  assert.equal(didSelectionFinalize({ status: 'finalized' }, { status: 'finalized' }), false)
  assert.equal(didSelectionFinalize({ status: 'finalized' }, { status: 'draft' }), false)
})

test('client selection ids are stable for Romanian names', () => {
  assert.equal(toClientSelectionId('  Mădălina Ionescu  '), 'madalina-ionescu')
  assert.equal(toClientSelectionId('Ștefan & Ana'), 'stefan-ana')
})

test('selection access tokens require a strong exact match', () => {
  const token = '0123456789abcdef0123456789abcdef'
  assert.equal(normalizeAccessToken('short'), '')
  assert.equal(accessTokensMatch(token, token), true)
  assert.equal(accessTokensMatch(token, `${token}x`), false)
  assert.equal(accessTokensMatch(token, 'fedcba9876543210fedcba9876543210'), false)
})

test('public client selection is allowed only for an active shared gallery', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z')
  const open = {
    status: 'active',
    statusActiv: true,
    publicShareRequired: false,
    dataExpirare: '2026-08-07T10:00:00.000Z',
  }

  assert.equal(isGalleryOpenForClientSelection(open, now), true)
  assert.equal(isGalleryOpenForClientSelection({ ...open, status: 'trash' }, now), false)
  assert.equal(isGalleryOpenForClientSelection({ ...open, statusActiv: false }, now), false)
  assert.equal(isGalleryOpenForClientSelection({ ...open, publicShareRequired: true }, now), false)
  assert.equal(isGalleryOpenForClientSelection({ ...open, dataExpirare: '2026-08-05T10:00:00.000Z' }, now), false)
})
