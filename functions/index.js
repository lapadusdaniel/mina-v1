const functionsV1 = require('firebase-functions/v1')
const admin = require('firebase-admin')
const Stripe = require('stripe')
const logger = require('firebase-functions/logger')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { SmartBillService } = require('./src/services/smartbill.service')
const { createEmailService } = require('./src/services/email.service')
const {
  requestMinaAssistant,
  sanitizeAssistantHistory,
  sanitizeAssistantText,
} = require('./src/services/mina-assistant.service')
const {
  accessTokensMatch,
  didSelectionFinalize,
  isGalleryOpenForClientSelection,
  normalizeAccessToken,
  normalizeClientName: normalizeSelectionClientName,
  normalizeSelectionStatus,
  toClientSelectionId,
} = require('./src/services/selection-finalization.service')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_EXTENSION_API_KEY = defineSecret('ext-firestore-stripe-payments-STRIPE_API_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
const SMARTBILL_USERNAME = defineSecret('SMARTBILL_USERNAME')
const SMARTBILL_TOKEN = defineSecret('SMARTBILL_TOKEN')
const SMARTBILL_CIF = defineSecret('SMARTBILL_CIF')
const SMARTBILL_SERIES_NAME = defineSecret('SMARTBILL_SERIES_NAME')
const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const B2_KEY_ID = defineSecret('B2_KEY_ID')
const B2_APPLICATION_KEY = defineSecret('B2_APPLICATION_KEY')
const B2_BUCKET_NAME = defineSecret('B2_BUCKET_NAME')
const GALLERY_VERIFY_SECRET = defineSecret('GALLERY_VERIFY_SECRET')
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

const MINA_EMAIL_FROM = 'Mina <hello@cloudbymina.com>'
const MINA_DASHBOARD_URL = 'https://cloudbymina.com/dashboard'
const FOUNDER_OFFER_END_MS = Date.parse('2026-09-30T20:59:59.999Z')

const FALLBACK_STRIPE_PRICE_IDS = Object.freeze({
  esential_monthly: 'price_1TAzSw1ax2jGrLZHiihltxme',
  esential_yearly:  'price_1TAzSw1ax2jGrLZHq7UZbHBt',
  plus_monthly:     'price_1TAzSx1ax2jGrLZH9zPBW4PW',
  plus_yearly:      'price_1TAzSy1ax2jGrLZHPtB0oLr3',
  pro_monthly:      'price_1T6a4F1ax2jGrLZH92vUsGzE',
  pro_yearly:       'price_1TAzSz1ax2jGrLZHPfhcPu81',
  studio_monthly:   'price_1T6a501ax2jGrLZHgLBbkzT4',
  studio_yearly:    'price_1TAzT01ax2jGrLZHsqLDBI44',
  addon:            'price_1T6a5e1ax2jGrLZHbnDNHkwM',
})

const FALLBACK_REGULAR_STRIPE_PRICE_IDS = Object.freeze({
  esential_monthly: 'price_1U1Qt31ax2jGrLZHYsjdMS6c',
  esential_yearly:  'price_1U1Qt31ax2jGrLZHtIROmtcV',
  plus_monthly:     'price_1U1Qt41ax2jGrLZHuddImmll',
  plus_yearly:      'price_1U1Qt51ax2jGrLZHXrm1KBrK',
  pro_monthly:      'price_1U1Qt61ax2jGrLZHahcYtOC6',
  pro_yearly:       'price_1U1Qt61ax2jGrLZH258DaGGZ',
  studio_monthly:   'price_1U1Qt71ax2jGrLZHBilAcXHi',
  studio_yearly:    'price_1U1Qt81ax2jGrLZHd6ZPVoDy',
})

const LEGACY_STRIPE_PRICE_IDS = Object.freeze({
  Esential: [
    'price_1T6a3S1ax2jGrLZHmevohZWA',
    'price_1TAwpq1pBe1FB1ICMrpWiGvp',
    'price_1TAwpq1pBe1FB1ICPafRQt8m',
  ],
  Plus: [
    'price_1TAwpr1pBe1FB1ICoADRS2t1',
    'price_1TAwps1pBe1FB1IC4jUywXzL',
  ],
  Pro: [
    'price_1TAwpt1pBe1FB1ICWbscU6NL',
    'price_1TAwpt1pBe1FB1ICYt0RrpQA',
  ],
  Studio: [
    'price_1TAwpu1pBe1FB1ICDvu7ghLj',
    'price_1TAwpv1pBe1FB1ICYIhJiX7v',
  ],
})

const SUPPORTED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'charge.dispute.created',
])

const PLAN_BY_PRICE_ID = Object.freeze({
  [FALLBACK_STRIPE_PRICE_IDS.esential_monthly]: 'Esential',
  [FALLBACK_STRIPE_PRICE_IDS.esential_yearly]:  'Esential',
  [FALLBACK_STRIPE_PRICE_IDS.plus_monthly]:     'Plus',
  [FALLBACK_STRIPE_PRICE_IDS.plus_yearly]:      'Plus',
  [FALLBACK_STRIPE_PRICE_IDS.pro_monthly]:      'Pro',
  [FALLBACK_STRIPE_PRICE_IDS.pro_yearly]:       'Pro',
  [FALLBACK_STRIPE_PRICE_IDS.studio_monthly]:   'Studio',
  [FALLBACK_STRIPE_PRICE_IDS.studio_yearly]:    'Studio',
  [FALLBACK_STRIPE_PRICE_IDS.addon]:            'Studio',
  ...Object.fromEntries(
    Object.entries(LEGACY_STRIPE_PRICE_IDS).flatMap(([plan, ids]) => ids.map((id) => [id, plan]))
  ),
})

function sanitizePriceId(value) {
  return String(value || '').trim()
}

function getFounderPriceIdsByPlanKey() {
  return {
    esential_monthly: sanitizePriceId(process.env.STRIPE_PRICE_ESENTIAL_MONTHLY) || FALLBACK_STRIPE_PRICE_IDS.esential_monthly,
    esential_yearly: sanitizePriceId(process.env.STRIPE_PRICE_ESENTIAL_YEARLY) || FALLBACK_STRIPE_PRICE_IDS.esential_yearly,
    plus_monthly: sanitizePriceId(process.env.STRIPE_PRICE_PLUS_MONTHLY) || FALLBACK_STRIPE_PRICE_IDS.plus_monthly,
    plus_yearly: sanitizePriceId(process.env.STRIPE_PRICE_PLUS_YEARLY) || FALLBACK_STRIPE_PRICE_IDS.plus_yearly,
    pro_monthly: sanitizePriceId(process.env.STRIPE_PRICE_PRO_MONTHLY) || FALLBACK_STRIPE_PRICE_IDS.pro_monthly,
    pro_yearly: sanitizePriceId(process.env.STRIPE_PRICE_PRO_YEARLY) || FALLBACK_STRIPE_PRICE_IDS.pro_yearly,
    studio_monthly: sanitizePriceId(process.env.STRIPE_PRICE_STUDIO_MONTHLY) || FALLBACK_STRIPE_PRICE_IDS.studio_monthly,
    studio_yearly: sanitizePriceId(process.env.STRIPE_PRICE_STUDIO_YEARLY) || FALLBACK_STRIPE_PRICE_IDS.studio_yearly,
  }
}

