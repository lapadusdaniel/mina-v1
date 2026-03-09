const functionsV1 = require('firebase-functions/v1')
const admin = require('firebase-admin')
const Stripe = require('stripe')
const logger = require('firebase-functions/logger')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { SmartBillService } = require('./src/services/smartbill.service')
const { createEmailService } = require('./src/services/email.service')

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

const MINA_EMAIL_FROM = 'Mina <hello@cloudbymina.com>'
const MINA_DASHBOARD_URL = 'https://cloudbymina.com/dashboard'
const DEFAULT_R2_WORKER_URL = 'https://mina-v1-r2-worker.lapadusdaniel.workers.dev'

const FALLBACK_STRIPE_PRICE_IDS = Object.freeze({
  starter: 'price_1T6a3S1ax2jGrLZHmevohZWA',
  pro: 'price_1T6a4F1ax2jGrLZH92vUsGzE',
  studio: 'price_1T6a501ax2jGrLZHgLBbkzT4',
  addon: 'price_1T6a5e1ax2jGrLZHbnDNHkwM',
})

const SUPPORTED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'charge.dispute.created',
])

const PLAN_BY_PRICE_ID = Object.freeze({
  [FALLBACK_STRIPE_PRICE_IDS.starter]: 'Starter',
  [FALLBACK_STRIPE_PRICE_IDS.pro]: 'Pro',
  [FALLBACK_STRIPE_PRICE_IDS.studio]: 'Studio',
  [FALLBACK_STRIPE_PRICE_IDS.addon]: 'Studio',
})

function sanitizePriceId(value) {
  return String(value || '').trim()
}

function getAllowedCheckoutPriceIds() {
  const starter = sanitizePriceId(process.env.STRIPE_PRICE_STARTER) || FALLBACK_STRIPE_PRICE_IDS.starter
  const pro = sanitizePriceId(process.env.STRIPE_PRICE_PRO) || FALLBACK_STRIPE_PRICE_IDS.pro
  const studio = sanitizePriceId(process.env.STRIPE_PRICE_STUDIO) || FALLBACK_STRIPE_PRICE_IDS.studio
  return new Set([starter, pro, studio].filter(Boolean))
}

function getStudioPriceId() {
  return sanitizePriceId(process.env.STRIPE_PRICE_STUDIO) || FALLBACK_STRIPE_PRICE_IDS.studio
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

  const studioPriceId = getStudioPriceId()
  for (const subDoc of subsSnap.docs) {
    const sub = subDoc.data() || {}
    const status = String(sub.status || '').trim().toLowerCase()
    if (!['active', 'trialing'].includes(status)) continue

    const priceId = extractPrimarySubscriptionPriceId(sub)
    if (priceId && priceId === studioPriceId) return true

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

function getR2WorkerBaseUrl() {
  const raw = String(process.env.R2_WORKER_URL || process.env.VITE_R2_WORKER_URL || DEFAULT_R2_WORKER_URL).trim()
  if (!raw) {
    throw new HttpsError('internal', 'R2 worker URL nu este configurat.')
  }
  return raw.endsWith('/') ? raw : `${raw}/`
}

async function verifyRequestAuth(req) {
  const authHeader = readBearerAuthHeader(req)
  const token = authHeader.slice('Bearer '.length).trim()
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

function normalizePlanName(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('studio') || normalized.includes('unlimited')) return 'Studio'
  if (normalized.includes('pro')) return 'Pro'
  if (normalized.includes('starter')) return 'Starter'
  if (normalized.includes('free')) return 'Free'
  return ''
}

function resolvePlanFromPriceId(priceId) {
  const id = sanitizePriceId(priceId)
  if (!id) return ''

  const envMap = {
    [sanitizePriceId(process.env.STRIPE_PRICE_STARTER) || FALLBACK_STRIPE_PRICE_IDS.starter]: 'Starter',
    [sanitizePriceId(process.env.STRIPE_PRICE_PRO) || FALLBACK_STRIPE_PRICE_IDS.pro]: 'Pro',
    [sanitizePriceId(process.env.STRIPE_PRICE_STUDIO) || FALLBACK_STRIPE_PRICE_IDS.studio]: 'Studio',
    [sanitizePriceId(process.env.STRIPE_PRICE_ADDON) || FALLBACK_STRIPE_PRICE_IDS.addon]: 'Studio',
  }

  return envMap[id] || PLAN_BY_PRICE_ID[id] || ''
}

function resolvePlanFromAmount(amountMinorUnits) {
  const amount = Number(amountMinorUnits)
  if (!Number.isFinite(amount)) return ''
  if (amount === 3900) return 'Starter'
  if (amount === 7900) return 'Pro'
  if (amount === 12900) return 'Studio'
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

  return 'Starter'
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
    priceIds: {
      starter: String(process.env.STRIPE_PRICE_STARTER || '').trim() || FALLBACK_STRIPE_PRICE_IDS.starter,
      pro: String(process.env.STRIPE_PRICE_PRO || '').trim() || FALLBACK_STRIPE_PRICE_IDS.pro,
      studio: String(process.env.STRIPE_PRICE_STUDIO || '').trim() || FALLBACK_STRIPE_PRICE_IDS.studio,
    },
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
  const planName =
    normalizePlanName(userData.plan || userData.subscriptionPlan || userData.currentPlan) ||
    normalizePlanName(subscription.items?.data?.[0]?.price?.nickname) || 'Plan activ'

  const deletedPriceId = extractPrimarySubscriptionPriceId(subscription)
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


exports.sendContactNotification = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    const nume = sanitizeContactField(request.data?.nume, 120)
    const email = normalizeEmail(request.data?.email)
    const mesaj = sanitizeContactField(request.data?.mesaj, 5000)

    if (!nume || !email || !mesaj) {
      throw new HttpsError('invalid-argument', 'Nume, email și mesaj sunt obligatorii.')
    }

    if (!isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'Adresa de email este invalidă.')
    }

    const result = await getEmailService().sendContactNotificationEmail({
      toEmail: 'hello@cloudbymina.com',
      nume,
      email,
      mesaj,
    })

    logger.info('Contact notification sent', {
      ...result,
      fromEmail: email,
    })

    return {
      ok: true,
      sent: !result?.skipped,
    }
  }
)

