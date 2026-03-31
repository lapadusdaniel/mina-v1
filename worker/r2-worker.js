/**
 * Cloudflare Worker — proxy securizat pentru B2.
 *
 * Variabile de mediu necesare în Worker:
 *   - FIREBASE_API_KEY
 *   - FIREBASE_PROJECT_ID
 *   - B2_ENDPOINT        (ex: s3.us-east-005.backblazeb2.com)
 *   - B2_BUCKET_NAME     (ex: mina-photos)
 *   - B2_KEY_ID
 *   - B2_APPLICATION_KEY
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
  Starter: 1,
  Pro: 2,
  Studio: 3,
}
const DEFAULT_STORAGE_LIMITS_GB = {
  Free: 30,
  Starter: 150,
  Pro: 600,
  Studio: 2000,
}
const STUDIO_ADDON_BONUS_GB = 500

async function b2Get(key, env) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()
  const region = endpoint.split('.')[1] || 'us-east-005'

  const url = `https://${bucket}.${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const date = datetime.slice(0, 8)

  const headers = await signRequest({
    method: 'GET',
    url,
    headers: {
      host: `${bucket}.${endpoint}`,
      'x-amz-date': datetime,
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    payload: '',
    region,
    service: 's3',
    keyId,
    appKey,
    date,
    datetime,
  })

  const res = await fetch(url, { method: 'GET', headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`B2 get failed: ${res.status}`)
  return {
    body: res.body,
    httpMetadata: { contentType: res.headers.get('content-type') || 'application/octet-stream' },
    httpEtag: res.headers.get('etag'),
  }
}

async function b2Put(key, body, contentType, env) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()
  const region = endpoint.split('.')[1] || 'us-east-005'

  const url = `https://${bucket}.${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const date = datetime.slice(0, 8)
  const payloadHash = await sha256Hex(body instanceof ArrayBuffer ? new Uint8Array(body) : body)

  const headers = await signRequest({
    method: 'PUT',
    url,
    headers: {
      host: `${bucket}.${endpoint}`,
      'content-type': contentType,
      'x-amz-date': datetime,
      'x-amz-content-sha256': payloadHash,
    },
    payload: body,
    region,
    service: 's3',
    keyId,
    appKey,
    date,
    datetime,
    payloadHash,
  })

  const res = await fetch(url, { method: 'PUT', headers, body })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`B2 put failed: ${res.status} ${text.slice(0, 200)}`)
  }
}

async function b2Delete(key, env) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()
  const region = endpoint.split('.')[1] || 'us-east-005'

  const url = `https://${bucket}.${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const date = datetime.slice(0, 8)

  const headers = await signRequest({
    method: 'DELETE',
    url,
    headers: {
      host: `${bucket}.${endpoint}`,
      'x-amz-date': datetime,
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    payload: '',
    region,
    service: 's3',
    keyId,
    appKey,
    date,
    datetime,
  })

  const res = await fetch(url, { method: 'DELETE', headers })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`B2 delete failed: ${res.status} ${text.slice(0, 200)}`)
  }
}

async function b2List(prefix, env) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()

  const objects = []
  let continuationToken = undefined

  while (true) {
    const params = new URLSearchParams({ 'list-type': '2', prefix })
    if (continuationToken) params.set('continuation-token', continuationToken)

    const url = `https://${bucket}.${endpoint}/?${params.toString()}`
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
    const date = datetime.slice(0, 8)
    const region = endpoint.split('.')[1] || 'us-east-005'

    const headers = await signRequest({
      method: 'GET',
      url,
      headers: {
        host: `${bucket}.${endpoint}`,
        'x-amz-date': datetime,
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      payload: '',
      region,
      service: 's3',
      keyId,
      appKey,
      date,
      datetime,
    })

    const res = await fetch(url, { method: 'GET', headers })
    const text = await res.text()

    if (!res.ok) {
      return { objects, error: `B2 list failed: ${res.status} ${text.slice(0, 200)}` }
    }

    const keys = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1])
    const sizes = [...text.matchAll(/<Size>([^<]+)<\/Size>/g)].map(m => Number(m[1]))
    const dates = [...text.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map(m => m[1])

    keys.forEach((key, i) => objects.push({ key, size: sizes[i] || 0, lastModified: dates[i] || null }))

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/i.test(text)
    if (!isTruncated) break

    const nextToken = text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    if (!nextToken) break
    continuationToken = nextToken[1]
  }

  return { objects }
}

async function b2ListAllKeys(prefix, env) {
  const result = await b2List(prefix, env)
  return (result.objects || []).map(o => o.key)
}

async function signRequest({ method, url, headers, payload, region, service, keyId, appKey, date, datetime, payloadHash }) {
  const parsedUrl = new URL(url)
  const canonicalUri = parsedUrl.pathname
  const canonicalQuery = parsedUrl.search.slice(1).split('&').sort().join('&')
  const headerKeys = Object.keys(headers).sort()
  const canonicalHeaders = headerKeys.map(k => `${k.toLowerCase()}:${headers[k].trim()}`).join('\n') + '\n'
  const signedHeaders = headerKeys.map(k => k.toLowerCase()).join(';')
  const resolvedPayloadHash = payloadHash || headers['x-amz-content-sha256'] || await sha256Hex(payload)

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, resolvedPayloadHash].join('\n')
  const credentialScope = `${date}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, await sha256Hex(canonicalRequest)].join('\n')

  const signingKey = await hmacSha256(
    await hmacSha256(
      await hmacSha256(
        await hmacSha256(new TextEncoder().encode('AWS4' + appKey), date),
        region
      ),
      service
    ),
    'aws4_request'
  )

  const signature = await hmacSha256Hex(signingKey, stringToSign)
  const authorization = `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { ...headers, Authorization: authorization }
}

async function hmacSha256(key, message) {
  const k = key instanceof Uint8Array ? key : new TextEncoder().encode(key)
  const m = message instanceof Uint8Array ? message : new TextEncoder().encode(message)
  const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, m))
}

async function hmacSha256Hex(key, message) {
  const sig = await hmacSha256(key, message)
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── PRESIGNED URLs (pentru upload direct din browser) ─────────────────────────

function normalizePresignFilesInput(files, galleryId) {
  if (!Array.isArray(files) || files.length === 0) return null
  const normalized = []
  for (const file of files) {
    const key = normalizePath(file?.key || '')
    const contentType = String(file?.contentType || '').trim().toLowerCase()
    const pathInfo = parsePathInfo(key)
    if (!key || !contentType || !ALLOWED_TYPES.has(contentType)) return null
    if (!pathInfo || pathInfo.kind !== 'gallery-file' || pathInfo.galleryId !== galleryId) return null
    normalized.push({ key, contentType })
  }
  return normalized
}

async function createPresignedPutUrls({ files, env }) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()
  const region = endpoint.split('.')[1] || 'us-east-005'

  const urls = await Promise.all(files.map(async ({ key, contentType }) => {
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
    const date = datetime.slice(0, 8)
    const credentialScope = `${date}/${region}/s3/aws4_request`
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/')
    const host = `${bucket}.${endpoint}`

    // Include content-type in signed headers so the URL is bound to the specific
    // content type and B2 will reject PUTs with a different Content-Type header.
    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${keyId}/${credentialScope}`,
      'X-Amz-Date': datetime,
      'X-Amz-Expires': '3600',
      'X-Amz-SignedHeaders': 'content-type;host',
    })

    // Canonical headers must be sorted alphabetically: content-type before host
    const canonicalRequest = [
      'PUT',
      `/${encodedKey}`,
      queryParams.toString(),
      `content-type:${contentType}\nhost:${host}\n`,
      'content-type;host',
      'UNSIGNED-PAYLOAD',
    ].join('\n')

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n')

    const signingKey = await hmacSha256(
      await hmacSha256(
        await hmacSha256(
          await hmacSha256(new TextEncoder().encode('AWS4' + appKey), date),
          region
        ),
        's3'
      ),
      'aws4_request'
    )

    const signature = await hmacSha256Hex(signingKey, stringToSign)
    queryParams.set('X-Amz-Signature', signature)

    const url = `https://${host}/${encodedKey}?${queryParams.toString()}`
    return { key, url, contentType }
  }))
  return urls
}

async function b2HeadObject(key, env) {
  const endpoint = String(env.B2_ENDPOINT || '').trim()
  const bucket = String(env.B2_BUCKET_NAME || '').trim()
  const keyId = String(env.B2_KEY_ID || '').trim()
  const appKey = String(env.B2_APPLICATION_KEY || '').trim()
  const region = endpoint.split('.')[1] || 'us-east-005'

  const url = `https://${bucket}.${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const date = datetime.slice(0, 8)

  const headers = await signRequest({
    method: 'HEAD',
    url,
    headers: {
      host: `${bucket}.${endpoint}`,
      'x-amz-date': datetime,
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    payload: '',
    region,
    service: 's3',
    keyId,
    appKey,
    date,
    datetime,
  })

  const res = await fetch(url, { method: 'HEAD', headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`B2 head failed: ${res.status}`)
  const contentLength = Number(res.headers.get('content-length') || 0)
  const contentType = res.headers.get('content-type') || ''
  return { contentLength, contentType }
}

// ── HELPERS (identice cu originalul) ─────────────────────────────────────────

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
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(), ...extraHeaders },
  })
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
    return { kind: 'gallery-file', key, galleryId: match[1], variant: match[2], filename: match[3] }
  }
  match = key.match(/^branding\/([^/]+)\/(.+)$/)
  if (match) {
    return { kind: 'branding-file', key, ownerUid: match[1], filename: match[2] }
  }
  return null
}

function parsePrefixInfo(rawPrefix) {
  const prefix = normalizePath(rawPrefix)
  if (!prefix) return null
  let match = prefix.match(/^galerii\/([^/]+)\/(originals|medium|thumbnails)\/$/)
  if (match) {
    return { kind: 'gallery-read-prefix', prefix, galleryId: match[1], variant: match[2] }
  }
  match = prefix.match(/^galerii\/([^/]+)\/$/)
  if (match) {
    return { kind: 'gallery-manage-prefix', prefix, galleryId: match[1] }
  }
  match = prefix.match(/^branding\/([^/]+)\/$/)
  if (match) {
    return { kind: 'branding-prefix', prefix, ownerUid: match[1] }
  }
  return null
}

function requireBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

function getClientIp(request) {
  const direct = request.headers.get('CF-Connecting-IP')
  if (direct && String(direct).trim()) return String(direct).trim()
  const forwarded = request.headers.get('x-forwarded-for') || ''
  if (forwarded) {
    const first = String(forwarded).split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

function isReadMethod(method) { return method === 'GET' }

function resolveRateLimitBinding(env, scope) {
  if (!env || typeof env !== 'object') return null
  const scopedName = scope === 'read' ? 'READ_RATE_LIMITER' : 'WRITE_RATE_LIMITER'
  const scoped = env[scopedName]
  if (scoped && typeof scoped.limit === 'function') return scoped
  const shared = env.RATE_LIMITER
  if (shared && typeof shared.limit === 'function') return shared
  return null
}

function localRateLimit(request, scope) {
  const limit = scope === 'read' ? RATE_LIMIT_MAX_READ : RATE_LIMIT_MAX_WRITE
  const bucketKey = `${scope}:${getClientIp(request)}`
  const now = Date.now()
  const current = rateLimitBuckets.get(bucketKey)
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(bucketKey, { windowStart: now, count: 1 })
    return { allowed: true }
  }
  if (current.count >= limit) return { allowed: false }
  current.count += 1
  rateLimitBuckets.set(bucketKey, current)
  return { allowed: true }
}

function parseLimiterSuccess(result) {
  if (typeof result === 'boolean') return result
  if (result && typeof result === 'object' && typeof result.success === 'boolean') return result.success
  return null
}

function rateLimitKeyForRequest(request, scope) {
  const ip = getClientIp(request)
  const method = String(request.method || '').toUpperCase()
  if (scope === 'write') return `${scope}:${method}:${ip}`
  const url = new URL(request.url)
  const route = normalizePath(url.pathname.slice(1)) || '/'
  return `${scope}:${method}:${route}:${ip}`
}

async function checkRateLimit(request, env) {
  const method = String(request.method || '').toUpperCase()
  const scope = isReadMethod(method) ? 'read' : 'write'
  const binding = resolveRateLimitBinding(env, scope)
  const key = rateLimitKeyForRequest(request, scope)
  if (binding) {
    try {
      const result = await binding.limit({ key })
      const success = parseLimiterSuccess(result)
      if (typeof success === 'boolean') return { allowed: success, source: 'binding' }
    } catch (_) {}
  }
  const local = localRateLimit(request, scope)
  return { ...local, source: 'local' }
}

function normalizePlan(raw) {
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 'studio' || normalized === 'unlimited') return 'Studio'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'starter') return 'Starter'
  if (normalized === 'free') return 'Free'
  return ''
}

function parseNumber(raw, fallback) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return fallback
  return value
}

function storageLimitBytesForPlan(plan, env, addonActive = false) {
  const normalizedPlan = normalizePlan(plan) || 'Free'
  const envKey = `STORAGE_LIMIT_${normalizedPlan.toUpperCase()}_GB`
  const legacyEnvKey = normalizedPlan === 'Studio' ? 'STORAGE_LIMIT_UNLIMITED_GB' : null
  const limitGb = parseNumber(
    env?.[envKey] ?? (legacyEnvKey ? env?.[legacyEnvKey] : undefined),
    DEFAULT_STORAGE_LIMITS_GB[normalizedPlan]
  )
  let effectiveLimitGb = limitGb
  if (normalizedPlan === 'Studio' && addonActive) {
    const addonBonusGb = parseNumber(env?.STUDIO_ADDON_BONUS_GB, STUDIO_ADDON_BONUS_GB)
    effectiveLimitGb += addonBonusGb
  }
  return Math.floor(effectiveLimitGb * 1024 * 1024 * 1024)
}

function parseCommaSeparatedSet(rawValue) {
  const values = String(rawValue || '').split(',').map((v) => String(v || '').trim()).filter(Boolean)
  return new Set(values)
}

function getConfiguredPriceIds(env) {
  const starter = new Set([...parseCommaSeparatedSet(env?.STRIPE_PRICE_STARTER), ...parseCommaSeparatedSet(env?.STRIPE_PRICE_STARTER_IDS)])
  const pro = new Set([...parseCommaSeparatedSet(env?.STRIPE_PRICE_PRO), ...parseCommaSeparatedSet(env?.STRIPE_PRICE_PRO_IDS)])
  const studio = new Set([...parseCommaSeparatedSet(env?.STRIPE_PRICE_STUDIO), ...parseCommaSeparatedSet(env?.STRIPE_PRICE_STUDIO_IDS), ...parseCommaSeparatedSet(env?.STRIPE_PRICE_UNLIMITED), ...parseCommaSeparatedSet(env?.STRIPE_PRICE_UNLIMITED_IDS)])
  return { starter, pro, studio }
}

function pickMaxPlan(currentPlan, candidatePlan) {
  const current = normalizePlan(currentPlan) || 'Free'
  const candidate = normalizePlan(candidatePlan) || 'Free'
  return PLAN_PRIORITY[candidate] > PLAN_PRIORITY[current] ? candidate : current
}

function firestoreStringField(data, fieldName) { return data?.fields?.[fieldName]?.stringValue || '' }
function firestoreDateField(data, fieldName) {
  const field = data?.fields?.[fieldName]
  return field?.timestampValue || field?.stringValue || ''
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
  if ('integerValue' in value) { const parsed = Number(value.integerValue); return Number.isFinite(parsed) ? parsed : 0 }
  if ('doubleValue' in value) { const parsed = Number(value.doubleValue); return Number.isFinite(parsed) ? parsed : 0 }
  if ('timestampValue' in value) return String(value.timestampValue || '')
  if ('arrayValue' in value) { return (value.arrayValue?.values || []).map((item) => firestoreValueToPlain(item)) }
  if ('listValue' in value) { return (value.listValue?.values || []).map((item) => firestoreValueToPlain(item)) }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {}
    const plain = {}
    for (const [key, fieldValue] of Object.entries(fields)) { plain[key] = firestoreValueToPlain(fieldValue) }
    return plain
  }
  return null
}

function firestoreDocToPlain(doc) {
  if (!doc || typeof doc !== 'object') return null
  const fields = doc.fields || {}
  const plain = {}
  for (const [key, value] of Object.entries(fields)) { plain[key] = firestoreValueToPlain(value) }
  return plain
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
  const explicitPlan = normalizePlan(docData?.plan || docData?.role || docData?.metadata?.plan || docData?.metadata?.tier)
  if (explicitPlan) return explicitPlan
  const priceId = parseSubscriptionPriceId(docData)
  if (!priceId) return 'Free'
  const configured = getConfiguredPriceIds(env)
  if (configured.studio.has(priceId)) return 'Studio'
  if (configured.pro.has(priceId)) return 'Pro'
  if (configured.starter.has(priceId)) return 'Starter'
  const priceObj = parseSubscriptionPriceObject(docData)
  const fromLabels = normalizePlan(priceObj?.lookup_key || priceObj?.lookupKey || priceObj?.nickname || priceObj?.product?.name || docData?.product?.name)
  if (fromLabels) return fromLabels
  const unitAmount = Number(priceObj?.unit_amount ?? priceObj?.unitAmount ?? priceObj?.unit_amount_decimal ?? docData?.unit_amount ?? docData?.unitAmount ?? docData?.unit_amount_decimal)
  if (Number.isFinite(unitAmount)) {
    if (unitAmount >= 12900) return 'Studio'
    if (unitAmount >= 7900) return 'Pro'
    if (unitAmount >= 3900) return 'Starter'
  }
  return 'Pro'
}

function invalidateQuotaCache(uid) { if (!uid) return; quotaCache.delete(uid) }
function readCachedQuota(uid) {
  if (!uid) return null
  const cached = quotaCache.get(uid)
  if (!cached) return null
  if (Date.now() - cached.ts > QUOTA_CACHE_TTL_MS) { quotaCache.delete(uid); return null }
  return cached.value
}
function writeCachedQuota(uid, value) { if (!uid || !value) return; quotaCache.set(uid, { ts: Date.now(), value }) }
function applyQuotaCacheDelta(uid, deltaBytes) {
  const delta = Math.trunc(Number(deltaBytes || 0))
  if (!uid || !Number.isFinite(delta) || delta === 0) return
  const cached = readCachedQuota(uid)
  if (!cached) return
  writeCachedQuota(uid, {
    ...cached,
    usedBytes: Math.max(0, cached.usedBytes + delta),
  })
}

async function sha256Hex(value) {
  let data
  if (typeof value === 'string') {
    data = new TextEncoder().encode(value)
  } else if (value instanceof ArrayBuffer) {
    data = new Uint8Array(value)
  } else if (value instanceof Uint8Array) {
    data = value
  } else {
    data = new TextEncoder().encode(String(value || ''))
  }
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a, b) {
  const left = String(a || ''); const right = String(b || '')
  if (!left || !right || left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) { diff |= left.charCodeAt(i) ^ right.charCodeAt(i) }
  return diff === 0
}

function parseIsoDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function normalizeShareToken(token) { return String(token || '').trim() }
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
function firestoreApiKeySuffix(apiKey) { return apiKey ? `?key=${encodeURIComponent(apiKey)}` : '' }
function firestoreAuthHeaders(idToken) { return idToken ? { Authorization: `Bearer ${idToken}` } : {} }

async function fetchFirestoreDocByPath({ projectId, docPath, idToken, apiKey }) {
  if (!projectId || !docPath) return null
  const safePath = String(docPath).split('/').map((segment) => encodeURIComponent(segment)).join('/')
  const url = `${firestoreDocBaseUrl(projectId)}/${safePath}${firestoreApiKeySuffix(apiKey)}`
  const res = await fetch(url, { method: 'GET', headers: firestoreAuthHeaders(idToken) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`)
  return res.json().catch(() => null)
}

async function fetchGalleryDoc({ galleryId, projectId, idToken, apiKey }) {
  if (!galleryId || !projectId) return null
  return fetchFirestoreDocByPath({ projectId, docPath: `galerii/${galleryId}`, idToken, apiKey })
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
    const safePath = String(collectionPath).split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const url = `${firestoreDocBaseUrl(projectId)}/${safePath}?${query.toString()}`
    const res = await fetch(url, { method: 'GET', headers: firestoreAuthHeaders(idToken) })
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

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return fallback
  return Math.floor(numeric)
}

async function resolveUserPlan({ uid, idToken, env }) {
  const projectId = env?.FIREBASE_PROJECT_ID
  const apiKey = env?.FIREBASE_API_KEY
  if (!uid || !idToken || !projectId) return 'Free'
  const overrideDoc = await fetchFirestoreDocByPath({ projectId, docPath: `adminOverrides/${uid}`, idToken, apiKey }).catch(() => null)
  const overridePlan = normalizePlan(firestoreDocToPlain(overrideDoc)?.plan)
  if (overridePlan) return overridePlan
  const subscriptionDocs = await listFirestoreCollectionDocs({ projectId, collectionPath: `customers/${uid}/subscriptions`, idToken, apiKey }).catch(() => [])
  let bestPlan = 'Free'
  for (const doc of subscriptionDocs) {
    const sub = firestoreDocToPlain(doc)
    const status = String(sub?.status || '').trim().toLowerCase()
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) continue
    bestPlan = pickMaxPlan(bestPlan, inferPlanFromSubscription(sub, env))
  }
  if (bestPlan !== 'Free') return bestPlan
  const userDoc = await fetchFirestoreDocByPath({ projectId, docPath: `users/${uid}`, idToken, apiKey }).catch(() => null)
  const userPlan = normalizePlan(firestoreDocToPlain(userDoc)?.plan)
  if (userPlan) return userPlan
  return 'Free'
}

async function syncStorageUsedDelta({ galleryId, deltaBytes, idToken, env }) {
  const normalizedGalleryId = String(galleryId || '').trim()
  const delta = Math.trunc(Number(deltaBytes || 0))
  if (!normalizedGalleryId || !Number.isFinite(delta) || delta === 0) return { ok: true, skipped: true }
  if (!idToken || !env?.FIREBASE_PROJECT_ID) {
    throw new Error('Storage sync misconfiguration')
  }

  const endpoint = `https://us-central1-${env.FIREBASE_PROJECT_ID}.cloudfunctions.net/updateStorageUsed`
  let lastError = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        galleryId: normalizedGalleryId,
        deltaBytes: delta,
      }),
    }).catch((error) => {
      lastError = error
      return null
    })

    if (res?.ok) {
      return res.json().catch(() => ({ ok: true }))
    }

    const textBody = res ? await res.text().catch(() => '') : ''
    lastError = new Error(`updateStorageUsed failed (${res?.status || 'network'}): ${textBody.slice(0, 200)}`)
  }

  throw lastError || new Error('updateStorageUsed failed')
}

async function readUserStorageState({ uid, idToken, env }) {
  if (!uid || !idToken || !env?.FIREBASE_PROJECT_ID) return { usedBytes: 0, addonActive: false }
  const userDoc = await fetchFirestoreDocByPath({ projectId: env.FIREBASE_PROJECT_ID, docPath: `users/${uid}`, idToken, apiKey: env.FIREBASE_API_KEY }).catch(() => null)
  const userData = firestoreDocToPlain(userDoc) || {}
  const fields = [userData.storageUsedBytes, userData.storageBytesUsed]
  let usedBytes = 0
  for (const value of fields) {
    const parsed = toNonNegativeInteger(value, -1)
    if (parsed >= 0) { usedBytes = parsed; break }
  }
  return { usedBytes, addonActive: Boolean(userData.addonActive) }
}

async function assertStorageQuotaBeforeUpload({ authContext, pathInfo, uploadBytes, env }) {
  if (!authContext?.uid || pathInfo?.kind !== 'gallery-file') return { ok: true }
  const uid = authContext.uid
  const cached = readCachedQuota(uid)
  if (cached) {
    if (cached.usedBytes + uploadBytes > cached.limitBytes) return { ok: false, status: 403, message: 'Quota Exceeded' }
    writeCachedQuota(uid, { ...cached, usedBytes: cached.usedBytes + uploadBytes })
    return { ok: true }
  }
  const plan = await resolveUserPlan({ uid, idToken: authContext.idToken, env })
  const storageState = await readUserStorageState({ uid, idToken: authContext.idToken, env })
  const usedBytes = storageState.usedBytes
  const addonActive = storageState.addonActive
  const limitBytes = storageLimitBytesForPlan(plan, env, addonActive)
  if (usedBytes + uploadBytes > limitBytes) {
    writeCachedQuota(uid, { usedBytes, limitBytes, plan, addonActive })
    return { ok: false, status: 403, message: 'Quota Exceeded' }
  }
  writeCachedQuota(uid, { usedBytes: usedBytes + uploadBytes, limitBytes, plan, addonActive })
  return { ok: true }
}

async function getGalleryOwnerUid({ galleryId, idToken, projectId }) {
  if (!galleryId || !idToken || !projectId) return null
  const data = await fetchGalleryDoc({ galleryId, projectId, idToken })
  return firestoreStringField(data, 'userId') || null
}

async function getGalleryPublicAccessConfig({ galleryId, env }) {
  if (!galleryId) return null
  // Fail-closed: if Worker is misconfigured, deny rather than serve files
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) {
    throw new Error('Worker misconfiguration: FIREBASE_PROJECT_ID or FIREBASE_API_KEY missing')
  }
  const now = Date.now()
  const cached = galleryAccessCache.get(galleryId)
  if (cached && now - cached.ts < GALLERY_ACCESS_CACHE_TTL_MS) return cached.value
  // Fail-closed: let Firestore errors propagate — do NOT catch to null.
  // A null return means 404 (gallery not found), which causes a 403 below.
  const docData = await fetchGalleryDoc({ galleryId, projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_API_KEY })
  if (docData === null) {
    // Gallery document not found — deny access
    return { notFound: true }
  }
  // Check gallery is active and not expired
  const statusActiv = firestoreBoolField(docData, 'statusActiv', true)
  if (!statusActiv) {
    return { inactive: true }
  }
  const dataExpirareStr = firestoreDateField(docData, 'dataExpirareTs') || firestoreDateField(docData, 'dataExpirare')
  if (dataExpirareStr) {
    const expiry = parseIsoDate(dataExpirareStr)
    if (expiry && expiry.getTime() < now) {
      return { expired: true }
    }
  }
  const tokenHash = firestoreStringField(docData, 'publicShareTokenHash')
  const shareRequiredField = firestoreBoolField(docData, 'publicShareRequired', false)
  const expiresAt = parseIsoDate(firestoreDateField(docData, 'publicShareExpiresAt'))
  const value = { shareRequired: shareRequiredField || !!tokenHash, tokenHash, expiresAt }
  galleryAccessCache.set(galleryId, { ts: now, value })
  return value
}

async function assertPublicGalleryAccess(galleryId, shareToken, env) {
  if (!galleryId) return { ok: false, status: 403, message: 'Forbidden' }
  let config
  try {
    config = await getGalleryPublicAccessConfig({ galleryId, env })
  } catch (err) {
    // Fail-closed: any error fetching gallery metadata → deny access
    console.error(`[assertPublicGalleryAccess] Firestore error for gallery ${galleryId}:`, err?.message || err)
    return { ok: false, status: 403, message: 'Gallery access check failed' }
  }
  if (!config) return { ok: false, status: 403, message: 'Gallery not found' }
  if (config.notFound) return { ok: false, status: 403, message: 'Gallery not found' }
  if (config.inactive) return { ok: false, status: 403, message: 'Gallery is not active' }
  if (config.expired) return { ok: false, status: 403, message: 'Gallery has expired' }
  if (!config.shareRequired) return { ok: true }
  if (config.expiresAt && config.expiresAt.getTime() < Date.now()) return { ok: false, status: 403, message: 'Share link expired' }
  const incomingToken = normalizeShareToken(shareToken)
  if (!incomingToken) return { ok: false, status: 403, message: 'Share token required' }
  const incomingHash = await sha256Hex(incomingToken)
  if (!timingSafeEqual(incomingHash, config.tokenHash)) return { ok: false, status: 403, message: 'Invalid share token' }
  return { ok: true }
}

async function updateGalleryShareTokenConfig({ galleryId, idToken, projectId, tokenHash, expiresAtIso }) {
  const query = ['updateMask.fieldPaths=publicShareRequired', 'updateMask.fieldPaths=publicShareTokenHash', 'updateMask.fieldPaths=publicShareExpiresAt', 'updateMask.fieldPaths=publicShareUpdatedAt'].join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/galerii/${encodeURIComponent(galleryId)}?${query}`
  const body = {
    fields: {
      publicShareRequired: { booleanValue: true },
      publicShareTokenHash: { stringValue: tokenHash },
      publicShareExpiresAt: { stringValue: expiresAtIso },
      publicShareUpdatedAt: { stringValue: new Date().toISOString() },
    },
  }
  const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const textBody = await res.text().catch(() => '')
    throw new Error(`Share token update failed (${res.status}): ${textBody}`)
  }
  galleryAccessCache.delete(galleryId)
}

async function requireAuthContext(request, env) {
  const idToken = requireBearerToken(request)
  if (!idToken) return { error: text('Unauthorized', 401) }
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) return { error: text('Server misconfiguration', 500) }
  const uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY)
  if (!uid) return { error: text('Invalid or expired token', 401) }
  return { uid, idToken }
}

async function getOptionalAuthContext(request, env) {
  const idToken = requireBearerToken(request)
  if (!idToken) return null
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) return null
  const uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY)
  if (!uid) return null
  return { uid, idToken }
}

async function assertPublicGalleryAccessOrOwner({ galleryId, shareToken, request, env }) {
  const publicAccess = await assertPublicGalleryAccess(galleryId, shareToken, env)
  if (publicAccess.ok) return publicAccess
  const authContext = await getOptionalAuthContext(request, env)
  if (!authContext?.uid) return publicAccess
  const ownerUid = await getGalleryOwnerUid({ galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID })
  if (ownerUid && ownerUid === authContext.uid) return { ok: true }
  return publicAccess
}

async function assertWritablePathAccess(pathInfo, authContext, env) {
  if (!pathInfo) return { ok: false, status: 400, message: 'Invalid path' }
  if (pathInfo.kind === 'branding-file') {
    if (pathInfo.ownerUid !== authContext.uid) return { ok: false, status: 403, message: 'Forbidden branding path' }
    return { ok: true }
  }
  if (pathInfo.kind === 'gallery-file') {
    const ownerUid = await getGalleryOwnerUid({ galleryId: pathInfo.galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID })
    if (!ownerUid) return { ok: false, status: 403, message: 'Gallery not found or access denied' }
    if (ownerUid !== authContext.uid) return { ok: false, status: 403, message: 'Forbidden gallery path' }
    return { ok: true }
  }
  return { ok: false, status: 403, message: 'Forbidden path' }
}

async function assertWritablePrefixAccess(prefixInfo, authContext, env) {
  if (!prefixInfo) return { ok: false, status: 400, message: 'Invalid prefix' }
  if (prefixInfo.kind === 'branding-prefix') {
    if (prefixInfo.ownerUid !== authContext.uid) return { ok: false, status: 403, message: 'Forbidden branding prefix' }
    return { ok: true }
  }
  if (prefixInfo.kind === 'gallery-manage-prefix') {
    const ownerUid = await getGalleryOwnerUid({ galleryId: prefixInfo.galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID })
    if (!ownerUid) return { ok: false, status: 404, message: 'Gallery not found' }
    if (ownerUid !== authContext.uid) return { ok: false, status: 403, message: 'Forbidden gallery prefix' }
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

function publicAssetCacheControl(shareToken = '') {
  return shareToken ? 'private, max-age=86400' : 'public, max-age=31536000, immutable'
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export const __workerTestables = {
  normalizePath,
  parsePathInfo,
  parsePrefixInfo,
  canPublicReadKey,
  canPublicListPrefix,
  publicAssetCacheControl,
  requireBearerToken,
  resolveRateLimitBinding,
  rateLimitKeyForRequest,
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const rate = await checkRateLimit(request, env)
    if (!rate.allowed) {
      return text('Too Many Requests', 429, { 'Retry-After': '60' })
    }

    const url = new URL(request.url)
    const shareToken = normalizeShareToken(url.searchParams.get('st') || '')
    const key = normalizePath(decodeURIComponent(url.pathname.slice(1) || ''))
    const prefixParam = url.searchParams.get('prefix')
    const prefix = prefixParam ? normalizePath(decodeURIComponent(prefixParam)) : null

    try {
      // ── POST /presign ──
      const isPresignRoute = url.pathname === '/presign' || url.pathname === '/presign/'
      if (request.method === 'POST' && isPresignRoute) {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error
        const body = await request.json().catch(() => null)
        const galleryIdRaw = normalizePath(body?.galleryId || '')
        const galleryId = galleryIdRaw.includes('/') ? '' : galleryIdRaw
        if (!galleryId) return text('Missing or invalid galleryId', 400)
        const files = normalizePresignFilesInput(body?.files, galleryId)
        if (!files) return text('Missing or invalid files payload', 400)
        const ownerUid = await getGalleryOwnerUid({ galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID })
        if (!ownerUid) return text('Gallery not found', 404)
        if (ownerUid !== authContext.uid) return text('Forbidden', 403)
        const urls = await createPresignedPutUrls({ files, env })
        return json({ urls }, 200)
      }

      // ── POST /confirm-upload ──
      const isConfirmRoute = url.pathname === '/confirm-upload' || url.pathname === '/confirm-upload/'
      if (request.method === 'POST' && isConfirmRoute) {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error
        const body = await request.json().catch(() => null)
        const uploadKey = normalizePath(body?.key || '')
        if (!uploadKey) return text('Missing key', 400)
        const pathInfo = parsePathInfo(uploadKey)
        const access = await assertWritablePathAccess(pathInfo, authContext, env)
        if (!access.ok) return text(access.message, access.status)
        const meta = await b2HeadObject(uploadKey, env).catch(() => null)
        if (!meta) return text('Object not found after upload', 404)
        if (meta.contentLength > MAX_UPLOAD_BYTES) {
          // Object exceeds size limit — delete it immediately
          await b2Delete(uploadKey, env).catch(() => {})
          invalidateQuotaCache(authContext.uid)
          return text(`Fișier prea mare (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Fișierul a fost șters.`, 413)
        }
        const reportedType = String(body?.contentType || '').trim().toLowerCase()
        if (reportedType && meta.contentType && !meta.contentType.toLowerCase().startsWith(reportedType.split(';')[0].trim())) {
          await b2Delete(uploadKey, env).catch(() => {})
          invalidateQuotaCache(authContext.uid)
          return text('Tip de fișier nepermis. Fișierul a fost șters.', 415)
        }
        const quota = await assertStorageQuotaBeforeUpload({ authContext, pathInfo, uploadBytes: meta.contentLength, env })
        if (!quota.ok) {
          await b2Delete(uploadKey, env).catch(() => {})
          invalidateQuotaCache(authContext.uid)
          return text(quota.message, quota.status)
        }
        try {
          await syncStorageUsedDelta({
            galleryId: pathInfo.galleryId,
            deltaBytes: meta.contentLength,
            idToken: authContext.idToken,
            env,
          })
        } catch (syncError) {
          await b2Delete(uploadKey, env).catch(() => {})
          invalidateQuotaCache(authContext.uid)
          return text(`Storage sync failed: ${syncError.message || 'unknown error'}`, 500)
        }
        return json({ ok: true, bytes: meta.contentLength }, 200)
      }

      // ── POST /share-token ──
      const isShareTokenRoute = url.pathname === '/share-token' || url.pathname === '/share-token/'
      if (request.method === 'POST' && isShareTokenRoute) {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error
        const galleryIdRaw = normalizePath(url.searchParams.get('galleryId') || '')
        const galleryId = galleryIdRaw.includes('/') ? '' : galleryIdRaw
        if (!galleryId) return text('Missing or invalid galleryId', 400)
        const ttlHours = normalizeShareTtlHours(url.searchParams.get('ttlHours'))
        const ownerUid = await getGalleryOwnerUid({ galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID })
        if (!ownerUid) return text('Gallery not found', 404)
        if (ownerUid !== authContext.uid) return text('Forbidden', 403)
        const token = randomHexToken()
        const tokenHash = await sha256Hex(token)
        const expiresAt = new Date(Date.now() + ttlHours * 3600000).toISOString()
        await updateGalleryShareTokenConfig({ galleryId, idToken: authContext.idToken, projectId: env.FIREBASE_PROJECT_ID, tokenHash, expiresAtIso: expiresAt })
        return json({ token, expiresAt, ttlHours }, 200)
      }

      // ── GET ──
      if (request.method === 'GET') {
        if (prefix) {
          const prefixInfo = parsePrefixInfo(prefix)
          if (!canPublicListPrefix(prefixInfo)) return text('Forbidden', 403)
          const galleryId = galleryIdFromPublicPrefix(prefixInfo)
          if (galleryId) {
            const access = await assertPublicGalleryAccessOrOwner({ galleryId, shareToken, request, env })
            if (!access.ok) return text(access.message, access.status)
          }
          const result = await b2List(prefixInfo.prefix, env)
          if (result.error) return json({ objects: [], error: result.error }, 200)
          return json(result.objects, 200)
        }

        if (!key) return text('Missing key', 400)
        const pathInfo = parsePathInfo(key)
        if (!canPublicReadKey(pathInfo)) return text('Forbidden', 403)
        const galleryId = galleryIdFromPublicPath(pathInfo)
        if (galleryId) {
          const access = await assertPublicGalleryAccessOrOwner({ galleryId, shareToken, request, env })
          if (!access.ok) return text(access.message, access.status)
        }
        const object = await b2Get(pathInfo.key, env)
        if (!object) return text('Not Found', 404)
        const cacheControl = publicAssetCacheControl(shareToken)
        return new Response(object.body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': cacheControl,
            ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
          },
        })
      }

      // ── PUT ──
      if (request.method === 'PUT') {
        if (!key) return text('Missing key', 400)
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error
        const pathInfo = parsePathInfo(key)
        const access = await assertWritablePathAccess(pathInfo, authContext, env)
        if (!access.ok) return text(access.message, access.status)
        const contentType = (request.headers.get('Content-Type') || 'application/octet-stream').toLowerCase()
        if (!ALLOWED_TYPES.has(contentType)) return text('Tip de fișier nepermis', 415)
        const bodyBuffer = await request.arrayBuffer()
        const uploadBytes = Number(bodyBuffer.byteLength || 0)
        if (!uploadBytes) return text('Body upload lipsă', 400)
        if (uploadBytes > MAX_UPLOAD_BYTES) return text('Fișier prea mare (max 25 MB)', 413)
        const quota = await assertStorageQuotaBeforeUpload({ authContext, pathInfo, uploadBytes, env })
        if (!quota.ok) return text(quota.message, quota.status)
        await b2Put(pathInfo.key, bodyBuffer, contentType, env)
        if (pathInfo.kind === 'gallery-file') {
          try {
            await syncStorageUsedDelta({
              galleryId: pathInfo.galleryId,
              deltaBytes: uploadBytes,
              idToken: authContext.idToken,
              env,
            })
          } catch (syncError) {
            await b2Delete(pathInfo.key, env).catch(() => {})
            invalidateQuotaCache(authContext.uid)
            return text(`Storage sync failed: ${syncError.message || 'unknown error'}`, 500)
          }
        }
        return text('OK', 200)
      }

      // ── DELETE ──
      if (request.method === 'DELETE') {
        const authContext = await requireAuthContext(request, env)
        if (authContext.error) return authContext.error
        if (prefix) {
          const prefixInfo = parsePrefixInfo(prefix)
          const access = await assertWritablePrefixAccess(prefixInfo, authContext, env)
          if (!access.ok) return text(access.message, access.status)
          const listed = await b2List(prefixInfo.prefix, env)
          if (listed.error) return text(listed.error, 500)
          const objects = Array.isArray(listed.objects) ? listed.objects : []
          const keys = objects.map((item) => item.key).filter(Boolean)
          const deletedBytes = objects.reduce((sum, item) => sum + Math.max(0, Number(item?.size || 0)), 0)
          for (let i = 0; i < keys.length; i += 50) {
            const batch = keys.slice(i, i + 50)
            await Promise.all(batch.map((k) => b2Delete(k, env)))
          }
          if (prefixInfo.kind === 'gallery-manage-prefix' && deletedBytes > 0) {
            await syncStorageUsedDelta({
              galleryId: prefixInfo.galleryId,
              deltaBytes: -deletedBytes,
              idToken: authContext.idToken,
              env,
            })
            applyQuotaCacheDelta(authContext.uid, -deletedBytes)
          } else {
            invalidateQuotaCache(authContext.uid)
          }
          return json({ deleted: keys.length }, 200)
        }
        if (!key) return text('Missing key', 400)
        const pathInfo = parsePathInfo(key)
        const access = await assertWritablePathAccess(pathInfo, authContext, env)
        if (!access.ok) return text(access.message, access.status)
        const existingMeta = pathInfo.kind === 'gallery-file'
          ? await b2HeadObject(pathInfo.key, env).catch(() => null)
          : null
        await b2Delete(pathInfo.key, env)
        if (pathInfo.kind === 'gallery-file' && existingMeta?.contentLength > 0) {
          await syncStorageUsedDelta({
            galleryId: pathInfo.galleryId,
            deltaBytes: -existingMeta.contentLength,
            idToken: authContext.idToken,
            env,
          })
          applyQuotaCacheDelta(authContext.uid, -existingMeta.contentLength)
        } else {
          invalidateQuotaCache(authContext.uid)
        }
        return text('Deleted', 200)
      }

      return text('Method Not Allowed', 405)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Error'
      return text(message, 500)
    }
  },
}
