import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, limit as limitTo } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

export const STRIPE_PRICES = {
  starter: (import.meta.env.VITE_STRIPE_PRICE_STARTER || '').trim(),
  pro: (import.meta.env.VITE_STRIPE_PRICE_PRO || '').trim(),
  studio: (import.meta.env.VITE_STRIPE_PRICE_STUDIO || import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || '').trim(),
  unlimited: (import.meta.env.VITE_STRIPE_PRICE_STUDIO || import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || '').trim(),
}

export const PLAN_PRICES = {
  STARTER: STRIPE_PRICES.starter,
  PRO: STRIPE_PRICES.pro,
  STUDIO: STRIPE_PRICES.studio,
  UNLIMITED: STRIPE_PRICES.studio,
}

export const STORAGE_LIMITS = {
  Free: 15,
  Starter: 200,
  Pro: 500,
  Studio: 1000,
}

export const BILLING_TYPES = {
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
}

export const DEFAULT_BILLING_DETAILS = {
  type: BILLING_TYPES.INDIVIDUAL,
  name: '',
  address: '',
  city: '',
  county: '',
  country: 'România',
  cui: '',
  regCom: '',
}

const VALID_STATUSES = ['active', 'trialing']

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeBillingType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === BILLING_TYPES.BUSINESS) return BILLING_TYPES.BUSINESS
  return BILLING_TYPES.INDIVIDUAL
}

function normalizeBillingDetails(raw = {}) {
  const type = normalizeBillingType(raw.type)
  const normalized = {
    type,
    name: sanitizeText(raw.name, 160),
    address: sanitizeText(raw.address, 220),
    city: sanitizeText(raw.city, 100),
    county: sanitizeText(raw.county, 100),
    country: sanitizeText(raw.country || DEFAULT_BILLING_DETAILS.country, 100),
    cui: '',
    regCom: '',
  }

  if (type === BILLING_TYPES.BUSINESS) {
    normalized.cui = sanitizeText(raw.cui, 32).toUpperCase()
    normalized.regCom = sanitizeText(raw.regCom, 64).toUpperCase()
  }

  return normalized
}

function validateBillingDetails(details) {
  if (!details.name) throw new Error('Numele pentru facturare este obligatoriu.')
  if (!details.address) throw new Error('Adresa de facturare este obligatorie.')
  if (!details.city) throw new Error('Orașul este obligatoriu.')
  if (!details.county) throw new Error('Județul este obligatoriu.')
  if (!details.country) throw new Error('Țara este obligatorie.')
  if (details.type === BILLING_TYPES.BUSINESS) {
    if (!details.cui) throw new Error('CUI este obligatoriu pentru persoane juridice.')
    if (!details.regCom) throw new Error('Reg. Com este obligatoriu pentru persoane juridice.')
  }
}

function priceIdToPlan(priceId) {
  if (!priceId) return 'Free'
  if (priceId === PLAN_PRICES.STUDIO || priceId === PLAN_PRICES.UNLIMITED) return 'Studio'
  if (priceId === PLAN_PRICES.PRO) return 'Pro'
  if (priceId === PLAN_PRICES.STARTER) return 'Starter'
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

function normalizeInvoice(docSnap) {
  const data = docSnap.data() || {}
  const amountRaw = data.amount
  const amount = Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null
  const currency = sanitizeText(data.currency || 'RON', 8).toUpperCase()

  return {
    id: docSnap.id,
    series: sanitizeText(data.series, 32),
    number: sanitizeText(data.number, 32) || docSnap.id,
    amount,
    currency: currency || 'RON',
    url: sanitizeText(data.url, 1000),
    status: toStripeStatus(data.status || ''),
    createdAt: toDate(data.createdAt ?? data.updatedAt),
  }
}

function normalizePlanName(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'studio' || raw === 'unlimited') return 'Studio'
  if (raw === 'pro') return 'Pro'
  if (raw === 'starter') return 'Starter'
  return 'Free'
}

