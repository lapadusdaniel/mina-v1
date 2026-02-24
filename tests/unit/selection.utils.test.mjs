import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractLegacySelection,
  hashString,
  normalizeClientName,
  sanitizeKeys,
  toClientSelectionId,
} from '../../src/modules/galleries/selection.utils.js'

test('sanitizeKeys keeps unique non-empty string keys', () => {
  const result = sanitizeKeys([' a.jpg ', 'a.jpg', '', '  ', null, 'b.jpg', 'a.jpg'])
  assert.deepEqual(result, [' a.jpg ', 'a.jpg', 'b.jpg'])
})

test('normalizeClientName trims and handles null-ish values', () => {
  assert.equal(normalizeClientName('  Ana Popescu  '), 'Ana Popescu')
  assert.equal(normalizeClientName(null), '')
  assert.equal(normalizeClientName(undefined), '')
})

test('toClientSelectionId builds slug and strips diacritics', () => {
  const result = toClientSelectionId('  Ștefan Popescu  ')
  assert.equal(result, 'stefan-popescu')
})

test('toClientSelectionId falls back to deterministic hash when slug is empty', () => {
  const input = '💍💍💍'
  const id = toClientSelectionId(input)
  assert.match(id, /^client-/)
  assert.equal(id, `client-${hashString(input)}`)
})

test('extractLegacySelection returns selection only for exact legacy client key', () => {
  const gallery = {
    selectii: {
      'Ana': ['img1.jpg', 'img2.jpg', 'img1.jpg'],
    },
  }

  assert.deepEqual(extractLegacySelection(gallery, ' Ana '), ['img1.jpg', 'img2.jpg'])
  assert.deepEqual(extractLegacySelection(gallery, 'ana'), [])
})
