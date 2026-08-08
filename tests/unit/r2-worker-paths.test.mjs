import assert from 'node:assert/strict'
import test from 'node:test'

import { __workerTestables } from '../../worker/r2-worker.js'

const {
  canPublicListPrefix,
  canPublicReadKey,
  normalizePath,
  parsePathInfo,
  parsePrefixInfo,
  publicAssetCacheControl,
  rateLimitKeyForRequest,
  requireBearerToken,
  normalizePlan,
  storageLimitBytesForPlan,
  inferPlanFromSubscription,
} = __workerTestables

const GB = 1024 * 1024 * 1024

test('normalizePath removes leading slash and rejects traversal/backslash', () => {
  assert.equal(normalizePath('/galerii/abc/originals/a.jpg'), 'galerii/abc/originals/a.jpg')
  assert.equal(normalizePath('..\\secret'), '')
  assert.equal(normalizePath('galerii/../x'), '')
})

test('parsePathInfo detects gallery and branding keys only', () => {
  assert.deepEqual(parsePathInfo('galerii/g1/originals/a.jpg')?.kind, 'gallery-file')
  assert.deepEqual(parsePathInfo('branding/u1/logo.png')?.kind, 'branding-file')
  assert.equal(parsePathInfo('u1/g1/photo.jpg'), null)
  assert.equal(parsePathInfo('invalid-format'), null)
})

test('parsePrefixInfo validates public vs private prefixes', () => {
  assert.deepEqual(parsePrefixInfo('galerii/g1/originals/')?.kind, 'gallery-read-prefix')
  assert.deepEqual(parsePrefixInfo('galerii/g1/')?.kind, 'gallery-manage-prefix')
  assert.equal(parsePrefixInfo('u1/g1/'), null)
  assert.equal(parsePrefixInfo('x'), null)
})

test('public access checks allow only approved read/list forms', () => {
  assert.equal(canPublicReadKey(parsePathInfo('galerii/g1/medium/a.webp')), true)
  assert.equal(canPublicReadKey(parsePathInfo('branding/u1/logo.png')), true)
  assert.equal(canPublicReadKey(parsePathInfo('unknown')), false)

  assert.equal(canPublicListPrefix(parsePrefixInfo('galerii/g1/originals/')), true)
  assert.equal(canPublicListPrefix(parsePrefixInfo('u1/g1/')), false)
  assert.equal(canPublicListPrefix(parsePrefixInfo('galerii/g1/')), false)
})

test('requireBearerToken extracts valid bearer token', () => {
  const reqOk = new Request('https://worker.example', {
    headers: { Authorization: 'Bearer token-123' },
  })
  const reqBad = new Request('https://worker.example', {
    headers: { Authorization: 'Basic abc' },
  })

  assert.equal(requireBearerToken(reqOk), 'token-123')
  assert.equal(requireBearerToken(reqBad), null)
})

test('rateLimitKeyForRequest uses only ip+method for write scope', () => {
  const reqA = new Request('https://worker.example/galerii/g1/originals/a.jpg', {
    method: 'PUT',
    headers: { 'CF-Connecting-IP': '1.2.3.4' },
  })
  const reqB = new Request('https://worker.example/galerii/g1/originals/b.jpg', {
    method: 'PUT',
    headers: { 'CF-Connecting-IP': '1.2.3.4' },
  })

  const keyA = rateLimitKeyForRequest(reqA, 'write')
  const keyB = rateLimitKeyForRequest(reqB, 'write')
  assert.equal(keyA, keyB)
  assert.equal(keyA, 'write:PUT:1.2.3.4')
})


test('publicAssetCacheControl differentiates token vs public assets', () => {
  assert.equal(publicAssetCacheControl(''), 'public, max-age=31536000, immutable')
  assert.equal(publicAssetCacheControl('abc123'), 'private, max-age=86400')
})

test('quota plan names match the five plans sold by Mina', () => {
  assert.equal(normalizePlan('Free'), 'Free')
  assert.equal(normalizePlan('Esențial'), 'Esential')
  assert.equal(normalizePlan('Starter'), 'Esential')
  assert.equal(normalizePlan('Plus'), 'Plus')
  assert.equal(normalizePlan('Pro'), 'Pro')
  assert.equal(normalizePlan('Studio'), 'Studio')
})

test('server-side storage limits match the public pricing', () => {
  assert.equal(storageLimitBytesForPlan('Free', {}), 15 * GB)
  assert.equal(storageLimitBytesForPlan('Esential', {}), 100 * GB)
  assert.equal(storageLimitBytesForPlan('Plus', {}), 500 * GB)
  assert.equal(storageLimitBytesForPlan('Pro', {}), 1000 * GB)
  assert.equal(storageLimitBytesForPlan('Studio', {}), 2000 * GB)
  assert.equal(storageLimitBytesForPlan('Studio', {}, true), 2500 * GB)
})

test('Stripe subscriptions resolve to current Mina plans', () => {
  assert.equal(inferPlanFromSubscription({ plan: 'Esențial' }, {}), 'Esential')
  assert.equal(inferPlanFromSubscription({ plan: 'Plus' }, {}), 'Plus')
  assert.equal(
    inferPlanFromSubscription({ price: { id: 'price_1T6a4F1ax2jGrLZH92vUsGzE' } }, {}),
    'Pro'
  )
  assert.equal(
    inferPlanFromSubscription({ price: { id: 'price_1U1Qt41ax2jGrLZHuddImmll' } }, {}),
    'Plus'
  )
  assert.equal(inferPlanFromSubscription({ price: { unit_amount: 12900 } }, {}), 'Studio')
  assert.equal(inferPlanFromSubscription({ price: { unit_amount: 149000 } }, {}), 'Studio')
  assert.equal(inferPlanFromSubscription({ price: { id: 'price_unknown' } }, {}), 'Free')
})
