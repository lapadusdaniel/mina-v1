import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getLightboxWindowKeys,
  partitionLightboxUrls,
} from '../../src/modules/galleries/lightbox-memory-window.js'

const photos = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key }))

test('lightbox păstrează doar fotografia curentă și vecinii direcți', () => {
  assert.deepEqual([...getLightboxWindowKeys(photos, 2)], ['b', 'c', 'd'])
})

test('fereastra lightbox se limitează corect la capetele galeriei', () => {
  assert.deepEqual([...getLightboxWindowKeys(photos, 0)], ['a', 'b'])
  assert.deepEqual([...getLightboxWindowKeys(photos, 4)], ['d', 'e'])
})

test('URL-urile ieșite din fereastra lightbox sunt separate pentru eliberare', () => {
  const result = partitionLightboxUrls(
    { a: 'blob:a', b: 'blob:b', c: 'blob:c', d: 'blob:d' },
    new Set(['b', 'c']),
  )

  assert.deepEqual(result.kept, { b: 'blob:b', c: 'blob:c' })
  assert.deepEqual(result.removed, [['a', 'blob:a'], ['d', 'blob:d']])
})
