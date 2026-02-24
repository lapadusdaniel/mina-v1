import { addDoc, collection, onSnapshot } from 'firebase/firestore'
import { doc } from 'firebase/firestore'

export const STRIPE_PRICES = {
  pro: import.meta.env.VITE_STRIPE_PRICE_PRO || 'price_1T2HFN1pBe1FB1ICkWaITkCD',
  unlimited: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || 'price_1T2ao81pBe1FB1ICFjI0SVUb',
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

export function createBillingModule({ db }) {
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
      if (!price) throw new Error(`Plan invalid: ${planId}`)

      const sessionRef = await addDoc(collection(db, 'customers', uid, 'checkout_sessions'), {
        mode: 'subscription',
        price,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: allowPromotionCodes,
        createdAt: new Date(),
      })

      return new Promise((resolve, reject) => {
        const unsubscribe = onSnapshot(
          sessionRef,
          (snap) => {
            const data = snap.data()
            if (!data) return
            if (data.error) {
              unsubscribe()
              reject(new Error(data.error.message || 'Eroare Stripe'))
              return
            }
            if (data.url) {
              unsubscribe()
              resolve(data.url)
            }
          },
          (err) => {
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

    async getCurrentPlan() {
      throw new Error('billing.getCurrentPlan nu este implementat inca')
    },
  }
}
