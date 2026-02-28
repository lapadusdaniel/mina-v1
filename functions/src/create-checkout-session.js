const Stripe = require('stripe')
const logger = require('firebase-functions/logger')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const FALLBACK_STRIPE_PRICE_IDS = Object.freeze({
  starter: 'price_1T5srU1ax2jGrLZHgpdKCPnm',
  pro: 'price_1T5ssF1ax2jGrLZHNR9EjINy',
  studio: 'price_1T5ssk1ax2jGrLZHZ0Lxitgp',
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

function createCheckoutSession({ stripeExtensionApiKeySecret, stripeSecretKeySecret }) {
  return onCall(
    {
      region: 'us-central1',
      maxInstances: 20,
      secrets: [stripeExtensionApiKeySecret, stripeSecretKeySecret],
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

      const stripeKey =
        sanitizePriceId(stripeExtensionApiKeySecret.value()) ||
        sanitizePriceId(stripeSecretKeySecret.value())

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
}

module.exports = { createCheckoutSession }
