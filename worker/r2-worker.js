/**
 * Cloudflare Worker — proxy securizat pentru R2.
 *
 * Variabile de mediu necesare în Worker:
 *   - FIREBASE_API_KEY
 *   - FIREBASE_PROJECT_ID
 *   - R2_BUCKET (binding)
 *
 * Reguli:
 *   - GET/LIST public doar pe căi controlate (galerii + branding).
 *   - PUT/DELETE necesită Firebase ID token valid.
 *   - PUT/DELETE pe galerii validează ownership în Firestore (galerii/{id}.userId == uid).
 *   - PUT pe galerii validează quota de stocare (plan Free/Pro/Unlimited) înainte de upload.
 *   - PUT/DELETE pe branding validează `branding/{uid}/...`.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
])
const DEFAULT_SHARE_TTL_HOURS = 24 * 30
const MAX_SHARE_TTL_HOURS = 24 * 365
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_READ = 600
const RATE_LIMIT_MAX_WRITE = 180
const rateLimitBuckets = new Map()
const galleryAccessCache = new Map()
const GALLERY_ACCESS_CACHE_TTL_MS = 10 * 1000
const quotaCache = new Map()
const QUOTA_CACHE_TTL_MS = 15 * 1000
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])
const PLAN_PRIORITY = {
  Free: 0,
  Pro: 1,
  Unlimited: 2,
}
const DEFAULT_STORAGE_LIMITS_GB = {
  Free: 15,
  Pro: 500,
  Unlimited: 1000,
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

function text(body, status = 200) {
  return new Response(body, { status, headers: corsHeaders() })
}

function normalizePath(rawPath) {
  const clean = String(rawPath || '').trim().replace(/^\/+/, '')
  if (!clean) return ''
  if (clean.includes('..') || clean.includes('\\')) return ''
  return clean
}

function parsePathInfo(path) {
  const key = normalizePath(path)
  if (!key) return null

  let match = key.match(/^galerii\/([^/]+)\/(originals|medium|thumbnails)\/(.+)$/)
  if (match) {
    return {
      kind: 'gallery-file',
      key,
      galleryId: match[1],
      variant: match[2],
      filename: match[3],
    }
  }

  match = key.match(/^branding\/([^/]+)\/(.+)$/)
  if (match) {
    return {
      kind: 'branding-file',
      key,
      ownerUid: match[1],
      filename: match[2],
    }
  }

  return null
}

function parsePrefixInfo(rawPrefix) {
  const prefix = normalizePath(rawPrefix)
  if (!prefix) return null

  let match = prefix.match(/^galerii\/([^/]+)\/(originals|medium|thumbnails)\/$/)
  if (match) {
    return {
      kind: 'gallery-read-prefix',
      prefix,
      galleryId: match[1],
      variant: match[2],
    }
  }

  match = prefix.match(/^galerii\/([^/]+)\/$/)
  if (match) {
    return {
      kind: 'gallery-manage-prefix',
      prefix,
      galleryId: match[1],
    }
  }

  match = prefix.match(/^branding\/([^/]+)\/$/)
  if (match) {
    return {
      kind: 'branding-prefix',
      prefix,
      ownerUid: match[1],
    }
  }

  return null
}

function requireBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')
    || 'unknown'
  )
}

function isReadMethod(method) {
  return method === 'GET'
}

function checkRateLimit(request) {
  const method = String(request.method || '').toUpperCase()
  const scope = isReadMethod(method) ? 'read' : 'write'
  const limit = scope === 'read' ? RATE_LIMIT_MAX_READ : RATE_LIMIT_MAX_WRITE
  const bucketKey = `${scope}:${getClientIp(request)}`
  const now = Date.now()
  const current = rateLimitBuckets.get(bucketKey)

  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(bucketKey, { windowStart: now, count: 1 })
    return { allowed: true }
  }

  if (current.count >= limit) {
    return { allowed: false }
  }

  current.count += 1
  rateLimitBuckets.set(bucketKey, current)
  return { allowed: true }
}

function normalizePlan(raw) {
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 'unlimited') return 'Unlimited'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'free') return 'Free'
  return ''
}

function parseNumber(raw, fallback) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return fallback
  return value
}

function storageLimitBytesForPlan(plan, env) {
  const normalizedPlan = normalizePlan(plan) || 'Free'
  const envKey = `STORAGE_LIMIT_${normalizedPlan.toUpperCase()}_GB`
  const limitGb = parseNumber(env?.[envKey], DEFAULT_STORAGE_LIMITS_GB[normalizedPlan])
  return Math.floor(limitGb * 1024 * 1024 * 1024)
}

function parseCommaSeparatedSet(rawValue) {
  const values = String(rawValue || '')
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean)
  return new Set(values)
}

function getConfiguredPriceIds(env) {
  const pro = new Set([
    ...parseCommaSeparatedSet(env?.STRIPE_PRICE_PRO),
    ...parseCommaSeparatedSet(env?.STRIPE_PRICE_PRO_IDS),
  ])
  const unlimited = new Set([
    ...parseCommaSeparatedSet(env?.STRIPE_PRICE_UNLIMITED),
    ...parseCommaSeparatedSet(env?.STRIPE_PRICE_UNLIMITED_IDS),
  ])
  return { pro, unlimited }
}

function pickMaxPlan(currentPlan, candidatePlan) {
  const current = normalizePlan(currentPlan) || 'Free'
  const candidate = normalizePlan(candidatePlan) || 'Free'
  return PLAN_PRIORITY[candidate] > PLAN_PRIORITY[current] ? candidate : current
}

function firestoreStringField(data, fieldName) {
  return data?.fields?.[fieldName]?.stringValue || ''
}

function firestoreBoolField(data, fieldName, fallback = false) {
  const value = data?.fields?.[fieldName]?.booleanValue
  return typeof value === 'boolean' ? value : fallback
}

function firestoreValueToPlain(value) {
  if (!value || typeof value !== 'object') return null
  if ('nullValue' in value) return null
  if ('stringValue' in value) return String(value.stringValue || '')
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('integerValue' in value) {
    const parsed = Number(value.integerValue)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if ('doubleValue' in value) {
    const parsed = Number(value.doubleValue)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if ('timestampValue' in value) return String(value.timestampValue || '')
  if ('arrayValue' in value) {
    const values = value.arrayValue?.values || []
    return values.map((item) => firestoreValueToPlain(item))
  }
  if ('listValue' in value) {
    const values = value.listValue?.values || []
    return values.map((item) => firestoreValueToPlain(item))
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {}
    const plain = {}
    for (const [key, fieldValue] of Object.entries(fields)) {
      plain[key] = firestoreValueToPlain(fieldValue)
    }
    return plain
  }
  return null
}

function firestoreDocToPlain(doc) {
  if (!doc || typeof doc !== 'object') return null
  const fields = doc.fields || {}
  const plain = {}
  for (const [key, value] of Object.entries(fields)) {
    plain[key] = firestoreValueToPlain(value)
  }
  return plain
}

function parseJsonOrNdjson(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (_) {
    const rows = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        rows.push(JSON.parse(trimmed))
      } catch (_) {
        // Ignore malformed lines and continue parsing the response stream.
      }
    }
    return rows
  }
}

function docIdFromFirestoreName(name) {
  const parts = String(name || '').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

function parseSubscriptionPriceId(docData) {
  if (!docData || typeof docData !== 'object') return ''

  const items = docData?.items?.data ?? docData?.items
  if (Array.isArray(items)) {
    for (const item of items) {
      const nested = item?.price?.id || item?.priceId || item?.price
      if (nested) return String(nested)
    }
  }

  if (docData?.price?.id) return String(docData.price.id)
  if (typeof docData?.price === 'string') return String(docData.price)
  return ''
}

function parseSubscriptionPriceObject(docData) {
  if (!docData || typeof docData !== 'object') return null
  const items = docData?.items?.data ?? docData?.items
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item?.price && typeof item.price === 'object') return item.price
    }
  }
  if (docData?.price && typeof docData.price === 'object') return docData.price
  return null
}

function inferPlanFromSubscription(docData, env) {
  const explicitPlan = normalizePlan(
    docData?.plan
    || docData?.role
    || docData?.metadata?.plan
    || docData?.metadata?.tier
  )
  if (explicitPlan) return explicitPlan

  const priceId = parseSubscriptionPriceId(docData)
  if (!priceId) return 'Free'

  const configured = getConfiguredPriceIds(env)
  if (configured.unlimited.has(priceId)) return 'Unlimited'
  if (configured.pro.has(priceId)) return 'Pro'

  const priceObj = parseSubscriptionPriceObject(docData)
  const fromLabels = normalizePlan(
    priceObj?.lookup_key
    || priceObj?.lookupKey
    || priceObj?.nickname
    || priceObj?.product?.name
    || docData?.product?.name
  )
  if (fromLabels) return fromLabels

  const unitAmount = Number(
    priceObj?.unit_amount
    ?? priceObj?.unitAmount
    ?? priceObj?.unit_amount_decimal
    ?? docData?.unit_amount
    ?? docData?.unitAmount
    ?? docData?.unit_amount_decimal
  )
  if (Number.isFinite(unitAmount)) {
    if (unitAmount >= 15000) return 'Unlimited'
    if (unitAmount >= 10000) return 'Pro'
  }

  // Unknown active subscription: default to Pro to avoid false hard-blocking paid users.
  return 'Pro'
}

function invalidateQuotaCache(uid) {
  if (!uid) return
  quotaCache.delete(uid)
}

function readCachedQuota(uid) {
  if (!uid) return null
  const cached = quotaCache.get(uid)
  if (!cached) return null
  if (Date.now() - cached.ts > QUOTA_CACHE_TTL_MS) {
    quotaCache.delete(uid)
    return null
  }
  return cached.value
}

function writeCachedQuota(uid, value) {
  if (!uid || !value) return
  quotaCache.set(uid, { ts: Date.now(), value })
}

async function sha256Hex(value) {
  const raw = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!left || !right || left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

function parseIsoDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function normalizeShareToken(token) {
  return String(token || '').trim()
}

function normalizeShareTtlHours(rawTtl) {
  const parsed = Number(rawTtl)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SHARE_TTL_HOURS
  return Math.max(1, Math.min(MAX_SHARE_TTL_HOURS, Math.ceil(parsed)))
}

function randomHexToken(bytes = 24) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyFirebaseToken(idToken, apiKey) {
  if (!idToken || !apiKey) return null
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return data?.users?.[0]?.localId || null
}

function firestoreDocBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

function firestoreApiKeySuffix(apiKey) {
  return apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''
}

function firestoreAuthHeaders(idToken) {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {}
}

async function fetchFirestoreDocByPath({ projectId, docPath, idToken, apiKey }) {
  if (!projectId || !docPath) return null
  const safePath = String(docPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const url = `${firestoreDocBaseUrl(projectId)}/${safePath}${firestoreApiKeySuffix(apiKey)}`
  const res = await fetch(url, { method: 'GET', headers: firestoreAuthHeaders(idToken) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`)
  return res.json().catch(() => null)
}

async function fetchGalleryDoc({ galleryId, projectId, idToken, apiKey }) {
  if (!galleryId || !projectId) return null
  return fetchFirestoreDocByPath({
    projectId,
    docPath: `galerii/${galleryId}`,
    idToken,
    apiKey,
  })
}

async function listFirestoreCollectionDocs({ projectId, collectionPath, idToken, apiKey, pageSize = 100 }) {
  if (!projectId || !collectionPath) return []
  let pageToken = ''
  const docs = []

  while (true) {
    const query = new URLSearchParams()
    query.set('pageSize', String(pageSize))
    if (pageToken) query.set('pageToken', pageToken)
    if (apiKey) query.set('key', apiKey)

    const safePath = String(collectionPath)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const url = `${firestoreDocBaseUrl(projectId)}/${safePath}?${query.toString()}`
    const res = await fetch(url, {
      method: 'GET',
      headers: firestoreAuthHeaders(idToken),
    })
    if (res.status === 404) return docs
    if (!res.ok) throw new Error(`Firestore list failed (${res.status})`)

    const payload = await res.json().catch(() => ({}))
    const currentDocs = Array.isArray(payload?.documents) ? payload.documents : []
    docs.push(...currentDocs)
    pageToken = payload?.nextPageToken || ''
    if (!pageToken) break
  }

  return docs
}

async function runFirestoreQuery({ projectId, idToken, apiKey, structuredQuery }) {
  if (!projectId || !structuredQuery) return []
  const url = `${firestoreDocBaseUrl(projectId)}:runQuery${firestoreApiKeySuffix(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...firestoreAuthHeaders(idToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  })
  if (!res.ok) throw new Error(`Firestore runQuery failed (${res.status})`)
  const raw = await res.text().catch(() => '')
  return parseJsonOrNdjson(raw)
}

async function listOwnerGalleryIds({ uid, idToken, projectId, apiKey }) {
  if (!uid || !idToken || !projectId) return []
  const rows = await runFirestoreQuery({
    projectId,
    idToken,
    apiKey,
    structuredQuery: {
      from: [{ collectionId: 'galerii' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      select: {
        fields: [{ fieldPath: 'userId' }],
      },
    },
  }).catch(() => [])

  const ids = new Set()
  for (const row of rows) {
    const doc = row?.document
    const id = docIdFromFirestoreName(doc?.name)
    if (id) ids.add(id)
  }
  return [...ids]
}

async function sumPrefixBytes(bucket, prefix) {
  let total = 0
  let cursor = undefined
  while (true) {
    const listed = await bucket.list({ prefix, cursor })
    for (const obj of listed.objects || []) {
      total += Number(obj?.size || 0)
    }
    if (!listed.truncated) break
    cursor = listed.cursor
    if (!cursor) break
  }
  return total
}

async function resolveUserPlan({ uid, idToken, env }) {
  const projectId = env?.FIREBASE_PROJECT_ID
  const apiKey = env?.FIREBASE_API_KEY
  if (!uid || !idToken || !projectId) return 'Free'

  const overrideDoc = await fetchFirestoreDocByPath({
    projectId,
    docPath: `adminOverrides/${uid}`,
    idToken,
    apiKey,
  }).catch(() => null)
  const overridePlan = normalizePlan(firestoreDocToPlain(overrideDoc)?.plan)
  if (overridePlan) return overridePlan

  const subscriptionDocs = await listFirestoreCollectionDocs({
    projectId,
    collectionPath: `customers/${uid}/subscriptions`,
    idToken,
    apiKey,
  }).catch(() => [])

  let bestPlan = 'Free'
  for (const doc of subscriptionDocs) {
    const sub = firestoreDocToPlain(doc)
    const status = String(sub?.status || '').trim().toLowerCase()
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) continue
    bestPlan = pickMaxPlan(bestPlan, inferPlanFromSubscription(sub, env))
  }
  if (bestPlan !== 'Free') return bestPlan

  const userDoc = await fetchFirestoreDocByPath({
    projectId,
    docPath: `users/${uid}`,
    idToken,
    apiKey,
  }).catch(() => null)
  const userPlan = normalizePlan(firestoreDocToPlain(userDoc)?.plan)
  if (userPlan) return userPlan
  return 'Free'
}

async function computeOwnerUsageBytes({ uid, idToken, env }) {
  if (!uid || !idToken || !env?.FIREBASE_PROJECT_ID || !env?.R2_BUCKET) return 0
  const galleryIds = await listOwnerGalleryIds({
    uid,
    idToken,
    projectId: env.FIREBASE_PROJECT_ID,
    apiKey: env.FIREBASE_API_KEY,
  })
  if (!galleryIds.length) return 0

  let total = 0
  for (const galleryId of galleryIds) {
    total += await sumPrefixBytes(env.R2_BUCKET, `galerii/${galleryId}/`)
  }
  return total
}

async function assertStorageQuotaBeforeUpload({ authContext, pathInfo, uploadBytes, env }) {
  if (!authContext?.uid || pathInfo?.kind !== 'gallery-file') {
    return { ok: true }
  }

  const uid = authContext.uid
  const cached = readCachedQuota(uid)
  if (cached) {
    if (cached.usedBytes + uploadBytes > cached.limitBytes) {
      return {
        ok: false,
        status: 403,
        message: 'Quota Exceeded',
      }
    }
    writeCachedQuota(uid, {
      ...cached,
      usedBytes: cached.usedBytes + uploadBytes,
    })
    return { ok: true }
  }

  const plan = await resolveUserPlan({ uid, idToken: authContext.idToken, env })
  const limitBytes = storageLimitBytesForPlan(plan, env)
  const usedBytes = await computeOwnerUsageBytes({ uid, idToken: authContext.idToken, env })

  if (usedBytes + uploadBytes > limitBytes) {
    writeCachedQuota(uid, { usedBytes, limitBytes, plan })
    return {
      ok: false,
      status: 403,
      message: 'Quota Exceeded',
    }
  }

  writeCachedQuota(uid, {
    usedBytes: usedBytes + uploadBytes,
    limitBytes,
    plan,
  })
  return { ok: true }
}

async function getGalleryOwnerUid({ galleryId, idToken, projectId }) {
  if (!galleryId || !idToken || !projectId) return null
  const data = await fetchGalleryDoc({ galleryId, projectId, idToken })
  return firestoreStringField(data, 'userId') || null
}

async function getGalleryPublicAccessConfig({ galleryId, env }) {
  if (!galleryId) return null
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) {
    return {
      shareRequired: false,
      tokenHash: '',
      expiresAt: null,
    }
  }

  const now = Date.now()
  const cached = galleryAccessCache.get(galleryId)
  if (cached && now - cached.ts < GALLERY_ACCESS_CACHE_TTL_MS) {
    return cached.value
  }

  const docData = await fetchGalleryDoc({
    galleryId,
    projectId: env.FIREBASE_PROJECT_ID,
    apiKey: env.FIREBASE_API_KEY,
  }).catch(() => null)

  const tokenHash = firestoreStringField(docData, 'publicShareTokenHash')
  const shareRequiredField = firestoreBoolField(docData, 'publicShareRequired', false)
  const expiresAtRaw = firestoreStringField(docData, 'publicShareExpiresAt')
  const expiresAt = parseIsoDate(expiresAtRaw)

  const value = {
    shareRequired: shareRequiredField || !!tokenHash,
    tokenHash,
    expiresAt,
  }

  galleryAccessCache.set(galleryId, { ts: now, value })
  return value
}

async function assertPublicGalleryAccess(galleryId, shareToken, env) {
  if (!galleryId) return { ok: false, status: 403, message: 'Forbidden' }
  const config = await getGalleryPublicAccessConfig({ galleryId, env })
  if (!config) return { ok: false, status: 404, message: 'Gallery not found' }

  if (!config.shareRequired) {
    return { ok: true }
  }

  if (config.expiresAt && config.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 403, message: 'Share link expired' }
  }

  const incomingToken = normalizeShareToken(shareToken)
  if (!incomingToken) {
    return { ok: false, status: 403, message: 'Share token required' }
  }

  const incomingHash = await sha256Hex(incomingToken)
  if (!timingSafeEqual(incomingHash, config.tokenHash)) {
    return { ok: false, status: 403, message: 'Invalid share token' }
  }

  return { ok: true }
}

async function updateGalleryShareTokenConfig({ galleryId, idToken, projectId, tokenHash, expiresAtIso }) {
  const query = [
    'updateMask.fieldPaths=publicShareRequired',
    'updateMask.fieldPaths=publicShareTokenHash',
    'updateMask.fieldPaths=publicShareExpiresAt',
    'updateMask.fieldPaths=publicShareUpdatedAt',
  ].join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/galerii/${encodeURIComponent(galleryId)}?${query}`

  const body = {
    fields: {
      publicShareRequired: { booleanValue: true },
      publicShareTokenHash: { stringValue: tokenHash },
      publicShareExpiresAt: { stringValue: expiresAtIso },
      publicShareUpdatedAt: { stringValue: new Date().toISOString() },
    },
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const textBody = await res.text().catch(() => '')
    throw new Error(`Share token update failed (${res.status}): ${textBody}`)
  }

  galleryAccessCache.delete(galleryId)
}

async function requireAuthContext(request, env) {
  const idToken = requireBearerToken(request)
  if (!idToken) {
    return { error: text('Unauthorized', 401) }
  }
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) {
    return { error: text('Server misconfiguration', 500) }
  }

  const uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY)
  if (!uid) {
    return { error: text('Invalid or expired token', 401) }
  }

  return { uid, idToken }
}

async function assertWritablePathAccess(pathInfo, authContext, env) {
  if (!pathInfo) return { ok: false, status: 400, message: 'Invalid path' }

  if (pathInfo.kind === 'branding-file') {
    if (pathInfo.ownerUid !== authContext.uid) {
      return { ok: false, status: 403, message: 'Forbidden branding path' }
    }
    return { ok: true }
  }

  if (pathInfo.kind === 'gallery-file') {
    const ownerUid = await getGalleryOwnerUid({
      galleryId: pathInfo.galleryId,
      idToken: authContext.idToken,
      projectId: env.FIREBASE_PROJECT_ID,
    })
    if (!ownerUid) {
      return { ok: false, status: 404, message: 'Gallery not found' }
    }
    if (ownerUid !== authContext.uid) {
      return { ok: false, status: 403, message: 'Forbidden gallery path' }
    }
    return { ok: true }
  }

  return { ok: false, status: 403, message: 'Forbidden path' }
}

async function assertWritablePrefixAccess(prefixInfo, authContext, env) {
  if (!prefixInfo) return { ok: false, status: 400, message: 'Invalid prefix' }

  if (prefixInfo.kind === 'branding-prefix') {
    if (prefixInfo.ownerUid !== authContext.uid) {
      return { ok: false, status: 403, message: 'Forbidden branding prefix' }
    }
    return { ok: true }
  }

  if (prefixInfo.kind === 'gallery-manage-prefix') {
    const ownerUid = await getGalleryOwnerUid({
      galleryId: prefixInfo.galleryId,
      idToken: authContext.idToken,
      projectId: env.FIREBASE_PROJECT_ID,
    })
    if (!ownerUid) {
      return { ok: false, status: 404, message: 'Gallery not found' }
    }
    if (ownerUid !== authContext.uid) {
      return { ok: false, status: 403, message: 'Forbidden gallery prefix' }
    }
    return { ok: true }
  }

  return { ok: false, status: 403, message: 'Forbidden prefix' }
}

function canPublicReadKey(pathInfo) {
  if (!pathInfo) return false
  return pathInfo.kind === 'gallery-file' || pathInfo.kind === 'branding-file'
}

function canPublicListPrefix(prefixInfo) {
  if (!prefixInfo) return false
  return prefixInfo.kind === 'gallery-read-prefix'
}

function galleryIdFromPublicPath(pathInfo) {
  if (!pathInfo) return ''
  if (pathInfo.kind === 'gallery-file') return pathInfo.galleryId
  return ''
}

function galleryIdFromPublicPrefix(prefixInfo) {
  if (!prefixInfo) return ''
  if (prefixInfo.kind === 'gallery-read-prefix') return prefixInfo.galleryId
  return ''
}

async function listAllKeys(bucket, prefix) {
  const keys = []
  let cursor = undefined

  while (true) {
    const listed = await bucket.list({ prefix, cursor })
    for (const obj of listed.objects || []) keys.push(obj.key)

    if (!listed.truncated) break
    cursor = listed.cursor
    if (!cursor) break
  }

  return keys
}

async function listObjects(bucket, prefix) {
  const listed = await bucket.list({ prefix })
  return (listed.objects || []).map((obj) => ({
    key: obj.key,
    size: obj.size,
    lastModified: obj.uploaded,
  }))
}

export const __workerTestables = {
  normalizePath,
  parsePathInfo,
  parsePrefixInfo,
  canPublicReadKey,
  canPublicListPrefix,
  requireBearerToken,
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const rate = checkRateLimit(request)
    if (!rate.allowed) {
      return text('Too Many Requests', 429)
    }

    const url = new URL(request.url)
    const shareToken = normalizeShareToken(url.searchParams.get('st') || '')
    const key = normalizePath(decodeURIComponent(url.pathname.slice(1) || ''))
    const prefixParam = url.searchParams.get('prefix')
    const prefix = prefixParam ? normalizePath(decodeURIComponent(prefixParam)) : null

    try {
      const isShareTokenRoute = url.pathname === '/share-token' || url.pathname === '/share-token/'
      if (request.method === 'POST' && isShareTokenRoute) {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error

        const galleryIdRaw = normalizePath(url.searchParams.get('galleryId') || '')
        const galleryId = galleryIdRaw.includes('/') ? '' : galleryIdRaw
        if (!galleryId) return text('Missing or invalid galleryId', 400)

        const ttlHours = normalizeShareTtlHours(url.searchParams.get('ttlHours'))
        const ownerUid = await getGalleryOwnerUid({
          galleryId,
          idToken: authContext.idToken,
          projectId: env.FIREBASE_PROJECT_ID,
        })

        if (!ownerUid) return text('Gallery not found', 404)
        if (ownerUid !== authContext.uid) return text('Forbidden', 403)

        const token = randomHexToken()
        const tokenHash = await sha256Hex(token)
        const expiresAt = new Date(Date.now() + ttlHours * 3600000).toISOString()

        await updateGalleryShareTokenConfig({
          galleryId,
          idToken: authContext.idToken,
          projectId: env.FIREBASE_PROJECT_ID,
          tokenHash,
          expiresAtIso: expiresAt,
        })

        return json({ token, expiresAt, ttlHours }, 200)
      }

      if (request.method === 'GET') {
        if (prefix) {
          const prefixInfo = parsePrefixInfo(prefix)
          if (!canPublicListPrefix(prefixInfo)) {
            return text('Forbidden', 403)
          }

          const galleryId = galleryIdFromPublicPrefix(prefixInfo)
          if (galleryId) {
            const access = await assertPublicGalleryAccess(galleryId, shareToken, env)
            if (!access.ok) return text(access.message, access.status)
          }

          const objects = await listObjects(env.R2_BUCKET, prefixInfo.prefix)
          return json(objects, 200)
        }

        if (!key) return text('Missing key', 400)
        const pathInfo = parsePathInfo(key)
        if (!canPublicReadKey(pathInfo)) {
          return text('Forbidden', 403)
        }

        const galleryId = galleryIdFromPublicPath(pathInfo)
        if (galleryId) {
          const access = await assertPublicGalleryAccess(galleryId, shareToken, env)
          if (!access.ok) return text(access.message, access.status)
        }

        const object = await env.R2_BUCKET.get(pathInfo.key)
        if (!object) return text('Not Found', 404)

        return new Response(object.body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          },
        })
      }

      if (request.method === 'PUT') {
        if (!key) return text('Missing key', 400)

        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error

        const pathInfo = parsePathInfo(key)
        const access = await assertWritablePathAccess(pathInfo, authContext, env)
        if (!access.ok) return text(access.message, access.status)

        const contentType = (request.headers.get('Content-Type') || 'application/octet-stream').toLowerCase()
        if (!ALLOWED_TYPES.has(contentType)) {
          return text('Tip de fișier nepermis', 415)
        }

        const bodyBuffer = await request.arrayBuffer()
        const uploadBytes = Number(bodyBuffer.byteLength || 0)
        if (!uploadBytes) {
          return text('Body upload lipsă', 400)
        }
        if (uploadBytes > MAX_UPLOAD_BYTES) {
          return text('Fișier prea mare (max 25 MB)', 413)
        }

        const quota = await assertStorageQuotaBeforeUpload({
          authContext,
          pathInfo,
          uploadBytes,
          env,
        })
        if (!quota.ok) return text(quota.message, quota.status)

        await env.R2_BUCKET.put(pathInfo.key, bodyBuffer, {
          httpMetadata: { contentType },
        })
        return text('OK', 200)
      }

      if (request.method === 'DELETE') {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error

        if (prefix) {
          const prefixInfo = parsePrefixInfo(prefix)
          const access = await assertWritablePrefixAccess(prefixInfo, authContext, env)
          if (!access.ok) return text(access.message, access.status)

          const keys = await listAllKeys(env.R2_BUCKET, prefixInfo.prefix)
          for (let i = 0; i < keys.length; i += 50) {
            const batch = keys.slice(i, i + 50)
            await Promise.all(batch.map((k) => env.R2_BUCKET.delete(k)))
          }

          invalidateQuotaCache(authContext.uid)
          return json({ deleted: keys.length }, 200)
        }

        if (!key) return text('Missing key', 400)

        const pathInfo = parsePathInfo(key)
        const access = await assertWritablePathAccess(pathInfo, authContext, env)
        if (!access.ok) return text(access.message, access.status)

        await env.R2_BUCKET.delete(pathInfo.key)
        invalidateQuotaCache(authContext.uid)
        return text('Deleted', 200)
      }

      return text('Method Not Allowed', 405)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Error'
      return text(message, 500)
    }
  },
}
