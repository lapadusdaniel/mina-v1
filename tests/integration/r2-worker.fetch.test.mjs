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

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) }
    return { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    }
  }
  if (typeof value === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

function toFirestoreDoc(name, data) {
  const fields = {}
  for (const [k, v] of Object.entries(data || {})) {
    fields[k] = toFirestoreValue(v)
  }
  return { name, fields }
}

function createFirebaseFetchStub({
  tokenToUid = {},
  galleryOwnerById = {},
  adminOverridesByUid = {},
  usersByUid = {},
  subscriptionsByUid = {},
} = {}) {
  return async function fetchStub(url, options = {}) {
    const u = String(url)
    const method = String(options.method || 'GET').toUpperCase()

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

    if (u.includes('firestore.googleapis.com') && u.includes('/documents:runQuery') && method === 'POST') {
      const parsed = JSON.parse(options.body || '{}')
      const queryUid = parsed?.structuredQuery?.where?.fieldFilter?.value?.stringValue || ''
      const results = Object.entries(galleryOwnerById)
        .filter(([, ownerUid]) => ownerUid === queryUid)
        .map(([galleryId, ownerUid]) => ({
          document: toFirestoreDoc(
            `projects/fake-project/databases/(default)/documents/galerii/${galleryId}`,
            { userId: ownerUid }
          ),
        }))
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/adminOverrides/')) {
      const uid = decodeURIComponent((u.match(/\/documents\/adminOverrides\/([^/?]+)/) || [])[1] || '')
      const data = adminOverridesByUid[uid]
      if (!data) return new Response('Not found', { status: 404 })
      return new Response(
        JSON.stringify(toFirestoreDoc(`projects/fake-project/databases/(default)/documents/adminOverrides/${uid}`, data)),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/users/')) {
      const uid = decodeURIComponent((u.match(/\/documents\/users\/([^/?]+)/) || [])[1] || '')
      const data = usersByUid[uid]
      if (!data) return new Response('Not found', { status: 404 })
      return new Response(
        JSON.stringify(toFirestoreDoc(`projects/fake-project/databases/(default)/documents/users/${uid}`, data)),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/customers/') && u.includes('/subscriptions')) {
      const uid = decodeURIComponent((u.match(/\/documents\/customers\/([^/]+)\/subscriptions/) || [])[1] || '')
      const docs = (subscriptionsByUid[uid] || []).map((sub, idx) =>
        toFirestoreDoc(
          `projects/fake-project/databases/(default)/documents/customers/${uid}/subscriptions/sub-${idx + 1}`,
          sub
        )
      )
      return new Response(JSON.stringify({ documents: docs }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (u.includes('firestore.googleapis.com') && u.includes('/documents/galerii/')) {
      const galleryId = decodeURIComponent((u.match(/\/documents\/galerii\/([^/?]+)/) || [])[1] || '')
      const ownerUid = galleryOwnerById[galleryId]
      if (!ownerUid) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(
        JSON.stringify(
          toFirestoreDoc(`projects/fake-project/databases/(default)/documents/galerii/${galleryId}`, { userId: ownerUid })
        ),
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

test('GET is blocked with 429 when READ_RATE_LIMITER rejects the request', async () => {
  const env = {
    READ_RATE_LIMITER: {
      async limit() {
        return { success: false }
      },
    },
    R2_BUCKET: createMemoryBucket(),
  }

  const req = new Request('https://worker.example/galerii/g1/originals/a.jpg')
  const res = await worker.fetch(req, env)

  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '60')
})

test('PUT is blocked with 429 when WRITE_RATE_LIMITER rejects the request', async () => {
  const env = {
    WRITE_RATE_LIMITER: {
      async limit() {
        return { success: false }
      },
    },
    R2_BUCKET: createMemoryBucket(),
  }

  const req = new Request('https://worker.example/galerii/g1/originals/a.jpg', {
    method: 'PUT',
    body: new Uint8Array([1, 2, 3]),
  })
  const res = await worker.fetch(req, env)

  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '60')
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

test('PUT is rejected with 403 when storage quota is exceeded', async () => {
  const originalFetch = globalThis.fetch
  const quotaUid = 'owner-uid-quota'
  const quotaGalleryId = 'g-quota'
  globalThis.fetch = createFirebaseFetchStub({
    tokenToUid: { ownerTokenQuota: quotaUid },
    galleryOwnerById: { [quotaGalleryId]: quotaUid },
    usersByUid: {
      [quotaUid]: { plan: 'Free' },
    },
  })

  try {
    const bucket = createMemoryBucket({
      [`galerii/${quotaGalleryId}/originals/already-there.jpg`]: { body: new Uint8Array([1, 2, 3, 4]), contentType: 'image/jpeg' },
    })
    const env = {
      FIREBASE_API_KEY: 'fake-key',
      FIREBASE_PROJECT_ID: 'fake-project',
      STORAGE_LIMIT_FREE_GB: '0.000000001',
      R2_BUCKET: bucket,
    }

    const req = new Request(`https://worker.example/galerii/${quotaGalleryId}/originals/new.jpg`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ownerTokenQuota',
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([9, 8, 7]),
    })

    const res = await worker.fetch(req, env)
    assert.equal(res.status, 403)
    assert.equal(await res.text(), 'Quota Exceeded')
    assert.equal(bucket._store.has(`galerii/${quotaGalleryId}/originals/new.jpg`), false)
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
