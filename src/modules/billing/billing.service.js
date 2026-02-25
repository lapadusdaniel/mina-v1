import { addDoc, collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

export const STRIPE_PRICES = {
  pro: (import.meta.env.VITE_STRIPE_PRICE_PRO || '').trim(),
  unlimited: (import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || '').trim(),
}

export const PLAN_PRICES = {
  PRO: STRIPE_PRICES.pro,
  UNLIMITED: STRIPE_PRICES.unlimited,
}

export const STORAGE_LIMITS = {
  Free: 15,
  Pro: 500,
  Unlimited: 1000,
}

const VALID_STATUSES = ['active', 'trialing']
const CHECKOUT_CREATE_TIMEOUT_MS = 12000
const CHECKOUT_SESSION_TIMEOUT_MS = 15000

function priceIdToPlan(priceId) {
  if (!priceId) return 'Free'
  if (priceId === PLAN_PRICES.UNLIMITED) return 'Unlimited'
  if (priceId === PLAN_PRICES.PRO) return 'Pro'
  return 'Free'
}

function getPriceIdFromSubscription(docData) {
  if (!docData) return null
  const items = docData.items?.data ?? docData.items
  if (items && Array.isArray(items)) {
    const item = items.find((i) => i?.price?.id)
    return item?.price?.id ?? null
  }
  if (docData.price?.id) return docData.price.id
  return null
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'object' && value) {
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
  }
  return null
}

function toStripeStatus(raw) {
  if (!raw) return ''
  return String(raw).trim().toLowerCase()
}

function normalizeSubscription(docSnap) {
  const data = docSnap.data() || {}
  const priceId = getPriceIdFromSubscription(data)
  return {
    id: docSnap.id,
    status: toStripeStatus(data.status),
    plan: priceIdToPlan(priceId),
    priceId,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end ?? data.cancelAtPeriodEnd),
    createdAt: toDate(data.created ?? data.createdAt),
    currentPeriodEnd: toDate(data.current_period_end ?? data.currentPeriodEnd),
  }
}

function normalizeCheckoutSession(docSnap) {
  const data = docSnap.data() || {}
  const priceId = typeof data.price === 'string' ? data.price : null
  const amountRaw = data.amount_total ?? data.amountTotal ?? data.amount_subtotal ?? data.amountSubtotal
  const amountTotal = Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null
  const statusRaw = data.payment_status ?? data.paymentStatus ?? data.status

  return {
    id: docSnap.id,
    status: toStripeStatus(statusRaw || (data.error ? 'error' : 'created')),
    plan: priceIdToPlan(priceId),
    priceId,
    amountTotal,
    currency: String(data.currency || 'ron').toLowerCase(),
    createdAt: toDate(data.createdAt ?? data.created),
    hasError: Boolean(data.error),
    source: 'checkout_session',
  }
}

function sortByDateDesc(items, field) {
  return [...items].sort((a, b) => {
    const da = a?.[field] instanceof Date ? a[field].getTime() : 0
    const db = b?.[field] instanceof Date ? b[field].getTime() : 0
    return db - da
  })
}

function normalizeSubscriptionAsPayment(sub) {
  return {
    id: `subscription:${sub.id}`,
    status: sub.status || 'active',
    plan: sub.plan,
    priceId: sub.priceId || null,
    amountTotal: null,
    currency: 'ron',
    createdAt: sub.createdAt || sub.currentPeriodEnd || null,
    hasError: false,
    source: 'subscription',
  }
}

async function addCheckoutSessionWithTimeout({ db, uid, payload }) {
  const createPromise = addDoc(collection(db, 'customers', uid, 'checkout_sessions'), payload)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout Stripe checkout: scrierea sesiunii in Firestore a durat prea mult.'))
    }, CHECKOUT_CREATE_TIMEOUT_MS)
  })
  return Promise.race([createPromise, timeoutPromise])
}