function getRegularPriceIdsByPlanKey() {
  return {
    esential_monthly: sanitizePriceId(process.env.STRIPE_PRICE_ESENTIAL_REGULAR_MONTHLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.esential_monthly,
    esential_yearly: sanitizePriceId(process.env.STRIPE_PRICE_ESENTIAL_REGULAR_YEARLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.esential_yearly,
    plus_monthly: sanitizePriceId(process.env.STRIPE_PRICE_PLUS_REGULAR_MONTHLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.plus_monthly,
    plus_yearly: sanitizePriceId(process.env.STRIPE_PRICE_PLUS_REGULAR_YEARLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.plus_yearly,
    pro_monthly: sanitizePriceId(process.env.STRIPE_PRICE_PRO_REGULAR_MONTHLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.pro_monthly,
    pro_yearly: sanitizePriceId(process.env.STRIPE_PRICE_PRO_REGULAR_YEARLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.pro_yearly,
    studio_monthly: sanitizePriceId(process.env.STRIPE_PRICE_STUDIO_REGULAR_MONTHLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.studio_monthly,
    studio_yearly: sanitizePriceId(process.env.STRIPE_PRICE_STUDIO_REGULAR_YEARLY) || FALLBACK_REGULAR_STRIPE_PRICE_IDS.studio_yearly,
  }
}

function sanitizeCheckoutPlanKey(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const valid = new Set([
    'esential_monthly', 'esential_yearly',
    'plus_monthly', 'plus_yearly',
    'pro_monthly', 'pro_yearly',
    'studio_monthly', 'studio_yearly',
  ])
  return valid.has(normalized) ? normalized : ''
}

function isFounderOfferActive(nowMs = Date.now()) {
  return Number.isFinite(Number(nowMs)) && Number(nowMs) <= FOUNDER_OFFER_END_MS
}

function getCheckoutPriceIdForPlanKey(planKey, nowMs = Date.now()) {
  const normalizedPlanKey = sanitizeCheckoutPlanKey(planKey)
  if (!normalizedPlanKey) return ''
  const priceIds = isFounderOfferActive(nowMs)
    ? getFounderPriceIdsByPlanKey()
    : getRegularPriceIdsByPlanKey()
  return sanitizePriceId(priceIds[normalizedPlanKey])
}

function getAllowedCheckoutPriceIds(nowMs = Date.now()) {
  const ids = Object.values(getRegularPriceIdsByPlanKey())
  if (isFounderOfferActive(nowMs)) ids.push(...Object.values(getFounderPriceIdsByPlanKey()))
  return new Set(ids.filter(Boolean))
}

function getAllConfiguredPlanPriceMap() {
  const result = { ...PLAN_BY_PRICE_ID }
  const planByKey = {
    esential_monthly: 'Esential', esential_yearly: 'Esential',
    plus_monthly: 'Plus', plus_yearly: 'Plus',
    pro_monthly: 'Pro', pro_yearly: 'Pro',
    studio_monthly: 'Studio', studio_yearly: 'Studio',
  }
  for (const priceIds of [getFounderPriceIdsByPlanKey(), getRegularPriceIdsByPlanKey()]) {
    for (const [key, id] of Object.entries(priceIds)) {
      if (id) result[id] = planByKey[key]
    }
  }
  return result
}

function isFounderPriceId(priceId) {
  const candidate = sanitizePriceId(priceId)
  if (!candidate) return false
  const knownFounderIds = [
    ...Object.values(getFounderPriceIdsByPlanKey()),
    ...Object.values(LEGACY_STRIPE_PRICE_IDS).flat(),
  ]
  return knownFounderIds.includes(candidate)
}

function getStudioPriceIdSet() {
  return new Set(
    Object.entries(getAllConfiguredPlanPriceMap())
      .filter(([, plan]) => plan === 'Studio')
      .map(([priceId]) => priceId)
      .filter(Boolean)
  )
}

function getAddonPriceId() {
  return sanitizePriceId(process.env.STRIPE_PRICE_ADDON) || FALLBACK_STRIPE_PRICE_IDS.addon
}

function extractPrimarySubscriptionPriceId(subscription = {}) {
  const items = subscription.items?.data
  if (Array.isArray(items)) {
    for (const item of items) {
      const candidate = sanitizePriceId(item?.price?.id || item?.price || item?.priceId)
      if (candidate) return candidate
    }
  }

  return sanitizePriceId(subscription.price?.id || subscription.price || subscription.priceId)
}

function isAddonCheckoutSession(session = {}) {
  return String(session?.metadata?.type || '').trim().toLowerCase() === 'addon'
}

function isStudioPlanName(value) {
  return normalizePlanName(value) === 'Studio'
}

async function hasStudioPlanInFirestore(uid) {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid) return false

  const [userSnap, overrideSnap, subsSnap] = await Promise.all([
    db.collection('users').doc(normalizedUid).get(),
    db.collection('adminOverrides').doc(normalizedUid).get(),
    db.collection('customers').doc(normalizedUid).collection('subscriptions').get(),
  ])

  const userData = userSnap.exists ? (userSnap.data() || {}) : {}
  if (isStudioPlanName(userData.plan) || isStudioPlanName(userData.subscriptionPlan) || isStudioPlanName(userData.currentPlan)) {
    return true
  }

  const overrideData = overrideSnap.exists ? (overrideSnap.data() || {}) : {}
  if (isStudioPlanName(overrideData.plan)) {
    return true
  }

  const studioPriceIds = getStudioPriceIdSet()
  for (const subDoc of subsSnap.docs) {
    const sub = subDoc.data() || {}
    const status = String(sub.status || '').trim().toLowerCase()
    if (!['active', 'trialing'].includes(status)) continue

    const priceId = extractPrimarySubscriptionPriceId(sub)
    if (priceId && studioPriceIds.has(priceId)) return true

    if (
      isStudioPlanName(sub.plan)
      || isStudioPlanName(sub.role)
      || isStudioPlanName(sub.metadata?.plan)
      || isStudioPlanName(sub.metadata?.tier)
    ) {
      return true
    }
  }

  return false
}

function readBearerAuthHeader(req) {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || '').trim()
  if (!authHeader.startsWith('Bearer ')) {
    throw new HttpsError('unauthenticated', 'Lipsește token-ul de autentificare.')
  }
  return authHeader
}

function parseJsonRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try {
    return JSON.parse(Buffer.from(req.rawBody || '').toString('utf8') || '{}')
  } catch (_) {
    return {}
  }
}

function constantTimeSecretEquals(left, right) {
  const leftValue = String(left || '')
  const rightValue = String(right || '')
  if (!leftValue || !rightValue) return false

  const leftHash = crypto.createHash('sha256').update(leftValue).digest()
  const rightHash = crypto.createHash('sha256').update(rightValue).digest()
  return crypto.timingSafeEqual(leftHash, rightHash)
}

async function verifyRequestAuth(req) {
  const authHeader = readBearerAuthHeader(req)
  const forwardedToken = String(req.get?.('X-Firebase-Auth') || '').trim()
  const token = forwardedToken || authHeader.slice('Bearer '.length).trim()
  if (!token) {
    throw new HttpsError('unauthenticated', 'Token invalid.')
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    return String(decoded?.uid || '').trim()
  } catch (err) {
    throw new HttpsError('unauthenticated', 'Token invalid sau expirat.')
  }
}

function getB2Config() {
  const bucketName = String(B2_BUCKET_NAME.value() || '').trim()
  const keyId = String(B2_KEY_ID.value() || '').trim()
  const appKey = String(B2_APPLICATION_KEY.value() || '').trim()
  if (!bucketName || !keyId || !appKey) {
    throw new HttpsError('internal', 'Lipsesc credențialele B2.')
  }

  return {
    bucketName,
    keyId,
    appKey,
  }
}

async function deleteB2Prefix(prefix) {
  const config = getB2Config()
  const basicAuth = Buffer.from(`${config.keyId}:${config.appKey}`).toString('base64')

  const authRes = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', {
    headers: {
      Authorization: `Basic ${basicAuth}`,
    },
  })
  const authText = await authRes.text()
  const authData = authText ? JSON.parse(authText) : {}
  if (!authRes.ok) {
    throw new Error(`B2 auth failed: ${authRes.status} ${authText.slice(0, 200)}`)
  }

  const authorizationToken = String(authData?.authorizationToken || '').trim()
  const accountId = String(authData?.accountId || '').trim()
  const apiUrl = String(authData?.apiInfo?.storageApi?.apiUrl || authData?.apiUrl || '').trim()
  if (!authorizationToken || !accountId || !apiUrl) {
    throw new Error('B2 auth response incomplete.')
  }

  const bucketsRes = await fetch(`${apiUrl}/b2api/v4/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
      bucketName: config.bucketName,
    }),
  })
  const bucketsText = await bucketsRes.text()
  const bucketsData = bucketsText ? JSON.parse(bucketsText) : {}
  if (!bucketsRes.ok) {
    throw new Error(`B2 list buckets failed: ${bucketsRes.status} ${bucketsText.slice(0, 200)}`)
  }

  const bucketId = String(bucketsData?.buckets?.[0]?.bucketId || '').trim()
  if (!bucketId) {
    throw new Error('B2 bucket not found')
  }

  const filesToDelete = []
  let startFileName = prefix

  while (true) {
    const listPayload = {
      bucketId,
      prefix,
      maxFileCount: 1000,
    }
    if (startFileName) {
      listPayload.startFileName = startFileName
    }

    const listRes = await fetch(`${apiUrl}/b2api/v4/b2_list_file_names`, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listPayload),
    })
    const listText = await listRes.text()
    const listData = listText ? JSON.parse(listText) : {}
    if (!listRes.ok) {
      throw new Error(`B2 list failed: ${listRes.status} ${listText.slice(0, 200)}`)
    }

    for (const file of listData?.files || []) {
      const fileId = String(file?.fileId || '').trim()
      const fileName = String(file?.fileName || '').trim()
      if (fileId && fileName && fileName.startsWith(prefix)) {
        filesToDelete.push({ fileId, fileName })
      }
    }

    const nextFileName = String(listData?.nextFileName || '').trim()
    if (!nextFileName) break
    startFileName = nextFileName
  }

  let deletedTotal = 0
  for (let index = 0; index < filesToDelete.length; index += 50) {
    const batch = filesToDelete.slice(index, index + 50)
    await Promise.all(batch.map(async ({ fileId, fileName }) => {
      const deleteRes = await fetch(`${apiUrl}/b2api/v4/b2_delete_file_version`, {
        method: 'POST',
        headers: {
          Authorization: authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId, fileName }),
      })
      const deleteText = await deleteRes.text()
      if (!deleteRes.ok) {
        throw new Error(`B2 delete failed: ${deleteRes.status} ${deleteText.slice(0, 200)}`)
      }
    }))
    deletedTotal += batch.length
  }

  return deletedTotal
}

function normalizePlanName(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!normalized) return ''
  if (normalized.includes('studio') || normalized.includes('unlimited')) return 'Studio'
  if (normalized.includes('pro')) return 'Pro'
  if (normalized.includes('plus')) return 'Plus'
  if (normalized.includes('esential') || normalized.includes('starter')) return 'Esential'
  if (normalized.includes('free')) return 'Free'
  return ''
}

const PLAN_PRIORITY = Object.freeze({
  Free: 0,
  Esential: 1,
  Plus: 2,
  Pro: 3,
  Studio: 4,
})

async function resolveUserPlanFromFirestore(uid) {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid) return 'Free'

  const [overrideSnap, subsSnap] = await Promise.all([
    db.collection('adminOverrides').doc(normalizedUid).get(),
    db.collection('customers').doc(normalizedUid).collection('subscriptions').get(),
  ])

  const overrideData = overrideSnap.exists ? (overrideSnap.data() || {}) : {}
  const overridePlan = normalizePlanName(overrideData.plan)
  if (overridePlan) return overridePlan

  let resolvedPlan = 'Free'
  for (const subDoc of subsSnap.docs) {
    const subscription = subDoc.data() || {}
    const status = String(subscription.status || '').trim().toLowerCase()
    if (!['active', 'trialing'].includes(status)) continue

    const candidates = [
      resolvePlanFromPriceId(extractPrimarySubscriptionPriceId(subscription)),
      normalizePlanName(subscription.plan),
      normalizePlanName(subscription.role),
      normalizePlanName(subscription.metadata?.plan),
      normalizePlanName(subscription.metadata?.tier),
    ]
    const candidate = candidates.find(Boolean) || 'Free'
    if ((PLAN_PRIORITY[candidate] || 0) > (PLAN_PRIORITY[resolvedPlan] || 0)) {
      resolvedPlan = candidate
    }
  }

  return resolvedPlan
}

function resolvePlanFromPriceId(priceId) {
  const id = sanitizePriceId(priceId)
  if (!id) return ''
  return getAllConfiguredPlanPriceMap()[id] || ''
}

function resolvePlanFromAmount(amountMinorUnits) {
  const amount = Number(amountMinorUnits)
  if (!Number.isFinite(amount)) return ''
  if (amount === 2900  || amount === 28900)  return 'Esential'
  if (amount === 3900  || amount === 39000)  return 'Esential'
  if (amount === 4900  || amount === 48900)  return 'Plus'
  if (amount === 6900  || amount === 69000)  return 'Plus'
  if (amount === 7900  || amount === 78900)  return 'Pro'
  if (amount === 9900  || amount === 99000)  return 'Pro'
  if (amount === 12900 || amount === 128900) return 'Studio'
  if (amount === 14900 || amount === 149000) return 'Studio'
  return ''
}

function resolvePlanNameFromStripePayload({ session = {}, invoice = {}, userData = {} } = {}) {
  const priceIdsFromInvoice = (invoice.lines?.data || []).map(
    (line) => line?.price?.id || line?.pricing?.price_details?.price || ''
  )
  const priceCandidates = [
    session.metadata?.priceId,
    session.metadata?.stripePriceId,
    ...priceIdsFromInvoice,
  ]

  for (const priceId of priceCandidates) {
    const byPriceId = resolvePlanFromPriceId(priceId)
    if (byPriceId) return byPriceId
  }

  const nameCandidates = [
    session.metadata?.planName,
    session.metadata?.plan,
    ...(invoice.lines?.data || []).map((line) => line?.description),
    userData.plan,
    userData.subscriptionPlan,
    userData.currentPlan,
  ]

  for (const value of nameCandidates) {
    const byName = normalizePlanName(value)
    if (byName) return byName
  }

  const byAmount = resolvePlanFromAmount(
    invoice.amount_due ?? invoice.amount_paid ?? session.amount_total
  )
  if (byAmount) return byAmount

  return 'Esential'
}

function sanitizeRedirectUrl(value, fieldName) {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new HttpsError('invalid-argument', `${fieldName} este obligatoriu.`)
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch (_) {
    throw new HttpsError('invalid-argument', `${fieldName} nu este un URL valid.`)
  }

  const protocol = String(parsed.protocol || '').toLowerCase()
  const hostname = String(parsed.hostname || '').toLowerCase()
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  if (protocol !== 'https:' && !(isLocalhost && protocol === 'http:')) {
    throw new HttpsError('invalid-argument', `${fieldName} trebuie să folosească https.`)
  }

  return parsed.toString()
}

function getCheckoutStripeKey() {
  const extensionKey = sanitizePriceId(STRIPE_EXTENSION_API_KEY.value())
  if (extensionKey) return extensionKey
  return sanitizePriceId(STRIPE_SECRET_KEY.value())
}

function isMainSubscriptionData(subscription = {}) {
  const status = String(subscription.status || '').trim().toLowerCase()
  if (!['active', 'trialing'].includes(status)) return false
  if (String(subscription.metadata?.type || '').trim().toLowerCase() === 'addon') return false
  return extractPrimarySubscriptionPriceId(subscription) !== getAddonPriceId()
}

async function getCheckoutCustomerContext(uid) {
  const normalizedUid = String(uid || '').trim()
  const [userSnap, customerSnap, subscriptionsSnap] = await Promise.all([
    db.collection('users').doc(normalizedUid).get(),
    db.collection('customers').doc(normalizedUid).get(),
    db.collection('customers').doc(normalizedUid).collection('subscriptions').get(),
  ])

  const userData = userSnap.exists ? (userSnap.data() || {}) : {}
  const customerData = customerSnap.exists ? (customerSnap.data() || {}) : {}
  const stripeCustomerId = [
    userData.stripeCustomerId,
    userData.stripe_customer_id,
    customerData.stripeId,
    customerData.stripeCustomerId,
    customerData.stripe_customer_id,
    customerData.customer_id,
  ].map(sanitizePriceId).find((value) => value.startsWith('cus_')) || ''

  const subscriptions = subscriptionsSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
  const activeMainSubscription = subscriptions.find(isMainSubscriptionData) || null
  const activeAddonSubscription = subscriptions.find((subscription) => {
    const status = String(subscription.status || '').trim().toLowerCase()
    return ['active', 'trialing'].includes(status)
      && extractPrimarySubscriptionPriceId(subscription) === getAddonPriceId()
  }) || null

  return {
    userData,
    stripeCustomerId,
    activeMainSubscription,
    activeAddonSubscription,
  }
}

async function hasActiveMainSubscriptionInStripe(stripe, stripeCustomerId) {
  const customerId = sanitizePriceId(stripeCustomerId)
  if (!customerId) return false
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })
  return subscriptions.data.some(isMainSubscriptionData)
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp()
}

function toMajorAmount(amountMinorUnits) {
  const numeric = Number(amountMinorUnits)
  if (!Number.isFinite(numeric)) return 0
  return Number((numeric / 100).toFixed(2))
}

function sanitizeIdPart(value, fallback = 'invoice') {
  const clean = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return (clean || fallback).slice(0, 120)
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 190)
}

function sanitizeContactField(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen)
}

function isValidEmail(value) {
  const email = normalizeEmail(value)
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function sanitizeInvoiceId(value) {
  const clean = String(value || '').trim()
  if (!clean) return ''
  if (clean.includes('/')) return ''
  return clean.slice(0, 120)
}

function sanitizeDisplayName(value, maxLen = 120) {
  return String(value || '').trim().slice(0, maxLen)
}

function keysFromSelection(data = {}) {
  return Array.isArray(data?.keys)
    ? data.keys.map((key) => String(key || '').trim()).filter(Boolean)
    : []
}

function listsFromSelection(data = {}) {
  if (!Array.isArray(data?.lists)) return []
  return data.lists.slice(0, 50).map((list, index) => ({
    id: sanitizeDisplayName(list?.id || `list_${index}`, 120),
    name: sanitizeDisplayName(list?.name || 'Favorite', 80),
    keys: Array.isArray(list?.keys)
      ? list.keys.slice(0, 3000).map((key) => String(key || '').trim()).filter(Boolean)
      : [],
  }))
}

function timestampToIso(value) {
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  const parsed = new Date(value || '')
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function getAppOrigin() {
  try {
    return new URL(MINA_DASHBOARD_URL).origin
  } catch (_) {
    return 'https://cloudbymina.com'
  }
}

function buildGalleryPublicUrl(galleryId, galleryData = {}) {
  const origin = getAppOrigin()
  const slug = String(galleryData?.slug || '').trim()
  if (slug) return `${origin}/g/${encodeURIComponent(slug)}`

  const safeGalleryId = String(galleryId || '').trim()
  if (!safeGalleryId) return origin
  return `${origin}/gallery/${encodeURIComponent(safeGalleryId)}`
}

async function getPhotographerProfile(uid) {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid) return {}

  const [userSnap, profileSnap, cardProfileSnap] = await Promise.all([
    db.collection('users').doc(normalizedUid).get().catch(() => null),
    db.collection('profiles').doc(normalizedUid).get().catch(() => null),
    db.collection('users').doc(normalizedUid).collection('profile').doc('main').get().catch(() => null),
  ])

  const userData = userSnap?.exists ? (userSnap.data() || {}) : {}
  const profileData = profileSnap?.exists ? (profileSnap.data() || {}) : {}
  const cardProfileData = cardProfileSnap?.exists ? (cardProfileSnap.data() || {}) : {}

  return {
    email: normalizeEmail(userData.email || profileData.emailContact || cardProfileData.email || ''),
    photographerName:
      sanitizeDisplayName(userData.name || profileData.brandName || cardProfileData.numeBrand || cardProfileData.name || '') || 'Fotograf',
    brandingName:
      sanitizeDisplayName(profileData.brandName || cardProfileData.numeBrand || userData.brandName || userData.name || '') || 'Mina',
  }
}

function resolveUidFromSessionPayload(session = {}) {
  return (
    session.client_reference_id ||
    session.metadata?.uid ||
    session.metadata?.firebaseUid ||
    session.metadata?.firebase_uid ||
    ''
  )
}

function getUidFromNestedDocPath(docRef) {
  const uid = docRef?.parent?.parent?.id || ''
  return String(uid || '').trim()
}

async function resolveUidFromSessionFallback(session = {}) {
  const payloadUid = resolveUidFromSessionPayload(session)
  if (payloadUid) {
    return {
      uid: String(payloadUid).trim(),
      source: 'client_reference_id_or_metadata',
    }
  }

  const stripeCustomerId = String(session.customer || '').trim()
  if (stripeCustomerId) {
    const customerFields = ['stripeCustomerId', 'stripe_customer_id', 'stripeId', 'customer_id']

    for (const field of customerFields) {
      const usersSnap = await db
        .collection('users')
        .where(field, '==', stripeCustomerId)
        .limit(1)
        .get()

      if (!usersSnap.empty) {
        return {
          uid: usersSnap.docs[0].id,
          source: `users.${field}`,
        }
      }
    }

    for (const field of customerFields) {
      const customersSnap = await db
        .collection('customers')
        .where(field, '==', stripeCustomerId)
        .limit(1)
        .get()

      if (!customersSnap.empty) {
        return {
          uid: customersSnap.docs[0].id,
          source: `customers.${field}`,
        }
      }
    }
  }

  const stripeSubscriptionId = String(session.subscription || '').trim()
  if (stripeSubscriptionId) {
    const subscriptionSnap = await db
      .collectionGroup('subscriptions')
      .where(admin.firestore.FieldPath.documentId(), '==', stripeSubscriptionId)
      .limit(1)
      .get()

    if (!subscriptionSnap.empty) {
      const uid = getUidFromNestedDocPath(subscriptionSnap.docs[0].ref)
      if (uid) {
        return {
          uid,
          source: 'subscriptions.docId',
        }
      }
    }
  }

  const checkoutSessionDocId = String(session.id || '').trim()
  if (checkoutSessionDocId) {
    const checkoutSnap = await db
      .collectionGroup('checkout_sessions')
      .where(admin.firestore.FieldPath.documentId(), '==', checkoutSessionDocId)
      .limit(1)
      .get()

    if (!checkoutSnap.empty) {
      const uid = getUidFromNestedDocPath(checkoutSnap.docs[0].ref)
      if (uid) {
        return {
          uid,
          source: 'checkout_sessions.docId',
        }
      }
    }
  }

  return {
    uid: '',
    source: 'unresolved',
  }
}

async function resolveUidFromStripeCustomerId(stripeCustomerId) {
  const candidate = String(stripeCustomerId || '').trim()
  if (!candidate) return { uid: '', source: 'missing_customer_id' }

  const resolved = await resolveUidFromSessionFallback({ customer: candidate })
  return {
    uid: String(resolved.uid || '').trim(),
    source: resolved.source || 'unresolved',
  }
}

async function resolveCustomerEmail({ session = {}, userData = {}, uid = '' } = {}) {
  const candidates = [
    session.customer_details?.email,
    session.customer_email,
    session.metadata?.customerEmail,
    session.metadata?.email,
    userData.email,
    userData.billingEmail,
    userData.billingDetails?.email,
  ]

  for (const value of candidates) {
    const normalized = normalizeEmail(value)
    if (normalized) return normalized
  }

  if (uid) {
    try {
      const authUser = await admin.auth().getUser(uid)
      const authEmail = normalizeEmail(authUser?.email)
      if (authEmail) return authEmail
    } catch (err) {
      logger.warn('Could not resolve email from Firebase Auth.', {
        uid,
        message: err?.message || String(err),
      })
    }
  }

  return ''
}

async function buildPaymentData(stripe, session, event) {
  let lineItems = []

  try {
    const lineItemsResponse = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 50,
    })

    lineItems = (lineItemsResponse?.data || []).map((item) => {
      const quantity = Math.max(1, Number(item.quantity || 1))
      const total = toMajorAmount(item.amount_total ?? item.amount_subtotal)
      const unitPrice = quantity > 0 ? Number((total / quantity).toFixed(2)) : total

      const priceId =
        typeof item.price === 'string'
          ? item.price
          : String(item.price?.id || '').trim() || null

      return {
        name: String(item.description || 'Abonament Mina').slice(0, 180),
        quantity,
        unitPrice,
        priceId,
      }
    })
  } catch (err) {
    logger.warn('Stripe listLineItems failed, fallback to single line item.', {
      sessionId: session.id,
      message: err?.message || String(err),
    })
  }

  const amount = toMajorAmount(session.amount_total)
  const currency = String(session.currency || 'RON').toUpperCase()

  if (!lineItems.length) {
    lineItems = [
      {
        name: String(session.metadata?.planName || 'Abonament Mina').slice(0, 180),
        quantity: 1,
        unitPrice: amount,
        priceId: String(session.metadata?.priceId || session.metadata?.stripePriceId || '').trim() || null,
      },
    ]
  }

  return {
    amount,
    currency,
    lineItems,
    primaryPriceId: lineItems.find((item) => item?.priceId)?.priceId || null,
    description: lineItems[0]?.name || 'Abonament Mina',
    stripeEventId: event.id,
    stripeSessionId: session.id || null,
    stripePaymentIntentId: session.payment_intent || null,
    stripeSubscriptionId: session.subscription || null,
    stripeCustomerId: session.customer || null,
    paidAt: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
  }
}


function getEmailService() {
  return createEmailService({
    apiKey: String(RESEND_API_KEY.value() || process.env.RESEND_API_KEY || '').trim(),
    fromEmail: MINA_EMAIL_FROM,
    dashboardUrl: MINA_DASHBOARD_URL,
    priceIdToPlan: getAllConfiguredPlanPriceMap(),
  })
}

async function acquireEventLock(event, uid, sessionId) {
  const eventRef = db.collection('stripeWebhookEvents').doc(event.id)
  let state = 'acquired'

  await db.runTransaction(async (tx) => {
    const current = await tx.get(eventRef)

    if (current.exists) {
      const status = String(current.data()?.status || '')
      if (status === 'processed') {
        state = 'processed'
        return
      }
      if (status === 'processing') {
        state = 'processing'
        return
      }
    }

    tx.set(
      eventRef,
      {
        type: event.type,
        uid,
        stripeSessionId: sessionId || null,
        status: 'processing',
        updatedAt: serverTimestamp(),
        createdAt: current.exists ? current.data()?.createdAt || serverTimestamp() : serverTimestamp(),
      },
      { merge: true }
    )
  })

  return state
}

async function markEvent(eventId, payload) {
  await db
    .collection('stripeWebhookEvents')
    .doc(eventId)
    .set(
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
}

async function handleCheckoutSessionCompleted(event) {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: '2024-06-20',
  })

  const session = event.data?.object || {}
  const resolved = await resolveUidFromSessionFallback(session)
  const uid = resolved.uid

  if (!uid) {
    throw new Error('checkout.session.completed missing uid (client_reference_id/metadata/customer/subscription lookup failed)')
  }

  logger.info('Resolved UID for checkout.session.completed', {
    eventId: event.id,
    sessionId: session.id || null,
    uid,
    source: resolved.source,
  })

  const lockState = await acquireEventLock(event, uid, session.id)
  if (lockState === 'processed') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processed',
      uid,
      sessionId: session.id,
    }
  }

  if (lockState === 'processing') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processing',
      uid,
      sessionId: session.id,
    }
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()

  if (!userSnap.exists) {
    throw new Error(`User not found for uid: ${uid}`)
  }

  const userData = userSnap.data() || {}

  const stripeCustomerId = String(session.customer || '').trim()
  if (stripeCustomerId && stripeCustomerId !== String(userData.stripeCustomerId || '').trim()) {
    await userRef.set(
      {
        stripeCustomerId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    logger.info('Stored stripeCustomerId on user profile', {
      uid,
      stripeCustomerId,
    })
  }

  const billingDetails = userData.billingDetails
  if (!billingDetails) {
    throw new Error(`Missing billingDetails for uid: ${uid}`)
  }

  const customerEmail = await resolveCustomerEmail({
    session,
    userData,
    uid,
  })

  if (!customerEmail) {
    throw new Error('Missing customer email for SmartBill invoice (Stripe session + user profile + Firebase Auth)')
  }

  const paymentData = await buildPaymentData(stripe, session, event)
  paymentData.customerEmail = customerEmail

  const isAddonCheckout = isAddonCheckoutSession(session)
  const addonPriceId = sanitizePriceId(session.metadata?.priceId || paymentData.primaryPriceId || getAddonPriceId()) || getAddonPriceId()

  if (isAddonCheckout) {
    await userRef.set(
      {
        addonActive: true,
        addonPriceId,
        addonSubscriptionId: String(paymentData.stripeSubscriptionId || session.subscription || '').trim() || null,
        addonActivatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  } else {
    const primaryPlanPriceId = sanitizePriceId(
      session.metadata?.priceId || paymentData.primaryPriceId
    )
    await userRef.set(
      {
        founderPriceActive: isFounderPriceId(primaryPlanPriceId),
        subscriptionPriceId: primaryPlanPriceId || null,
        subscriptionPlan: resolvePlanFromPriceId(primaryPlanPriceId) || session.metadata?.planName || null,
        subscriptionPricingVersion: isFounderPriceId(primaryPlanPriceId) ? 'founder-2026' : 'standard-2026',
        subscriptionActivatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  const smartBillService = new SmartBillService({
    username: SMARTBILL_USERNAME.value(),
    token: SMARTBILL_TOKEN.value(),
    cif: SMARTBILL_CIF.value(),
    seriesName: SMARTBILL_SERIES_NAME.value(),
  })

  const invoice = await smartBillService.issueInvoice(billingDetails, paymentData)
  const invoiceDocId = sanitizeIdPart(invoice.number, 'invoice')

  await userRef
    .collection('invoices')
    .doc(invoiceDocId)
    .set(
      {
        invoiceId: invoiceDocId,
        series: invoice.series,
        number: invoice.number,
        url: invoice.url || null,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customerEmail,
        stripeEventId: event.id,
        stripeSessionId: paymentData.stripeSessionId,
        stripePaymentIntentId: paymentData.stripePaymentIntentId,
        stripeSubscriptionId: paymentData.stripeSubscriptionId,
        stripeCustomerId: paymentData.stripeCustomerId,
        billingSnapshot: billingDetails,
        lineItems: paymentData.lineItems,
        status: 'issued',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

  if (!isAddonCheckout) {
    try {
      const paymentEmailResult = await getEmailService().sendPaymentSuccessEmail({
        uid,
        customerEmail,
        session,
        paymentData,
        userData,
      })

      logger.info('Payment success email processed', {
        uid,
        eventId: event.id,
        ...paymentEmailResult,
      })
    } catch (emailError) {
      logger.error('Payment success email failed', {
        uid,
        eventId: event.id,
        message: emailError?.message || String(emailError),
      })
    }
  }

  await markEvent(event.id, {
    status: 'processed',
    uid,
    uidSource: resolved.source,
    invoiceId: invoiceDocId,
    invoiceSeries: invoice.series,
    invoiceNumber: invoice.number,
    invoiceUrl: invoice.url || null,
    checkoutType: isAddonCheckout ? 'addon' : 'plan',
    addonActive: isAddonCheckout ? true : undefined,
    addonPriceId: isAddonCheckout ? addonPriceId : undefined,
  })

  return {
    ok: true,
    skipped: false,
    uid,
    uidSource: resolved.source,
    sessionId: session.id,
    checkoutType: isAddonCheckout ? 'addon' : 'plan',
    addonActive: isAddonCheckout ? true : undefined,
    invoice: {
      id: invoiceDocId,
      series: invoice.series,
      number: invoice.number,
      url: invoice.url || null,
    },
  }
}



async function handleCustomerSubscriptionDeleted(event) {
  const subscription = event.data?.object || {}
  const stripeCustomerId = String(subscription.customer || '').trim()
  if (!stripeCustomerId) {
    throw new Error('customer.subscription.deleted missing customer id')
  }

  const resolved = await resolveUidFromStripeCustomerId(stripeCustomerId)
  const uid = resolved.uid
  if (!uid) {
    throw new Error('customer.subscription.deleted unresolved uid for customer: ' + stripeCustomerId)
  }

  const lockState = await acquireEventLock(event, uid, String(subscription.id || '').trim() || null)
  if (lockState === 'processed') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processed',
      uid,
    }
  }

  if (lockState === 'processing') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processing',
      uid,
    }
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new Error('User not found for uid: ' + uid)
  }

  const userData = userSnap.data() || {}
  const deletedPriceId = extractPrimarySubscriptionPriceId(subscription)
  const planName =
    resolvePlanFromPriceId(deletedPriceId) ||
    normalizePlanName(userData.plan || userData.subscriptionPlan || userData.currentPlan) ||
    normalizePlanName(subscription.items?.data?.[0]?.price?.nickname) || 'Plan activ'
  const addonPriceId = getAddonPriceId()
  const isAddonCancellation = Boolean(deletedPriceId && deletedPriceId === addonPriceId)

  if (isAddonCancellation) {
    await userRef.set(
      {
        addonActive: false,
        addonSubscriptionId: null,
        addonCanceledAt: serverTimestamp(),
        stripeCustomerId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    await markEvent(event.id, {
      status: 'processed',
      uid,
      uidSource: resolved.source,
      stripeCustomerId,
      stripeSubscriptionId: String(subscription.id || '').trim() || null,
      stripePriceId: deletedPriceId || null,
      addonActive: false,
      addonCancellation: true,
    })

    return {
      ok: true,
      skipped: false,
      uid,
      uidSource: resolved.source,
      stripeCustomerId,
      addonCancellation: true,
    }
  }

  const customerEmail = await resolveCustomerEmail({
    session: {
      customer: stripeCustomerId,
      customer_email: subscription.customer_email || '',
    },
    userData,
    uid,
  })

  await userRef.set(
    {
      plan: 'free',
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: serverTimestamp(),
      founderPriceActive: false,
      subscriptionPricingVersion: null,
      addonActive: false,
      addonSubscriptionId: null,
      stripeCustomerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  try {
    const result = await getEmailService().sendSubscriptionCanceledEmail({
      customerEmail,
      planName,
    })

    logger.info('Subscription canceled email processed', {
      uid,
      eventId: event.id,
      ...result,
    })
  } catch (emailError) {
    logger.error('Subscription canceled email failed', {
      uid,
      eventId: event.id,
      message: emailError?.message || String(emailError),
    })
  }

  await markEvent(event.id, {
    status: 'processed',
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: String(subscription.id || '').trim() || null,
    stripePriceId: deletedPriceId || null,
  })

  return {
    ok: true,
    skipped: false,
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
    addonCancellation: false,
  }
}

async function handleInvoicePaymentFailed(event) {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: '2024-06-20',
  })

  const invoice = event.data?.object || {}
  const stripeCustomerId = String(invoice.customer || '').trim()
  if (!stripeCustomerId) {
    throw new Error('invoice.payment_failed missing customer id')
  }

  const resolved = await resolveUidFromStripeCustomerId(stripeCustomerId)
  const uid = resolved.uid
  if (!uid) {
    throw new Error('invoice.payment_failed unresolved uid for customer: ' + stripeCustomerId)
  }

  const lockState = await acquireEventLock(event, uid, String(invoice.id || '').trim() || null)
  if (lockState === 'processed') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processed',
      uid,
    }
  }

  if (lockState === 'processing') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processing',
      uid,
    }
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new Error('User not found for uid: ' + uid)
  }

  const userData = userSnap.data() || {}
  const planName = resolvePlanNameFromStripePayload({ invoice, userData })

  const customerEmail = await resolveCustomerEmail({
    session: {
      customer: stripeCustomerId,
      customer_email: invoice.customer_email || '',
    },
    userData,
    uid,
  })

  let customerPortalUrl = ''
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: MINA_DASHBOARD_URL,
    })
    customerPortalUrl = String(portalSession?.url || '').trim()
  } catch (portalError) {
    logger.warn('Stripe customer portal session could not be created', {
      uid,
      eventId: event.id,
      stripeCustomerId,
      message: portalError?.message || String(portalError),
    })
  }

  await userRef.set(
    {
      subscriptionStatus: 'past_due',
      paymentFailedAt: serverTimestamp(),
      stripeCustomerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  try {
    const result = await getEmailService().sendPaymentFailedEmail({
      customerEmail,
      planName,
      customerPortalUrl,
    })

    logger.info('Payment failed email processed', {
      uid,
      eventId: event.id,
      ...result,
    })
  } catch (emailError) {
    logger.error('Payment failed email failed', {
      uid,
      eventId: event.id,
      message: emailError?.message || String(emailError),
    })
  }

  await markEvent(event.id, {
    status: 'processed',
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
    subscriptionStatus: 'past_due',
    stripeInvoiceId: String(invoice.id || '').trim() || null,
  })

  return {
    ok: true,
    skipped: false,
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
    customerPortalUrl: customerPortalUrl || null,
  }
}

async function handleChargeDisputeCreated(event) {
  const dispute = event.data?.object || {}
  const stripeCustomerId = String(dispute.customer || '').trim()
  if (!stripeCustomerId) {
    throw new Error('charge.dispute.created missing customer id')
  }

  const resolved = await resolveUidFromStripeCustomerId(stripeCustomerId)
  const uid = resolved.uid
  if (!uid) {
    throw new Error('charge.dispute.created unresolved uid for customer: ' + stripeCustomerId)
  }

  const lockState = await acquireEventLock(event, uid, String(dispute.id || '').trim() || null)
  if (lockState === 'processed') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processed',
      uid,
    }
  }

  if (lockState === 'processing') {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processing',
      uid,
    }
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new Error('User not found for uid: ' + uid)
  }

  const userData = userSnap.data() || {}
  const customerEmail = await resolveCustomerEmail({
    session: {
      customer: stripeCustomerId,
    },
    userData,
    uid,
  })

  await userRef.set(
    {
      subscriptionStatus: 'disputed',
      disputeCreatedAt: serverTimestamp(),
      stripeCustomerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  try {
    const result = await getEmailService().sendDisputeEmail({
      customerEmail,
    })

    logger.info('Dispute email processed', {
      uid,
      eventId: event.id,
      ...result,
    })
  } catch (emailError) {
    logger.error('Dispute email failed', {
      uid,
      eventId: event.id,
      message: emailError?.message || String(emailError),
    })
  }

  await markEvent(event.id, {
    status: 'processed',
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
    subscriptionStatus: 'disputed',
    stripeDisputeId: String(dispute.id || '').trim() || null,
    stripeChargeId: String(dispute.charge || '').trim() || null,
  })

  return {
    ok: true,
    skipped: false,
    uid,
    uidSource: resolved.source,
    stripeCustomerId,
  }
}


// ── Gallery password verification (server-side) ────────────────────────────────

const crypto = require('crypto')
const GALLERY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function normalizeGalleryId(value) {
  const galleryId = String(value || '').trim()
  if (!galleryId || galleryId.includes('/')) return ''
  return galleryId
}

async function getOwnedGalleryOrThrow(uid, galleryId) {
  const normalizedUid = String(uid || '').trim()
  const normalizedGalleryId = normalizeGalleryId(galleryId)
  if (!normalizedGalleryId) {
    throw new HttpsError('invalid-argument', 'galleryId invalid.')
  }

  const galleryRef = db.collection('galerii').doc(normalizedGalleryId)
  const gallerySnap = await galleryRef.get()
  if (!gallerySnap.exists) {
    throw new HttpsError('not-found', 'Galeria nu există.')
  }

  const galleryData = gallerySnap.data() || {}
  const ownerUid = String(galleryData.userId || '').trim()
  if (!ownerUid || ownerUid !== normalizedUid) {
    throw new HttpsError('permission-denied', 'Nu ai permisiunea pentru această galerie.')
  }

  return {
    galleryId: normalizedGalleryId,
    galleryRef,
    galleryData,
    ownerUid,
  }
}

async function getGalleryPasswordHash(galleryId) {
  const normalizedGalleryId = normalizeGalleryId(galleryId)
  if (!normalizedGalleryId) return ''
  const secretSnap = await db.collection('gallerySecrets').doc(normalizedGalleryId).get()
  return String(secretSnap.data()?.passwordHash || '').trim().toLowerCase()
}

async function saveGalleryPasswordHash(galleryId, password = '') {
  const normalizedGalleryId = normalizeGalleryId(galleryId)
  if (!normalizedGalleryId) {
    throw new HttpsError('invalid-argument', 'galleryId invalid.')
  }

  const secretRef = db.collection('gallerySecrets').doc(normalizedGalleryId)
  const galleryRef = db.collection('galerii').doc(normalizedGalleryId)
  const normalizedPassword = String(password || '').trim()
  if (!normalizedPassword) {
    await Promise.all([
      secretRef.delete().catch(() => {}),
      galleryRef.update({
        'settings.privacy.passwordHash': admin.firestore.FieldValue.delete(),
      }).catch(() => {}),
    ])
    return { cleared: true }
  }

  const passwordHash = crypto.createHash('sha256').update(normalizedPassword).digest('hex')
  await Promise.all([
    secretRef.set(
      {
        passwordHash,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    galleryRef.update({
      'settings.privacy.passwordHash': admin.firestore.FieldValue.delete(),
    }).catch(() => {}),
  ])

  return { cleared: false, passwordHash }
}

function requireVerifiedCallableUser(request) {
  const uid = String(request.auth?.uid || '').trim()
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')
  }
  if (request.auth?.token?.email_verified !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Confirmă adresa de email înainte să creezi galerii, să publici site-ul sau să încarci fotografii.'
    )
  }
  return uid
}

async function requireAdminCallableUser(request) {
  const uid = requireVerifiedCallableUser(request)
  const userSnap = await db.collection('users').doc(uid).get()
  const userData = userSnap.exists ? (userSnap.data() || {}) : {}
  if (userData.isAdmin !== true && String(userData.role || '').trim().toLowerCase() !== 'admin') {
    throw new HttpsError('permission-denied', 'Acces permis doar administratorilor.')
  }
  return uid
}

exports.getAdminAuthUserIds = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
  },
  async (request) => {
    await requireAdminCallableUser(request)
    const uids = []
    let pageToken
    do {
      const page = await admin.auth().listUsers(1000, pageToken)
      uids.push(...page.users.map((user) => user.uid))
      pageToken = page.pageToken
    } while (pageToken)
    return { uids }
  }
)

function sanitizeCallablePayload(value, maxBytes, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${label} invalid.`)
  }

  let serialized = ''
  try {
    serialized = JSON.stringify(value)
  } catch (_) {
    throw new HttpsError('invalid-argument', `${label} invalid.`)
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new HttpsError('invalid-argument', `${label} este prea mare.`)
  }
  return JSON.parse(serialized)
}

function sanitizePublicSlug(value, fallback = '') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)

  return normalized || `galerie-${crypto.randomBytes(4).toString('hex')}`
}

