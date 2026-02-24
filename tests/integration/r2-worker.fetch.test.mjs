import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../../worker/r2-worker.js'

function createMemoryBucket(seed = {}) {
  const store = new Map(Object.entries(seed))

  return {
    _store: store,
    async get(key) {
      const found = store.get(key)
      if (!found) return null
      return {
        body: found.body,
        httpMetadata: { contentType: found.contentType || 'application/octet-stream' },
      }
    },
    async put(key, body, opts = {}) {
      const buffer = body instanceof Uint8Array ? body : new Uint8Array([1])
      store.set(key, {
        body: buffer,
        contentType: opts?.httpMetadata?.contentType || 'application/octet-stream',
      })
    },
    async delete(key) {
      store.delete(key)
    },
    async list({ prefix, cursor } = {}) {
      const all = [...store.entries()]
        .filter(([key]) => String(key).startsWith(prefix || ''))
        .map(([key, value]) => ({
          key,
          size: value.body?.byteLength || value.body?.length || 0,
          uploaded: new Date('2026-01-01T00:00:00.000Z'),
        }))

      return {
        objects: all,
        truncated: false,
        cursor: cursor || undefined,
      }
    },
  }
}

function createFirebaseFetchStub({ tokenToUid, galleryOwnerById }) {
  return async function fetchStub(url, options = {}) {
    const u = String(url)

    if (u.includes('identitytoolkit.googleapis.com') && u.includes('accounts:lookup')) {
      const parsed = JSON.parse(options.body || '{}')
      const uid = tokenToUid[parsed.idToken]
      if (!uid) {
        return new Response(JSON.stringify({ users: [] }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ users: [{ localId: uid }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/galerii/')) {
      const galleryId = decodeURIComponent(u.split('/documents/galerii/')[1] || '')
      const ownerUid = galleryOwnerById[galleryId]
      if (!ownerUid) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(
        JSON.stringify({
          fields: {
            userId: { stringValue: ownerUid },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response('Unhandled fetch URL', { status: 500 })
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

test('GET list allows public gallery originals prefix', async () => {
  const env = {
    R2_BUCKET: createMemoryBucket({
      'galerii/g1/originals/a.jpg': { body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    }),
  }

  const req = new Request('https://worker.example/?prefix=galerii%2Fg1%2Foriginals%2F')
  const res = await worker.fetch(req, env)

  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(Array.isArray(json), true)
  assert.equal(json.length, 1)
  assert.equal(json[0].key, 'galerii/g1/originals/a.jpg')
})

test('PUT without auth is rejected with 401', async () => {
  const env = {
    FIREBASE_API_KEY: 'fake-key',
    FIREBASE_PROJECT_ID: 'fake-project',
    R2_BUCKET: createMemoryBucket(),
  }

  const req = new Request('https://worker.example/galerii/g1/originals/new.jpg', {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: new Uint8Array([1, 2, 3]),
  })

  const res = await worker.fetch(req, env)
  assert.equal(res.status, 401)
})

test('PUT with non-owner token is rejected with 403', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = createFirebaseFetchStub({
    tokenToUid: { ownerToken: 'owner-uid', otherToken: 'other-uid' },
    galleryOwnerById: { g1: 'owner-uid' },
  })

  try {
    const env = {
      FIREBASE_API_KEY: 'fake-key',
      FIREBASE_PROJECT_ID: 'fake-project',
      R2_BUCKET: createMemoryBucket(),
    }

    const req = new Request('https://worker.example/galerii/g1/originals/new.jpg', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer otherToken',
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([1, 2, 3]),
    })

    const res = await worker.fetch(req, env)
    assert.equal(res.status, 403)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PUT with owner token succeeds and writes object', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = createFirebaseFetchStub({
    tokenToUid: { ownerToken: 'owner-uid' },
    galleryOwnerById: { g1: 'owner-uid' },
  })

  try {
    const bucket = createMemoryBucket()
    const env = {
      FIREBASE_API_KEY: 'fake-key',
      FIREBASE_PROJECT_ID: 'fake-project',
      R2_BUCKET: bucket,
    }

    const req = new Request('https://worker.example/galerii/g1/originals/new.jpg', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ownerToken',
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([9, 8, 7]),
    })

    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    assert.equal(bucket._store.has('galerii/g1/originals/new.jpg'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('GET list enforces share token when gallery is protected', async () => {
  const originalFetch = globalThis.fetch
  const token = 'public-token-123'
  const tokenHash = await sha256Hex(token)

  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('firestore.googleapis.com') && u.includes('/documents/galerii/')) {
      return new Response(
        JSON.stringify({
          fields: {
            publicShareRequired: { booleanValue: true },
            publicShareTokenHash: { stringValue: tokenHash },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response('Unhandled URL', { status: 500 })
  }

  try {
    const env = {
      FIREBASE_API_KEY: 'fake-key',
      FIREBASE_PROJECT_ID: 'fake-project',
      R2_BUCKET: createMemoryBucket({
        'galerii/g1/originals/a.jpg': { body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
      }),
    }

    const withoutToken = await worker.fetch(
      new Request('https://worker.example/?prefix=galerii%2Fg1%2Foriginals%2F'),
      env
    )
    assert.equal(withoutToken.status, 403)

    const withToken = await worker.fetch(
      new Request(`https://worker.example/?prefix=galerii%2Fg1%2Foriginals%2F&st=${encodeURIComponent(token)}`),
      env
    )
    assert.equal(withToken.status, 200)
    const listed = await withToken.json()
    assert.equal(Array.isArray(listed), true)
    assert.equal(listed.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /share-token creates token for owner', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url)
    const method = String(options.method || 'GET').toUpperCase()

    if (u.includes('identitytoolkit.googleapis.com') && u.includes('accounts:lookup')) {
      return new Response(
        JSON.stringify({ users: [{ localId: 'owner-uid' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/galerii/g1') && method === 'GET') {
      return new Response(
        JSON.stringify({
          fields: {
            userId: { stringValue: 'owner-uid' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/galerii/g1') && method === 'PATCH') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Unhandled URL', { status: 500 })
  }

  try {
    const env = {
      FIREBASE_API_KEY: 'fake-key',
      FIREBASE_PROJECT_ID: 'fake-project',
      R2_BUCKET: createMemoryBucket(),
    }

    const req = new Request('https://worker.example/share-token?galleryId=g1&ttlHours=12', {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
    })

    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(typeof data.token, 'string')
    assert.equal(data.token.length > 20, true)
    assert.equal(typeof data.expiresAt, 'string')
  } finally {
    globalThis.fetch = originalFetch
  }
})