exports.sendWelcomeEmail = functionsV1
  .region('europe-west1')
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .auth.user()
  .onCreate(async (user) => {
    try {
      const result = await getEmailService().sendWelcomeEmail(user)
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

exports.createCheckoutSession = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    secrets: [STRIPE_EXTENSION_API_KEY, STRIPE_SECRET_KEY],
  },
  async (request) => {
    const uid = String(request.auth?.uid || '').trim()
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat pentru checkout.')
    }

    const priceId = sanitizePriceId(request.data?.priceId)
    const successUrl = sanitizeRedirectUrl(request.data?.successUrl, 'successUrl')
    const cancelUrl = sanitizeRedirectUrl(request.data?.cancelUrl, 'cancelUrl')
    const allowPromotionCodes =
      request.data?.allowPromotionCodes === undefined
        ? true
        : Boolean(request.data.allowPromotionCodes)

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: allowPromotionCodes,
      client_reference_id: uid,
      metadata: {
        uid,
        firebase_uid: uid,
        priceId,
        type: 'plan',
      },
    })

    if (!session?.url) {
      throw new HttpsError('internal', 'Stripe nu a returnat URL-ul de checkout.')
    }

    logger.info('createCheckoutSession success', {
      uid,
      priceId,
      sessionId: session.id,
    })

    return {
      url: session.url,
      sessionId: session.id,
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: addonPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      client_reference_id: uid,
      metadata: {
        uid,
        firebase_uid: uid,
        priceId: addonPriceId,
        type: 'addon',
      },
    })

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
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    let uid = ''
    let authHeader = ''
    let galleryId = ''

    try {
      authHeader = readBearerAuthHeader(req)
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
      const workerResponse = await fetch(
        `${getR2WorkerBaseUrl()}?prefix=${encodeURIComponent(prefix)}`,
        {
          method: 'DELETE',
          headers: { Authorization: authHeader },
        }
      )

      if (!workerResponse.ok) {
        const workerMessage = String(await workerResponse.text().catch(() => '') || '').trim()
        res.status(workerResponse.status).json({
          error: workerMessage || `Ștergerea asset-urilor a eșuat (${workerResponse.status}).`,
        })
        return
      }

      const gallerySlug = String(galleryData.slug || '').trim().toLowerCase()
      const removedBytes = Math.max(0, Number(galleryData.storageBytes || 0))
      const batch = db.batch()

      if (gallerySlug) {
        batch.delete(db.collection('slugs').doc(gallerySlug))
      }
      batch.delete(galleryRef)

      if (removedBytes > 0) {
        batch.set(
          db.collection('users').doc(ownerUid),
          {
            storageUsedBytes: admin.firestore.FieldValue.increment(-removedBytes),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      }

      await batch.commit()

      const workerPayload = await workerResponse.json().catch(() => ({}))
      res.status(200).json({
        ok: true,
        galleryId,
        deleted: Number(workerPayload?.deleted || 0),
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