function stripPrivateGalleryFields(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {}
  const nextSettings = { ...settings }
  if (nextSettings.privacy && typeof nextSettings.privacy === 'object' && !Array.isArray(nextSettings.privacy)) {
    const privacy = { ...nextSettings.privacy }
    delete privacy.passwordHash
    nextSettings.privacy = privacy
  }
  return nextSettings
}

exports.createGallery = onCall(
  {
    region: 'us-central1',
    maxInstances: 40,
  },
  async (request) => {
    const uid = requireVerifiedCallableUser(request)
    const input = sanitizeCallablePayload(request.data?.gallery, 160 * 1024, 'Galeria')
    const name = sanitizeDisplayName(input.nume, 160)
    if (!name) {
      throw new HttpsError('invalid-argument', 'Numele galeriei este obligatoriu.')
    }

    const plan = await resolveUserPlanFromFirestore(uid)
    const galleryRef = db.collection('galerii').doc()
    const baseSlug = sanitizePublicSlug(input.slug, name)
    const fallbackSlug = `${baseSlug}-${galleryRef.id.slice(0, 6).toLowerCase()}`
    const baseSlugRef = db.collection('slugs').doc(baseSlug)
    const fallbackSlugRef = db.collection('slugs').doc(fallbackSlug)
    const ownerQuery = db.collection('galerii').where('userId', '==', uid)
    const userSnap = await db.collection('users').doc(uid).get()
    const userData = userSnap.exists ? (userSnap.data() || {}) : {}

    const createdSlug = await db.runTransaction(async (transaction) => {
      const [ownerGalleries, baseSlugSnap, fallbackSlugSnap] = await Promise.all([
        transaction.get(ownerQuery),
        transaction.get(baseSlugRef),
        transaction.get(fallbackSlugRef),
      ])

      if (plan === 'Free') {
        const activeCount = ownerGalleries.docs.reduce((count, galleryDoc) => {
          const gallery = galleryDoc.data() || {}
          const status = String(gallery.status || 'active').trim().toLowerCase()
          const isActive = !['trash', 'archived'].includes(status) && gallery.statusActiv !== false
          return count + (isActive ? 1 : 0)
        }, 0)
        if (activeCount >= 3) {
          throw new HttpsError(
            'resource-exhausted',
            'Planul Free permite maximum 3 galerii active. Arhivează una sau alege un abonament.'
          )
        }
      }

      let slug = baseSlug
      let slugRef = baseSlugRef
      if (baseSlugSnap.exists) {
        if (fallbackSlugSnap.exists) {
          throw new HttpsError('already-exists', 'Nu am putut genera un link unic. Încearcă din nou.')
        }
        slug = fallbackSlug
        slugRef = fallbackSlugRef
      }

      const dataExpirare = input.dataExpirare ? String(input.dataExpirare) : null
      const expiryDate = dataExpirare ? new Date(dataExpirare) : null
      const payload = {
        nume: name,
        slug,
        categoria: sanitizeDisplayName(input.categoria, 80) || 'Nunți',
        dataEveniment: input.dataEveniment ? String(input.dataEveniment).slice(0, 80) : null,
        dataExpirare,
        dataExpirareTs: expiryDate && !Number.isNaN(expiryDate.getTime())
          ? admin.firestore.Timestamp.fromDate(expiryDate)
          : null,
        storageDuration: input.storageDuration ? String(input.storageDuration).slice(0, 40) : null,
        settings: stripPrivateGalleryFields(input.settings),
        gridLayout: sanitizeDisplayName(input.gridLayout, 30) || '4col',
        numeSelectieClient: sanitizeDisplayName(input.numeSelectieClient, 120) || 'Selecție fotografii',
        limitSelectie: Number.isFinite(Number(input.limitSelectie)) ? Math.max(0, Number(input.limitSelectie)) : null,
        maxSelectie: Number.isFinite(Number(input.maxSelectie)) ? Math.max(0, Number(input.maxSelectie)) : null,
        allowOriginalDownloads: input.allowOriginalDownloads === true,
        userId: uid,
        userName: sanitizeDisplayName(userData.name || input.userName, 120) || 'Fotograf',
        poze: 0,
        data: new Date().toISOString(),
        createdAt: serverTimestamp(),
        status: 'active',
        statusActiv: true,
      }

      transaction.create(galleryRef, payload)
      transaction.create(slugRef, {
        galleryId: galleryRef.id,
        uid,
        updatedAt: serverTimestamp(),
      })
      return slug
    })

    return { id: galleryRef.id, slug: createdSlug, plan }
  }
)

