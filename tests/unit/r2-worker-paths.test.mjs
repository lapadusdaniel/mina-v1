import assert from 'node:assert/strict'
import test from 'node:test'

import { __workerTestables } from '../../worker/r2-worker.js'

const {
  canPublicListPrefix,
  canPublicReadKey,
  normalizePath,
  parsePathInfo,
  parsePrefixInfo,
  requireBearerToken,
} = __workerTestables

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