export function createBillingModule({ db, functions }) {
  const createPortalLinkCallable =
    functions ? httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink') : null

  return {
    db,

    async startCheckout({
      uid,
      planId,
      successUrl,
      cancelUrl,
      allowPromotionCodes = true,
    }) {
      if (!uid) throw new Error('billing.startCheckout: uid este obligatoriu')
      if (!planId || planId === 'free') return null

      const price = STRIPE_PRICES[planId]
      if (!price) {
        throw new Error(
          `Config Stripe lipsa pentru planul "${planId}". ` +
          'Seteaza in .env: VITE_STRIPE_PRICE_PRO si VITE_STRIPE_PRICE_UNLIMITED, apoi rebuild + deploy.'
        )
      }

      const sessionRef = await addCheckoutSessionWithTimeout({
        db,
        uid,
        payload: {
        mode: 'subscription',
        price,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: allowPromotionCodes,
        createdAt: new Date(),
        },
      })

      return new Promise((resolve, reject) => {
        let settled = false
        let unsubscribe = () => {}

        const failTimeout = setTimeout(() => {
          if (settled) return
          settled = true
          unsubscribe()
          reject(
            new Error(
              'Timeout Stripe checkout: nu am primit URL de sesiune. Verifica Firebase Stripe extension (checkout_sessions -> url/error).'
            )
          )
        }, CHECKOUT_SESSION_TIMEOUT_MS)

        unsubscribe = onSnapshot(
          sessionRef,
          (snap) => {
            const data = snap.data()
            if (!data) return
            if (data.error) {
              if (settled) return
              settled = true
              clearTimeout(failTimeout)
              unsubscribe()
              reject(new Error(data.error.message || 'Eroare Stripe'))
              return
            }
            if (data.url) {
              if (settled) return
              settled = true
              clearTimeout(failTimeout)
              unsubscribe()
              resolve(data.url)
            }
          },
          (err) => {
            if (settled) return
            settled = true
            clearTimeout(failTimeout)
            unsubscribe()
            reject(err)
          }
        )
      })
    },

    watchUserPlan(uid, onChange) {
      if (!uid) {
        onChange({ plan: 'Free', storageLimit: STORAGE_LIMITS.Free })
        return () => {}
      }

      let unsubStripe = null

      const unsubOverride = onSnapshot(doc(db, 'adminOverrides', uid), (overrideSnap) => {
        if (overrideSnap.exists() && overrideSnap.data().plan) {
          const overridePlan = overrideSnap.data().plan
          onChange({
            plan: overridePlan,
            storageLimit: STORAGE_LIMITS[overridePlan] || STORAGE_LIMITS.Free,
          })

          if (unsubStripe) {
            unsubStripe()
            unsubStripe = null
          }
          return
        }

        if (!unsubStripe) {
          const subsRef = collection(db, 'customers', uid, 'subscriptions')
          unsubStripe = onSnapshot(subsRef, (snapshot) => {
            let plan = 'Free'
            snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data()
              const status = (data?.status || '').toLowerCase()
              if (!VALID_STATUSES.includes(status)) return

              const priceId = getPriceIdFromSubscription(data)
              const derived = priceIdToPlan(priceId)
              if (derived === 'Unlimited') plan = 'Unlimited'
              else if (derived === 'Pro' && plan !== 'Unlimited') plan = 'Pro'
            })

            onChange({
              plan,
              storageLimit: STORAGE_LIMITS[plan] ?? STORAGE_LIMITS.Free,
            })
          })
        }
      })

      return () => {
        if (unsubOverride) unsubOverride()
        if (unsubStripe) unsubStripe()
      }
    },

    async getBillingOverview(uid) {
      if (!uid) throw new Error('billing.getBillingOverview: uid este obligatoriu')

      const [overrideSnap, subsSnap, sessionsSnap] = await Promise.all([
        getDoc(doc(db, 'adminOverrides', uid)),
        getDocs(collection(db, 'customers', uid, 'subscriptions')),
        getDocs(collection(db, 'customers', uid, 'checkout_sessions')),
      ])

      const subscriptions = sortByDateDesc(
        subsSnap.docs.map(normalizeSubscription),
        'createdAt'
      )

      const checkoutSessions = sortByDateDesc(
        sessionsSnap.docs.map(normalizeCheckoutSession),
        'createdAt'
      )

      const paidStatuses = new Set([
        'paid',
        'complete',
        'succeeded',
        'no_payment_required',
      ])
      const paymentsFromSessions = checkoutSessions.filter((session) =>
        paidStatuses.has(session.status) ||
        (session.amountTotal !== null && session.amountTotal >= 0 && !session.hasError && session.status !== 'created')
      )

      const activeSubscription =
        subscriptions.find((sub) => VALID_STATUSES.includes(sub.status)) || null

      const subscriptionFallback = subscriptions
        .filter((sub) => VALID_STATUSES.includes(sub.status) || sub.status === 'canceled')
        .map(normalizeSubscriptionAsPayment)

      const payments =
        paymentsFromSessions.length > 0
          ? paymentsFromSessions
          : subscriptionFallback

      return {
        overridePlan: overrideSnap.exists() ? (overrideSnap.data()?.plan || null) : null,
        activeSubscription,
        subscriptions: subscriptions.slice(0, 12),
        payments: payments.slice(0, 20),
        checkoutSessions: checkoutSessions.slice(0, 20),
      }
    },

    async createPortalLink({ returnUrl }) {
      if (!createPortalLinkCallable) {
        throw new Error('Billing portal indisponibil: Firebase Functions nu este configurat.')
      }
      const result = await createPortalLinkCallable({
        returnUrl: returnUrl || '',
      })
      const payload = result?.data
      if (typeof payload === 'string' && payload.startsWith('http')) return payload
      const url = payload?.url || payload?.portalLink || payload?.link || ''
      if (!url) {
        throw new Error('Nu am primit URL-ul de Stripe Customer Portal.')
      }
      return url
    },

    async getCurrentPlan() {
      throw new Error('billing.getCurrentPlan nu este implementat inca')
    },
  }
}