exports.savePhotographerSite = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
  },
  async (request) => {
    const uid = requireVerifiedCallableUser(request)
    const plan = await resolveUserPlanFromFirestore(uid)
    if (plan === 'Free') {
      throw new HttpsError('permission-denied', 'Site-ul de prezentare este disponibil în orice abonament plătit.')
    }

    const input = sanitizeCallablePayload(request.data?.site, 700 * 1024, 'Site-ul')
    const brandName = sanitizeDisplayName(input.brandName, 160)
    const slug = sanitizePublicSlug(input.slug, brandName)
    const siteRef = db.collection('photographerSites').doc(uid)

    const duplicateSnap = await db.collection('photographerSites').where('slug', '==', slug).limit(2).get()
    if (duplicateSnap.docs.some((siteDoc) => siteDoc.id !== uid)) {
      throw new HttpsError('already-exists', 'Acest link este deja folosit. Alege un alt nume de brand.')
    }

    const cleanSite = {
      ...input,
      uid,
      brandName,
      slug,
      updatedAt: serverTimestamp(),
    }
    delete cleanSite.id

    await db.runTransaction(async (transaction) => {
      const currentSiteSnap = await transaction.get(siteRef)
      const previousSlugRaw = String(currentSiteSnap.data()?.slug || '').trim()
      const previousSlug = previousSlugRaw ? sanitizePublicSlug(previousSlugRaw) : ''
      const newSlugRef = db.collection('siteSlugs').doc(slug)
      const previousSlugRef = previousSlug && previousSlug !== slug
        ? db.collection('siteSlugs').doc(previousSlug)
        : null
      const refsToRead = [transaction.get(newSlugRef)]
      if (previousSlugRef) refsToRead.push(transaction.get(previousSlugRef))
      const [newSlugSnap, previousSlugSnap] = await Promise.all(refsToRead)

      const claimedUid = String(newSlugSnap.data()?.uid || '').trim()
      if (newSlugSnap.exists && claimedUid && claimedUid !== uid) {
        throw new HttpsError('already-exists', 'Acest link este deja folosit. Alege un alt nume de brand.')
      }

      transaction.set(siteRef, cleanSite, { merge: request.data?.merge !== false })
      transaction.set(newSlugRef, { uid, updatedAt: serverTimestamp() }, { merge: true })
      if (previousSlugRef && previousSlugSnap?.exists && previousSlugSnap.data()?.uid === uid) {
        transaction.delete(previousSlugRef)
      }
    })

    return { ok: true, slug, plan }
  }
)