export function createBillingModule({ db, functions }) {
  const createCheckoutSessionCallable =
    functions ? httpsCallable(functions, 'createCheckoutSession') : null
  const createPortalLinkCallable =
    functions ? httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink') : null
  const downloadInvoicePdfCallable =
    functions ? httpsCallable(functions, 'downloadInvoicePdf') : null

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
          'Seteaza in .env: VITE_STRIPE_PRICE_STARTER, VITE_STRIPE_PRICE_PRO, VITE_STRIPE_PRICE_STUDIO, apoi rebuild + deploy.'
        )
      }
      if (!createCheckoutSessionCallable) {
        throw new Error('Checkout indisponibil: Firebase Functions nu este configurat.')
      }

      const result = await createCheckoutSessionCallable({
        priceId: price,
        successUrl,
        cancelUrl,
        allowPromotionCodes,
      })

      const url = String(result?.data?.url || '').trim()
      if (!url) {
        throw new Error('Checkout indisponibil: serverul nu a returnat URL-ul Stripe.')
      }

      return url
    },

    watchUserPlan(uid, onChange) {
      if (!uid) {
        onChange({ plan: 'Free', storageLimit: STORAGE_LIMITS.Free })
        return () => {}
      }

      let unsubStripe = null

      const unsubOverride = onSnapshot(doc(db, 'adminOverrides', uid), (overrideSnap) => {
        if (overrideSnap.exists() && overrideSnap.data().plan) {
          const overridePlan = normalizePlanName(overrideSnap.data().plan)
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
              if (derived === 'Studio') plan = 'Studio'
              else if (derived === 'Pro' && plan !== 'Studio') plan = 'Pro'
              else if (derived === 'Starter' && plan !== 'Studio' && plan !== 'Pro') plan = 'Starter'
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
        overridePlan: overrideSnap.exists() ? normalizePlanName(overrideSnap.data()?.plan) : null,
        activeSubscription,
        subscriptions: subscriptions.slice(0, 12),
        payments: payments.slice(0, 20),
        checkoutSessions: checkoutSessions.slice(0, 20),
      }
    },

    async getInvoices(uid, { limit = 50 } = {}) {
      if (!uid) throw new Error('billing.getInvoices: uid este obligatoriu')
      const safeLimit = Number.isFinite(Number(limit))
        ? Math.min(100, Math.max(1, Number(limit)))
        : 50

      const invoicesQuery = query(
        collection(db, 'users', uid, 'invoices'),
        limitTo(safeLimit)
      )

      const snap = await getDocs(invoicesQuery)
      return sortByDateDesc(
        snap.docs.map(normalizeInvoice),
        'createdAt'
      )
    },

    async downloadInvoicePdf({ invoiceId }) {
      if (!invoiceId) {
        throw new Error('billing.downloadInvoicePdf: invoiceId este obligatoriu')
      }
      if (!downloadInvoicePdfCallable) {
        throw new Error('Descărcarea PDF nu este disponibilă: Firebase Functions nu este configurat.')
      }

      const response = await downloadInvoicePdfCallable({ invoiceId })
      const payload = response?.data || {}
      const pdfBase64 = String(payload.pdfBase64 || '').trim()
      const filename = sanitizeText(payload.filename || `factura-${invoiceId}.pdf`, 220)
      const contentType = sanitizeText(payload.contentType || 'application/pdf', 120) || 'application/pdf'

      if (!pdfBase64) {
        throw new Error('Nu am primit conținutul PDF de la server.')
      }

      return {
        pdfBase64,
        filename: filename || `factura-${invoiceId}.pdf`,
        contentType,
      }
    },

    async createPortalLink({ returnUrl, flowData, locale = 'auto', configuration } = {}) {
      if (!createPortalLinkCallable) {
        throw new Error('Billing portal indisponibil: Firebase Functions nu este configurat.')
      }
      const requestPayload = {
        returnUrl: returnUrl || '',
      }
      if (locale) requestPayload.locale = locale
      if (configuration) requestPayload.configuration = configuration
      if (flowData) requestPayload.flow_data = flowData

      const result = await createPortalLinkCallable(requestPayload)
      const responsePayload = result?.data
      if (typeof responsePayload === 'string' && responsePayload.startsWith('http')) return responsePayload
      const url = responsePayload?.url || responsePayload?.portalLink || responsePayload?.link || ''
      if (!url) {
        throw new Error('Nu am primit URL-ul de Stripe Customer Portal.')
      }
      return url
    },

    async getCurrentPlan() {
      throw new Error('billing.getCurrentPlan nu este implementat inca')
    },

    async getBillingDetails(uid) {
      if (!uid) throw new Error('billing.getBillingDetails: uid este obligatoriu')
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (!userSnap.exists()) return { ...DEFAULT_BILLING_DETAILS }
      const raw = userSnap.data()?.billingDetails || {}
      return {
        ...DEFAULT_BILLING_DETAILS,
        ...normalizeBillingDetails(raw),
      }
    },

    async saveBillingDetails(uid, details) {
      if (!uid) throw new Error('billing.saveBillingDetails: uid este obligatoriu')
      const normalized = normalizeBillingDetails(details)
      validateBillingDetails(normalized)

      await setDoc(
        doc(db, 'users', uid),
        {
          billingDetails: normalized,
          updatedAt: new Date(),
        },
        { merge: true }
      )

      return normalized
    },
  }
}
