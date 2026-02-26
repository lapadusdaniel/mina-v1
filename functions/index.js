const admin = require('firebase-admin')
const Stripe = require('stripe')
const logger = require('firebase-functions/logger')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { SmartBillService } = require('./src/services/smartbill.service')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
const SMARTBILL_USERNAME = defineSecret('SMARTBILL_USERNAME')
const SMARTBILL_TOKEN = defineSecret('SMARTBILL_TOKEN')
const SMARTBILL_CIF = defineSecret('SMARTBILL_CIF')
const SMARTBILL_SERIES_NAME = defineSecret('SMARTBILL_SERIES_NAME')

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
    const customerFields = ['stripeId', 'customer_id', 'stripeCustomerId', 'stripe_customer_id']

    for (const field of customerFields) {
      const snap = await db
        .collection('customers')
        .where(field, '==', stripeCustomerId)
        .limit(1)
        .get()

      if (!snap.empty) {
        return {
          uid: snap.docs[0].id,
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

      return {
        name: String(item.description || 'Abonament Mina').slice(0, 180),
        quantity,
        unitPrice,
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
      },
    ]
  }

  return {
    amount,
    currency,
    lineItems,
    description: lineItems[0]?.name || 'Abonament Mina',
    stripeEventId: event.id,
    stripeSessionId: session.id || null,
    stripePaymentIntentId: session.payment_intent || null,
    stripeSubscriptionId: session.subscription || null,
    stripeCustomerId: session.customer || null,
    paidAt: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
  }
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

  await markEvent(event.id, {
    status: 'processed',
    uid,
    uidSource: resolved.source,
    invoiceId: invoiceDocId,
    invoiceSeries: invoice.series,
    invoiceNumber: invoice.number,
    invoiceUrl: invoice.url || null,
  })

  return {
    ok: true,
    skipped: false,
    uid,
    uidSource: resolved.source,
    sessionId: session.id,
    invoice: {
      id: invoiceDocId,
      series: invoice.series,
      number: invoice.number,
      url: invoice.url || null,
    },
  }
}

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

    if (event.type !== 'checkout.session.completed') {
      res.status(200).json({
        received: true,
        ignored: true,
        eventType: event.type,
      })
      return
    }

    try {
      const result = await handleCheckoutSessionCompleted(event)
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