exports.setGalleryStatus = onCall(
  {
    region: 'us-central1',
    maxInstances: 40,
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')

    const galleryId = normalizeGalleryId(request.data?.galleryId)
    const nextStatus = String(request.data?.status || '').trim().toLowerCase()
    if (!galleryId || !['active', 'archived', 'trash'].includes(nextStatus)) {
      throw new HttpsError('invalid-argument', 'Statusul galeriei este invalid.')
    }

    const plan = await resolveUserPlanFromFirestore(uid)
    const galleryRef = db.collection('galerii').doc(galleryId)
    const ownerQuery = db.collection('galerii').where('userId', '==', uid)

    await db.runTransaction(async (transaction) => {
      const [gallerySnap, ownerGalleries] = await Promise.all([
        transaction.get(galleryRef),
        transaction.get(ownerQuery),
      ])
      if (!gallerySnap.exists || String(gallerySnap.data()?.userId || '') !== uid) {
        throw new HttpsError('permission-denied', 'Nu ai permisiunea pentru această galerie.')
      }

      const currentStatus = String(gallerySnap.data()?.status || 'active').trim().toLowerCase()
      if (nextStatus === 'active' && currentStatus !== 'active' && plan === 'Free') {
        const activeCount = ownerGalleries.docs.reduce((count, galleryDoc) => {
          const gallery = galleryDoc.data() || {}
          const status = String(gallery.status || 'active').trim().toLowerCase()
          const isActive = !['trash', 'archived'].includes(status) && gallery.statusActiv !== false
          return count + (isActive ? 1 : 0)
        }, 0)
        if (activeCount >= 3) {
          throw new HttpsError(
            'resource-exhausted',
            'Planul Free permite maximum 3 galerii active. Arhivează una sau alege un abonament.'
          )
        }
      }

      const patch = { status: nextStatus, updatedAt: serverTimestamp() }
      if (nextStatus === 'trash') patch.deletedAt = serverTimestamp()
      if (nextStatus === 'archived') patch.archivedAt = serverTimestamp()
      if (nextStatus === 'active') {
        patch.restoredAt = serverTimestamp()
        patch.deletedAt = admin.firestore.FieldValue.delete()
        patch.archivedAt = admin.firestore.FieldValue.delete()
      }
      transaction.update(galleryRef, patch)
    })

    return { ok: true, status: nextStatus, plan }
  }
)

async function applyUserStorageDelta(uid, deltaBytes) {
  const normalizedUid = String(uid || '').trim()
  const delta = Math.trunc(Number(deltaBytes || 0))
  if (!normalizedUid || !Number.isFinite(delta)) {
    throw new HttpsError('invalid-argument', 'Delta storage invalid.')
  }

  const userRef = db.collection('users').doc(normalizedUid)
  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef)
    const userData = userSnap.exists ? (userSnap.data() || {}) : {}
    const candidates = [userData.storageUsedBytes, userData.storageBytesUsed]
    let currentBytes = 0
    for (const candidate of candidates) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed) && parsed >= 0) {
        currentBytes = Math.trunc(parsed)
        break
      }
    }

    const nextBytes = Math.max(0, currentBytes + delta)
    transaction.set(
      userRef,
      {
        storageUsedBytes: nextBytes,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    return nextBytes
  })
}

function buildGalleryUnlockToken(galleryId, secret) {
  const expiry = Date.now() + GALLERY_TOKEN_TTL_MS
  const payload = `${galleryId}:${expiry}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

function verifyGalleryUnlockTokenInternal(galleryId, token, secret) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return false
    const [tokenGalleryId, expiryStr, sig] = parts
    if (tokenGalleryId !== galleryId) return false
    const expiry = Number(expiryStr)
    if (!Number.isFinite(expiry) || Date.now() > expiry) return false
    const payload = `${tokenGalleryId}:${expiryStr}`
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch (_) {
    return false
  }
}

/**
 * Verifies gallery password server-side.
 * Reads passwordHash from gallerySecrets/{galleryId} (private collection).
 * Returns a signed 24h unlock token on success.
 */
exports.verifyGalleryPassword = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
    secrets: [GALLERY_VERIFY_SECRET],
  },
  async (request) => {
    const galleryId = String(request.data?.galleryId || '').trim()
    const password = String(request.data?.password || '').trim()

    if (!normalizeGalleryId(galleryId)) {
      throw new HttpsError('invalid-argument', 'galleryId invalid.')
    }
    if (!password) {
      throw new HttpsError('invalid-argument', 'Parola este obligatorie.')
    }

    const storedHash = await getGalleryPasswordHash(galleryId)
    if (!storedHash) {
      throw new HttpsError('permission-denied', 'Parolă incorectă.')
    }

    const enteredHash = crypto.createHash('sha256').update(password).digest('hex')
    const match = crypto.timingSafeEqual(
      Buffer.from(enteredHash, 'hex'),
      Buffer.from(storedHash.toLowerCase(), 'hex'),
    )
    if (!match) {
      throw new HttpsError('permission-denied', 'Parolă incorectă.')
    }

    const token = buildGalleryUnlockToken(galleryId, GALLERY_VERIFY_SECRET.value())
    return { token }
  }
)

/**
 * Verifies a previously issued gallery unlock token.
 * Stateless — verifies HMAC signature and expiry only (no Firestore lookup).
 */
exports.checkGalleryUnlockToken = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
    secrets: [GALLERY_VERIFY_SECRET],
  },
  async (request) => {
    const galleryId = String(request.data?.galleryId || '').trim()
    const token = String(request.data?.token || '').trim()

    if (!galleryId || !token) {
      return { valid: false }
    }

    const valid = verifyGalleryUnlockTokenInternal(galleryId, token, GALLERY_VERIFY_SECRET.value())
    return { valid }
  }
)

exports.saveGalleryPassword = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')
    }

    const galleryId = String(request.data?.galleryId || '').trim()
    const password = String(request.data?.password || '').trim()
    await getOwnedGalleryOrThrow(uid, galleryId)

    if (password.length > 120) {
      throw new HttpsError('invalid-argument', 'Parola este prea lungă.')
    }

    const result = await saveGalleryPasswordHash(galleryId, password)
    return {
      ok: true,
      cleared: result.cleared === true,
    }
  }
)

function getContactRateLimitKey(request) {
  const rawRequest = request.rawRequest
  const forwardedFor = String(rawRequest?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  const ip = String(rawRequest?.ip || forwardedFor || 'unknown').trim()
  return crypto
    .createHash('sha256')
    .update(`${process.env.GCLOUD_PROJECT || 'mina'}:${ip}`)
    .digest('hex')
}

async function enforceAssistantRateLimit(uid) {
  const rateRef = db.collection('assistantRateLimits').doc(uid)
  const now = admin.firestore.Timestamp.now()
  const nowMs = now.toMillis()
  const dayKey = new Date(nowMs).toISOString().slice(0, 10)

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateRef)
    const data = snap.exists ? (snap.data() || {}) : {}
    const sameDay = data.dayKey === dayKey
    const count = sameDay ? Math.max(0, Number(data.count || 0)) : 0
    const lastAtMs = typeof data.lastAt?.toMillis === 'function' ? data.lastAt.toMillis() : 0

    if (lastAtMs && (nowMs - lastAtMs) < 2500) {
      throw new HttpsError('resource-exhausted', 'Așteaptă câteva secunde înainte de următoarea întrebare.')
    }
    if (count >= 25) {
      throw new HttpsError('resource-exhausted', 'Ai atins limita de 25 de întrebări pentru astăzi.')
    }

    transaction.set(rateRef, {
      dayKey,
      count: count + 1,
      lastAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + 3 * 24 * 60 * 60 * 1000),
    }, { merge: true })
  })
}

exports.askMinaAssistant = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 35,
    memory: '256MiB',
    secrets: [OPENAI_API_KEY],
  },
  async (request) => {
    const uid = requireVerifiedCallableUser(request)
    const question = sanitizeAssistantText(request.data?.question, 500)
    if (!question) {
      throw new HttpsError('invalid-argument', 'Scrie o întrebare despre Mina.')
    }

    await enforceAssistantRateLimit(uid)

    const apiKey = String(OPENAI_API_KEY.value() || '').trim()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Ajutorul Mina nu este configurat momentan.')
    }

    const plan = await resolveUserPlanFromFirestore(uid).catch(() => 'Free')
    const page = sanitizeAssistantText(request.data?.page, 80) || 'dashboard'
    const history = sanitizeAssistantHistory(request.data?.history)

    try {
      const answer = await requestMinaAssistant({ apiKey, question, history, page, plan })
      return { answer }
    } catch (error) {
      logger.error('askMinaAssistant failed', {
        uid,
        status: Number(error?.status || 0) || null,
        code: String(error?.message || 'unknown').slice(0, 80),
      })
      if (Number(error?.status) === 429) {
        throw new HttpsError('resource-exhausted', 'Asistentul este ocupat momentan. Încearcă din nou în câteva secunde.')
      }
      throw new HttpsError('unavailable', 'Nu am putut răspunde acum. Încearcă din nou sau folosește formularul Contact.')
    }
  }
)

async function enforceContactRateLimit(request) {
  const rateRef = db.collection('contactRateLimits').doc(getContactRateLimitKey(request))
  const now = admin.firestore.Timestamp.now()
  const nowMs = now.toMillis()

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateRef)
    const data = snap.exists ? (snap.data() || {}) : {}
    const lastAtMs = typeof data.lastAt?.toMillis === 'function' ? data.lastAt.toMillis() : 0
    const windowStartedMs = typeof data.windowStartedAt?.toMillis === 'function'
      ? data.windowStartedAt.toMillis()
      : nowMs
    const inCurrentWindow = (nowMs - windowStartedMs) < 60 * 60 * 1000
    const currentCount = inCurrentWindow ? Math.max(0, Number(data.count || 0)) : 0

    if (lastAtMs && (nowMs - lastAtMs) < 60 * 1000) {
      throw new HttpsError('resource-exhausted', 'Ai trimis deja un mesaj. Încearcă din nou peste un minut.')
    }
    if (inCurrentWindow && currentCount >= 5) {
      throw new HttpsError('resource-exhausted', 'Prea multe mesaje trimise. Încearcă din nou mai târziu.')
    }

    transaction.set(rateRef, {
      count: currentCount + 1,
      lastAt: now,
      windowStartedAt: inCurrentWindow ? (data.windowStartedAt || now) : now,
      expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + 2 * 60 * 60 * 1000),
    }, { merge: true })
  })
}

async function enforceVerificationEmailRateLimit(uid) {
  const rateRef = db.collection('emailVerificationRateLimits').doc(uid)
  const now = admin.firestore.Timestamp.now()
  const nowMs = now.toMillis()

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateRef)
    const data = snap.exists ? (snap.data() || {}) : {}
    const lastAtMs = typeof data.lastAt?.toMillis === 'function' ? data.lastAt.toMillis() : 0
    const windowStartedMs = typeof data.windowStartedAt?.toMillis === 'function'
      ? data.windowStartedAt.toMillis()
      : nowMs
    const inCurrentWindow = (nowMs - windowStartedMs) < 60 * 60 * 1000
    const currentCount = inCurrentWindow ? Math.max(0, Number(data.count || 0)) : 0

    if (lastAtMs && (nowMs - lastAtMs) < 60 * 1000) {
      throw new HttpsError('resource-exhausted', 'Emailul a fost deja trimis. Încearcă din nou peste un minut.')
    }
    if (inCurrentWindow && currentCount >= 5) {
      throw new HttpsError('resource-exhausted', 'Ai cerut prea multe emailuri de confirmare. Încearcă din nou mai târziu.')
    }

    transaction.set(rateRef, {
      count: currentCount + 1,
      lastAt: now,
      windowStartedAt: inCurrentWindow ? (data.windowStartedAt || now) : now,
      expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + 2 * 60 * 60 * 1000),
    }, { merge: true })
  })
}

exports.sendBrandedVerificationEmail = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')
    }

    const authUser = await admin.auth().getUser(uid)
    if (authUser.emailVerified === true) {
      return { ok: true, alreadyVerified: true }
    }

    const email = normalizeEmail(authUser.email)
    if (!email || !isValidEmail(email)) {
      throw new HttpsError('failed-precondition', 'Contul nu are o adresă de email validă.')
    }

    await enforceVerificationEmailRateLimit(uid)

    let displayName = sanitizeDisplayName(authUser.displayName, 120)
    if (!displayName) {
      const userSnap = await db.collection('users').doc(uid).get()
      const userData = userSnap.exists ? (userSnap.data() || {}) : {}
      displayName = sanitizeDisplayName(userData.name || userData.brandName, 120)
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex')
    const emailHash = crypto.createHash('sha256').update(email).digest('hex')
    const tokenRef = db.collection('emailVerificationTokens').doc(tokenHash)
    const now = admin.firestore.Timestamp.now()
    const verificationUrl = `${getAppOrigin()}/verify-email?token=${encodeURIComponent(verificationToken)}`

    await tokenRef.set({
      uid,
      emailHash,
      createdAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
    })

    let result
    try {
      result = await getEmailService().sendVerificationEmail({
        toEmail: email,
        displayName: displayName || 'Fotograf',
        verificationUrl,
      })
    } catch (error) {
      await tokenRef.delete().catch(() => {})
      throw error
    }

    logger.info('Branded verification email sent.', {
      uid,
      sent: !result?.skipped,
    })

    return { ok: true, sent: !result?.skipped }
  }
)

exports.confirmBrandedEmail = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
  },
  async (request) => {
    const verificationToken = String(request.data?.token || '').trim()
    if (!/^[A-Za-z0-9_-]{43}$/.test(verificationToken)) {
      throw new HttpsError('invalid-argument', 'Linkul de confirmare este invalid.')
    }

    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex')
    const tokenRef = db.collection('emailVerificationTokens').doc(tokenHash)
    const tokenSnap = await tokenRef.get()
    if (!tokenSnap.exists) {
      throw new HttpsError('permission-denied', 'Linkul de confirmare este invalid sau a fost înlocuit.')
    }

    const tokenData = tokenSnap.data() || {}
    const uid = String(tokenData.uid || '').trim()
    const expiresAtMs = typeof tokenData.expiresAt?.toMillis === 'function'
      ? tokenData.expiresAt.toMillis()
      : 0
    if (!uid || expiresAtMs < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'Linkul de confirmare a expirat.')
    }

    const authUser = await admin.auth().getUser(uid)
    const currentEmail = normalizeEmail(authUser.email)
    const currentEmailHash = crypto.createHash('sha256').update(currentEmail).digest('hex')
    if (!currentEmail || !constantTimeSecretEquals(currentEmailHash, tokenData.emailHash)) {
      throw new HttpsError('permission-denied', 'Adresa contului s-a schimbat. Cere un link nou de confirmare.')
    }

    if (tokenData.usedAt && authUser.emailVerified !== true) {
      throw new HttpsError('permission-denied', 'Linkul de confirmare a fost deja folosit.')
    }

    if (authUser.emailVerified !== true) {
      await admin.auth().updateUser(uid, { emailVerified: true })
    }

    const verifiedAt = admin.firestore.Timestamp.now()
    await Promise.all([
      tokenRef.set({ usedAt: verifiedAt }, { merge: true }),
      db.collection('users').doc(uid).set({
        emailVerified: true,
        emailVerifiedAt: verifiedAt,
      }, { merge: true }),
    ])

    logger.info('Email verified through Mina link.', { uid })
    return {
      ok: true,
      verified: true,
      alreadyVerified: authUser.emailVerified === true,
    }
  }
)

exports.submitContactMessage = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    const honeypot = sanitizeContactField(request.data?.websiteConfirm, 200)
    if (honeypot) return { ok: true, accepted: true }

    const nume = sanitizeContactField(request.data?.nume || request.data?.name, 120)
    const email = normalizeEmail(request.data?.email)
    const phone = sanitizeContactField(request.data?.phone, 40)
    const mesaj = sanitizeContactField(request.data?.mesaj || request.data?.message, 5000)
    const photographerUid = sanitizeContactField(request.data?.photographerUid, 128)

    if (!nume || !email || !mesaj) {
      throw new HttpsError('invalid-argument', 'Nume, email și mesaj sunt obligatorii.')
    }

    if (!isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'Adresa de email este invalidă.')
    }

    if (photographerUid.includes('/')) {
      throw new HttpsError('invalid-argument', 'Destinatar invalid.')
    }

    await enforceContactRateLimit(request)

    const messageRef = await db.collection('contactMessages').add({
      name: nume,
      nume,
      email,
      phone,
      message: mesaj,
      mesaj,
      photographerUid: photographerUid || null,
      read: false,
      createdAt: serverTimestamp(),
    })

    let emailSent = false
    if (!photographerUid) {
      try {
        const result = await getEmailService().sendContactNotificationEmail({
          toEmail: 'hello@cloudbymina.com',
          nume,
          email,
          mesaj,
        })
        emailSent = !result?.skipped
        logger.info('Contact notification sent', {
          ...result,
          messageId: messageRef.id,
          fromEmail: email,
        })
      } catch (error) {
        logger.error('Contact notification failed', {
          messageId: messageRef.id,
          message: error?.message || String(error),
        })
      }
    }

    return {
      ok: true,
      accepted: true,
      emailSent,
    }
  }
)

exports.sendContactNotification = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
  },
  async () => {
    throw new HttpsError('failed-precondition', 'Acest endpoint a fost înlocuit.')
  }
)

exports.getGallerySelectionAccess = onCall(
  {
    region: 'us-central1',
    maxInstances: 40,
  },
  async (request) => {
    const galleryId = normalizeGalleryId(request.data?.galleryId)
    const clientName = normalizeSelectionClientName(request.data?.clientName)
    const clientId = toClientSelectionId(clientName)
    const accessToken = normalizeAccessToken(request.data?.accessToken)

    if (!galleryId || !clientId || !accessToken) {
      throw new HttpsError('invalid-argument', 'Datele selecției sunt invalide.')
    }

    const gallerySnap = await db.collection('galerii').doc(galleryId).get()
    if (!gallerySnap.exists || !isGalleryOpenForClientSelection(gallerySnap.data() || {})) {
      throw new HttpsError('permission-denied', 'Galeria nu permite selecții în acest moment.')
    }

    const selectionSnap = await db.collection('gallerySelections').doc(galleryId).collection('clients').doc(clientId).get()
    if (!selectionSnap.exists) {
      return {
        ok: true,
        exists: false,
        clientId,
        status: 'draft',
        count: 0,
        keys: [],
        lists: [],
      }
    }

    let selection = selectionSnap.data() || {}
    if (!normalizeAccessToken(selection.clientAccessToken)) {
      if (normalizeSelectionStatus(selection.status) === 'finalized') {
        throw new HttpsError('permission-denied', 'Această selecție aparține altei sesiuni de client.')
      }

      const now = admin.firestore.Timestamp.now()
      await selectionSnap.ref.set({
        clientAccessToken: accessToken,
        updatedAt: now,
      }, { merge: true })
      selection = { ...selection, clientAccessToken: accessToken }
    }

    if (!accessTokensMatch(selection.clientAccessToken, accessToken)) {
      throw new HttpsError('permission-denied', 'Această selecție aparține altei sesiuni de client.')
    }

    const keys = keysFromSelection(selection)
    return {
      ok: true,
      exists: true,
      clientId,
      clientName: sanitizeDisplayName(selection.clientName || clientName, 120),
      clientEmail: normalizeEmail(selection.clientEmail),
      clientPhone: sanitizeDisplayName(selection.clientPhone, 40),
      clientAdditionalInfo: sanitizeContactField(selection.clientAdditionalInfo, 1000),
      clientComment: sanitizeContactField(selection.clientComment, 1000),
      selectionTitle: sanitizeDisplayName(selection.selectionTitle, 160),
      status: normalizeSelectionStatus(selection.status),
      finalizedAt: timestampToIso(selection.finalizedAt),
      reopenedAt: timestampToIso(selection.reopenedAt),
      count: keys.length,
      keys,
      lists: listsFromSelection(selection),
    }
  }
)

exports.finalizeGallerySelection = onCall(
  {
    region: 'us-central1',
    maxInstances: 30,
  },
  async (request) => {
    const galleryId = normalizeGalleryId(request.data?.galleryId)
    const clientName = normalizeSelectionClientName(request.data?.clientName)
    const clientId = toClientSelectionId(clientName)
    const accessToken = normalizeAccessToken(request.data?.accessToken)

    if (!galleryId || !clientId || !accessToken) {
      throw new HttpsError('invalid-argument', 'Datele selecției sunt invalide.')
    }

    const galleryRef = db.collection('galerii').doc(galleryId)
    const selectionRef = db.collection('gallerySelections').doc(galleryId).collection('clients').doc(clientId)
    const now = admin.firestore.Timestamp.now()

    const result = await db.runTransaction(async (transaction) => {
      const [gallerySnap, selectionSnap] = await Promise.all([
        transaction.get(galleryRef),
        transaction.get(selectionRef),
      ])

      if (!gallerySnap.exists || !isGalleryOpenForClientSelection(gallerySnap.data() || {})) {
        throw new HttpsError('permission-denied', 'Galeria nu permite selecții în acest moment.')
      }
      if (!selectionSnap.exists) {
        throw new HttpsError('not-found', 'Selecția nu a fost găsită.')
      }

      const selection = selectionSnap.data() || {}
      if (!accessTokensMatch(selection.clientAccessToken, accessToken)) {
        throw new HttpsError('permission-denied', 'Această selecție aparține altei sesiuni de client.')
      }

      const keys = keysFromSelection(selection)
      if (keys.length === 0) {
        throw new HttpsError('failed-precondition', 'Selectează cel puțin o fotografie înainte de trimitere.')
      }

      if (normalizeSelectionStatus(selection.status) === 'finalized') {
        return {
          alreadyFinalized: true,
          count: keys.length,
          finalizedAt: timestampToIso(selection.finalizedAt),
        }
      }

      transaction.set(selectionRef, {
        status: 'finalized',
        finalizedAt: now,
        updatedAt: now,
        count: keys.length,
      }, { merge: true })

      return {
        alreadyFinalized: false,
        count: keys.length,
        finalizedAt: now.toDate().toISOString(),
      }
    })

    return {
      ok: true,
      clientId,
      status: 'finalized',
      ...result,
    }
  }
)

exports.reopenGallerySelection = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    const galleryId = normalizeGalleryId(request.data?.galleryId)
    const clientId = sanitizeDisplayName(request.data?.clientId, 120)

    if (!uid) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')
    if (!galleryId || !clientId || clientId.includes('/')) {
      throw new HttpsError('invalid-argument', 'Selecția este invalidă.')
    }

    const gallerySnap = await db.collection('galerii').doc(galleryId).get()
    if (!gallerySnap.exists) throw new HttpsError('not-found', 'Galeria nu a fost găsită.')
    if (String(gallerySnap.get('userId') || '').trim() !== uid) {
      throw new HttpsError('permission-denied', 'Nu poți redeschide selecțiile acestei galerii.')
    }

    const selectionRef = db.collection('gallerySelections').doc(galleryId).collection('clients').doc(clientId)
    const selectionSnap = await selectionRef.get()
    if (!selectionSnap.exists) throw new HttpsError('not-found', 'Selecția nu a fost găsită.')

    const now = admin.firestore.Timestamp.now()
    await selectionRef.set({
      status: 'draft',
      reopenedAt: now,
      finalizedAt: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    }, { merge: true })

    return {
      ok: true,
      clientId,
      status: 'draft',
      reopenedAt: now.toDate().toISOString(),
    }
  }
)

exports.onSelectionSaved = functionsV1
  .region('us-central1')
  .runWith({ secrets: ['RESEND_API_KEY'], maxInstances: 20 })
  .firestore.document('gallerySelections/{galleryId}/clients/{clientId}')
  .onWrite(async (change, context) => {
    const galleryId = String(context.params?.galleryId || '').trim()
    const clientId = String(context.params?.clientId || '').trim()
    const beforeData = change.before.exists ? (change.before.data() || {}) : {}
    const afterData = change.after.exists ? (change.after.data() || {}) : {}
    const afterKeys = keysFromSelection(afterData)

    if (!galleryId || !clientId) return null
    if (!change.after.exists) return null
    if (!didSelectionFinalize(beforeData, afterData)) return null

    const favoritesCount = afterKeys.length
    if (favoritesCount <= 0) return null

    try {
      const gallerySnap = await db.collection('galerii').doc(galleryId).get()
      if (!gallerySnap.exists) {
        logger.warn('onSelectionSaved skipped: gallery missing', { galleryId, clientId })
        return null
      }

      const galleryData = gallerySnap.data() || {}
      const ownerUid = String(galleryData.userId || '').trim()
      if (!ownerUid) {
        logger.warn('onSelectionSaved skipped: gallery owner missing', { galleryId, clientId })
        return null
      }

      const photographer = await getPhotographerProfile(ownerUid)
      if (!photographer.email) {
        logger.warn('onSelectionSaved skipped: photographer email missing', { galleryId, clientId, ownerUid })
        return null
      }

      const result = await getEmailService().sendSelectionFinalizedNotificationEmail({
        toEmail: photographer.email,
        galleryName: sanitizeDisplayName(galleryData.nume || 'Galerie Mina', 160),
        clientName: sanitizeDisplayName(afterData.clientName || clientId, 120),
        favoritesCount,
      })

      logger.info('onSelectionSaved finalization email sent', {
        galleryId,
        clientId,
        ownerUid,
        favoritesCount,
        ...result,
      })
    } catch (error) {
      logger.error('onSelectionSaved failed', {
        galleryId,
        clientId,
        message: error?.message || String(error),
      })
    }

    return null
  })

exports.sendWelcomeEmail = functionsV1
  .region('europe-west1')
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .auth.user()
  .onCreate(async (user) => {
    try {
      // Wait briefly for the client-side Firestore write (users/{uid}) to land,
      // since updateProfile + setDoc happen after Firebase Auth user creation.
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Resolve the photographer's name: Auth displayName → Firestore → fallback
      let displayName = String(user.displayName || '').trim()
      if (!displayName) {
        try {
          const userDoc = await db.collection('users').doc(user.uid).get()
          if (userDoc.exists) {
            const data = userDoc.data() || {}
            displayName = String(data.name || data.brandName || '').trim()
          }
        } catch (fsErr) {
          logger.warn('sendWelcomeEmail: could not read Firestore user doc', {
            uid: user.uid,
            error: fsErr?.message,
          })
        }
      }

      const result = await getEmailService().sendWelcomeEmail({
        email: user.email,
        displayName,
      })
      logger.info('sendWelcomeEmail finished', {
        uid: user.uid,
        ...result,
      })
      return null
    } catch (error) {
      logger.error('sendWelcomeEmail failed', {
        uid: user.uid,
        message: error?.message || String(error),
      })
      return null
    }
  })

exports.sendGalleryLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.')
    }

    const galleryId = String(request.data?.galleryId || '').trim()
    const clientEmail = normalizeEmail(request.data?.clientEmail)
    const clientName = sanitizeDisplayName(request.data?.clientName, 120)
    const galleryPassword = String(request.data?.galleryPassword || '').trim().slice(0, 120)

    if (!galleryId || galleryId.includes('/')) {
      throw new HttpsError('invalid-argument', 'galleryId invalid.')
    }
    if (!clientEmail || !isValidEmail(clientEmail)) {
      throw new HttpsError('invalid-argument', 'Adresa de email a clientului este invalidă.')
    }
    if (!clientName) {
      throw new HttpsError('invalid-argument', 'Numele clientului este obligatoriu.')
    }

    const { galleryData } = await getOwnedGalleryOrThrow(uid, galleryId)
    const storedHash = await getGalleryPasswordHash(galleryId)
    const isPasswordProtected = storedHash.length > 0
    if (isPasswordProtected && !galleryPassword) {
      throw new HttpsError('invalid-argument', 'Introdu parola galeriei pentru email.')
    }

    const photographer = await getPhotographerProfile(uid)
    const galleryUrl = buildGalleryPublicUrl(galleryId, galleryData)

    const result = await getEmailService().sendGalleryLinkEmail({
      toEmail: clientEmail,
      clientName,
      galleryName: sanitizeDisplayName(galleryData.nume || 'Galerie Mina', 160),
      galleryUrl,
      galleryPassword: isPasswordProtected ? galleryPassword : '',
      photographerName: photographer.photographerName,
      brandingName: photographer.brandingName,
    })

    logger.info('sendGalleryLink sent', {
      uid,
      galleryId,
      clientEmail,
      ...result,
    })

    return {
      ok: true,
      sent: !result?.skipped,
      galleryUrl,
    }
  }
)

exports.updateStorageUsed = functionsV1
  .region('us-central1')
  .runWith({ maxInstances: 40 })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    let uid = ''

    try {
      const authenticatedUid = await verifyRequestAuth(req)
      const payload = parseJsonRequestBody(req)
      uid = String(payload?.uid || '').trim()
      const deltaBytes = Math.trunc(Number(payload?.deltaBytes || 0))
      if (!uid || uid.includes('/')) {
        res.status(400).json({ error: 'uid invalid.' })
        return
      }
      if (!Number.isFinite(deltaBytes) || deltaBytes === 0) {
        res.status(400).json({ error: 'deltaBytes invalid.' })
        return
      }
      if (authenticatedUid !== uid) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const nextBytes = await applyUserStorageDelta(uid, deltaBytes)

      res.status(200).json({
        ok: true,
        storageUsedBytes: nextBytes,
      })
    } catch (error) {
      const code = error instanceof HttpsError ? error.code : 'internal'
      const message = error?.message || 'Actualizarea storage-ului a eșuat.'
      if (code === 'invalid-argument') {
        res.status(400).json({ error: message })
        return
      }
      if (code === 'permission-denied') {
        res.status(403).json({ error: message })
        return
      }
      if (code === 'unauthenticated') {
        res.status(401).json({ error: message })
        return
      }
      if (code === 'not-found') {
        res.status(404).json({ error: message })
        return
      }

      logger.error('updateStorageUsed failed', {
        uid,
        error: message,
      })
      res.status(500).json({ error: 'Actualizarea storage-ului a eșuat.' })
    }
  })

exports.verifyGalleryShareAccess = functionsV1
  .region('us-central1')
  .runWith({ maxInstances: 40 })
  .https.onRequest(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    try {
      const payload = parseJsonRequestBody(req)
      const galleryId = normalizeGalleryId(payload?.galleryId)
      const shareToken = String(payload?.shareToken || '').trim()
      if (!galleryId || !shareToken || shareToken.length > 256) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const gallerySnap = await db.collection('galerii').doc(galleryId).get()
      if (!gallerySnap.exists) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const galleryData = gallerySnap.data() || {}
      const status = String(galleryData.status || '').trim().toLowerCase()
      const galleryExpiry = galleryData.dataExpirareTs || galleryData.dataExpirare
      const galleryExpiryMs = typeof galleryExpiry?.toMillis === 'function'
        ? galleryExpiry.toMillis()
        : Date.parse(String(galleryExpiry || ''))
      const shareExpiry = galleryData.publicShareExpiresAt
      const shareExpiryMs = typeof shareExpiry?.toMillis === 'function'
        ? shareExpiry.toMillis()
        : Date.parse(String(shareExpiry || ''))
      const expectedHash = String(galleryData.publicShareTokenHash || '').trim().toLowerCase()
      const incomingHash = crypto.createHash('sha256').update(shareToken).digest('hex')

      const allowed = status !== 'trash'
        && status !== 'archived'
        && galleryData.statusActiv !== false
        && (!Number.isFinite(galleryExpiryMs) || galleryExpiryMs >= Date.now())
        && (!Number.isFinite(shareExpiryMs) || shareExpiryMs >= Date.now())
        && constantTimeSecretEquals(incomingHash, expectedHash)

      if (!allowed) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      res.status(200).json({ ok: true })
    } catch (error) {
      logger.error('verifyGalleryShareAccess failed', {
        error: error?.message || 'unknown error',
      })
      res.status(500).json({ error: 'Verification failed' })
    }
  })

exports.createCheckoutSession = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [STRIPE_EXTENSION_API_KEY, STRIPE_SECRET_KEY],
  },
  async (request) => {
    try {
      const uid = String(request.auth?.uid || '').trim()
      if (!uid) {
        throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat pentru checkout.')
      }

      const requestedPlanKey = sanitizeCheckoutPlanKey(request.data?.planId)
      const requestedPriceId = sanitizePriceId(request.data?.priceId)
      const priceId = requestedPlanKey
        ? getCheckoutPriceIdForPlanKey(requestedPlanKey)
        : requestedPriceId
      const successUrl = sanitizeRedirectUrl(request.data?.successUrl, 'successUrl')
      const cancelUrl = sanitizeRedirectUrl(request.data?.cancelUrl, 'cancelUrl')
      if (request.data?.termsAccepted !== true) {
        throw new HttpsError('failed-precondition', 'Trebuie să accepți Termenii și Politica de rambursare.')
      }

      if (!priceId) {
        throw new HttpsError(
          'failed-precondition',
          isFounderOfferActive()
            ? 'Prețul Fondator nu este configurat pentru acest plan.'
            : 'Prețul standard nu este configurat pentru acest plan.'
        )
      }
      const allowedPriceIds = getAllowedCheckoutPriceIds()
      if (!allowedPriceIds.has(priceId)) {
        throw new HttpsError('invalid-argument', 'Price ID invalid pentru checkout.')
      }

      const stripeKey = getCheckoutStripeKey()
      if (!stripeKey) {
        throw new HttpsError('failed-precondition', 'Cheia Stripe nu este configurată pe server.')
      }

      const stripe = new Stripe(stripeKey, {
        apiVersion: '2024-06-20',
      })

      const customerContext = await getCheckoutCustomerContext(uid)
      if (customerContext.activeMainSubscription) {
        throw new HttpsError(
          'already-exists',
          'Ai deja un abonament activ. Folosește portalul Stripe pentru schimbarea planului.'
        )
      }
      if (
        customerContext.stripeCustomerId
        && await hasActiveMainSubscriptionInStripe(stripe, customerContext.stripeCustomerId)
      ) {
        throw new HttpsError(
          'already-exists',
          'Ai deja un abonament activ. Folosește portalul Stripe pentru schimbarea planului.'
        )
      }

      const planName = resolvePlanFromPriceId(priceId)
      const pricingVersion = isFounderPriceId(priceId) ? 'founder-2026' : 'standard-2026'
      const planKey = requestedPlanKey || Object.entries(
        pricingVersion === 'founder-2026'
          ? getFounderPriceIdsByPlanKey()
          : getRegularPriceIdsByPlanKey()
      ).find(([, configuredPriceId]) => configuredPriceId === priceId)?.[0] || ''
      const subscriptionMetadata = {
        uid,
        firebase_uid: uid,
        priceId,
        planId: planKey,
        planName,
        type: 'plan',
        pricingVersion,
        termsVersion: '2026-08-founder',
      }

      await db.collection('users').doc(uid).set({
        termsAcceptedAt: serverTimestamp(),
        termsVersion: '2026-08-founder',
        digitalServiceImmediateConsentAt: serverTimestamp(),
      }, { merge: true })

      const sessionPayload = {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: false,
        client_reference_id: uid,
        metadata: {
          ...subscriptionMetadata,
          digitalServiceImmediateConsent: 'true',
        },
        subscription_data: {
          metadata: subscriptionMetadata,
        },
      }
      if (customerContext.stripeCustomerId) {
        sessionPayload.customer = customerContext.stripeCustomerId
      } else {
        const customerEmail = String(request.auth?.token?.email || customerContext.userData.email || '').trim()
        if (customerEmail) sessionPayload.customer_email = customerEmail
      }

      const session = await stripe.checkout.sessions.create(sessionPayload)

      if (!session?.url) {
        throw new HttpsError('internal', 'Stripe nu a returnat URL-ul de checkout.')
      }

      logger.info('createCheckoutSession success', {
        uid,
        priceId,
        planKey,
        pricingVersion,
        sessionId: session.id,
      })

      return {
        url: session.url,
        sessionId: session.id,
        pricingVersion,
      }
    } catch (error) {
      console.error('createCheckoutSession error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
      throw error
    }
  }
)

exports.createAddonCheckoutSession = onRequest(
  {
    region: 'us-central1',
    maxInstances: 20,
    cors: true,
    secrets: [STRIPE_EXTENSION_API_KEY, STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    let uid
    try {
      uid = await verifyRequestAuth(req)
    } catch (authError) {
      const code = authError instanceof HttpsError ? authError.code : 'unauthenticated'
      const message = authError?.message || 'Neautorizat.'
      res.status(code === 'permission-denied' ? 403 : 401).json({ error: message })
      return
    }

    const payload = req.body && typeof req.body === 'object'
      ? req.body
      : (() => {
          try {
            return JSON.parse(Buffer.from(req.rawBody || '').toString('utf8') || '{}')
          } catch (_) {
            return {}
          }
        })()

    const requestedUid = String(payload?.uid || '').trim() || uid
    if (!requestedUid || requestedUid !== uid) {
      res.status(403).json({ error: 'UID invalid pentru sesiunea curentă.' })
      return
    }

    const priceId = sanitizePriceId(payload?.priceId)
    const addonPriceId = getAddonPriceId()
    if (!priceId || priceId !== addonPriceId) {
      res.status(400).json({ error: 'Price ID invalid pentru add-on.' })
      return
    }

    const hasStudioPlan = await hasStudioPlanInFirestore(uid)
    if (!hasStudioPlan) {
      res.status(403).json({ error: 'Add-on disponibil doar pentru conturile cu plan Studio.' })
      return
    }

    let successUrl
    let cancelUrl
    try {
      successUrl = sanitizeRedirectUrl(payload?.successUrl || `${MINA_DASHBOARD_URL}?payment=success&addon=1`, 'successUrl')
      cancelUrl = sanitizeRedirectUrl(payload?.cancelUrl || `${MINA_DASHBOARD_URL}?payment=cancel&addon=1`, 'cancelUrl')
    } catch (urlError) {
      res.status(400).json({ error: urlError?.message || 'URL invalid.' })
      return
    }

    const stripeKey = getCheckoutStripeKey()
    if (!stripeKey) {
      res.status(500).json({ error: 'Cheia Stripe nu este configurată pe server.' })
      return
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-06-20',
    })

    const customerContext = await getCheckoutCustomerContext(uid)
    if (customerContext.activeAddonSubscription) {
      res.status(409).json({ error: 'Add-on-ul este deja activ pentru acest cont.' })
      return
    }
    const addonSubscriptionMetadata = {
      uid,
      firebase_uid: uid,
      priceId: addonPriceId,
      type: 'addon',
    }
    const sessionPayload = {
      mode: 'subscription',
      line_items: [{ price: addonPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      client_reference_id: uid,
      metadata: addonSubscriptionMetadata,
      subscription_data: {
        metadata: addonSubscriptionMetadata,
      },
    }
    if (customerContext.stripeCustomerId) {
      sessionPayload.customer = customerContext.stripeCustomerId
    }

    const session = await stripe.checkout.sessions.create(sessionPayload)

    if (!session?.url) {
      res.status(500).json({ error: 'Stripe nu a returnat URL-ul de checkout.' })
      return
    }

    logger.info('createAddonCheckoutSession success', {
      uid,
      priceId: addonPriceId,
      sessionId: session.id,
    })

    res.status(200).json({
      url: session.url,
      sessionId: session.id,
    })
  }
)

exports.deleteGalleryAssets = onRequest(
  {
    region: 'us-central1',
    maxInstances: 20,
    cors: true,
    secrets: [B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    let uid = ''
    let galleryId = ''

    try {
      uid = await verifyRequestAuth(req)
    } catch (authError) {
      const code = authError instanceof HttpsError ? authError.code : 'unauthenticated'
      const message = authError?.message || 'Neautorizat.'
      res.status(code === 'permission-denied' ? 403 : 401).json({ error: message })
      return
    }

    const payload = parseJsonRequestBody(req)
    const rawGalleryId = String(payload?.galleryId || '').trim()
    galleryId = rawGalleryId && !rawGalleryId.includes('/') ? rawGalleryId : ''
    if (!galleryId) {
      res.status(400).json({ error: 'galleryId invalid.' })
      return
    }

    try {
      const galleryRef = db.collection('galerii').doc(galleryId)
      const gallerySnap = await galleryRef.get()
      if (!gallerySnap.exists) {
        res.status(404).json({ error: 'Galeria nu există.' })
        return
      }

      const galleryData = gallerySnap.data() || {}
      const ownerUid = String(galleryData.userId || '').trim()
      if (!ownerUid || ownerUid !== uid) {
        res.status(403).json({ error: 'Nu ai permisiunea să ștergi această galerie.' })
        return
      }

      const prefix = `galerii/${galleryId}/`
      const deletedObjects = await deleteB2Prefix(prefix)

      const gallerySlug = String(galleryData.slug || '').trim().toLowerCase()
      const removedBytes = Math.max(0, Number(galleryData.storageBytes || 0))
      const batch = db.batch()

      if (gallerySlug) {
        batch.delete(db.collection('slugs').doc(gallerySlug))
      }
      batch.delete(galleryRef)

      await batch.commit()

      if (removedBytes > 0) {
        await applyUserStorageDelta(ownerUid, -removedBytes)
      }

      res.status(200).json({
        ok: true,
        galleryId,
        deleted: deletedObjects,
      })
    } catch (error) {
      logger.error('deleteGalleryAssets failed', {
        uid,
        galleryId,
        error: error?.message || String(error),
      })
      res.status(500).json({ error: 'Ștergerea galeriei a eșuat.' })
    }
  }
)

exports.downloadInvoicePdf = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [
      SMARTBILL_USERNAME,
      SMARTBILL_TOKEN,
      SMARTBILL_CIF,
      SMARTBILL_SERIES_NAME,
    ],
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat pentru a descărca factura.')
    }

    const invoiceId = sanitizeInvoiceId(request.data?.invoiceId || request.data?.id)
    if (!invoiceId) {
      throw new HttpsError('invalid-argument', 'invoiceId este obligatoriu.')
    }

    const invoiceRef = db.collection('users').doc(uid).collection('invoices').doc(invoiceId)
    const invoiceSnap = await invoiceRef.get()

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Factura nu a fost găsită.')
    }

    const invoiceData = invoiceSnap.data() || {}
    const series = String(invoiceData.series || '').trim()
    const number = String(invoiceData.number || '').trim()

    if (!series || !number) {
      throw new HttpsError(
        'failed-precondition',
        'Factura există, dar nu are serie/număr valide pentru descărcare.'
      )
    }

    const smartBillService = new SmartBillService({
      username: SMARTBILL_USERNAME.value(),
      token: SMARTBILL_TOKEN.value(),
      cif: SMARTBILL_CIF.value(),
      seriesName: SMARTBILL_SERIES_NAME.value(),
    })

    let pdf
    try {
      pdf = await smartBillService.downloadInvoicePdf({ series, number })
    } catch (err) {
      logger.error('SmartBill PDF download failed', {
        uid,
        invoiceId,
        series,
        number,
        message: err?.message || String(err),
      })
      throw new HttpsError('internal', err?.message || 'Nu pot descărca factura PDF momentan.')
    }

    await invoiceRef.set(
      {
        hasPdf: true,
        pdfLastCheckedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    const safeSeries = sanitizeIdPart(series, 'factura')
    const safeNumber = sanitizeIdPart(number, invoiceId)

    return {
      ok: true,
      invoiceId,
      series,
      number,
      filename: `factura-${safeSeries}-${safeNumber}.pdf`,
      contentType: String(pdf.contentType || 'application/pdf'),
      pdfBase64: pdf.buffer.toString('base64'),
    }
  }
)

exports.onStripeWebhook = onRequest(
  {
    region: 'europe-west1',
    maxInstances: 10,
    cors: false,
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      SMARTBILL_USERNAME,
      SMARTBILL_TOKEN,
      SMARTBILL_CIF,
      SMARTBILL_SERIES_NAME,
      RESEND_API_KEY,
    ],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    const signature = req.headers['stripe-signature']
    if (!signature) {
      res.status(400).send('Missing stripe-signature header')
      return
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: '2024-06-20',
    })

    let event
    try {
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}))
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET.value())
    } catch (err) {
      logger.error('Stripe signature verification failed', {
        message: err?.message || String(err),
      })
      res.status(400).send(`Webhook Error: ${err?.message || 'invalid signature'}`)
      return
    }

    if (!SUPPORTED_STRIPE_EVENTS.has(event.type)) {
      res.status(200).json({
        received: true,
        ignored: true,
        eventType: event.type,
      })
      return
    }

    try {
      let result
      if (event.type === 'checkout.session.completed') {
        result = await handleCheckoutSessionCompleted(event)
      } else if (event.type === 'customer.subscription.deleted') {
        result = await handleCustomerSubscriptionDeleted(event)
      } else if (event.type === 'invoice.payment_failed') {
        result = await handleInvoicePaymentFailed(event)
      } else if (event.type === 'charge.dispute.created') {
        result = await handleChargeDisputeCreated(event)
      } else {
        result = {
          ok: true,
          ignored: true,
          reason: 'unsupported_event',
        }
      }

      res.status(200).json({
        received: true,
        ...result,
      })
    } catch (err) {
      logger.error('Stripe webhook processing failed', {
        eventId: event.id,
        eventType: event.type,
        message: err?.message || String(err),
      })

      await markEvent(event.id, {
        status: 'failed',
        error: String(err?.message || err),
      }).catch(() => {
        // If this secondary write fails we still return 500 for Stripe retry.
      })

      res.status(500).json({
        received: true,
        error: err?.message || 'Webhook processing failed',
      })
    }
  }
)
