export const FOUNDER_OFFER = Object.freeze({
  endsAt: '2026-09-30T20:59:59.999Z',
  endsAtLabel: '30 septembrie 2026',
})

const PUBLIC_ENV = import.meta.env || {}

export const FOUNDER_STRIPE_PRICES = Object.freeze({
  esential_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_ESENTIAL_MONTHLY || '').trim(),
  esential_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_ESENTIAL_YEARLY || '').trim(),
  plus_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PLUS_MONTHLY || '').trim(),
  plus_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PLUS_YEARLY || '').trim(),
  pro_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PRO_MONTHLY || '').trim(),
  pro_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PRO_YEARLY || '').trim(),
  studio_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_STUDIO_MONTHLY || '').trim(),
  studio_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_STUDIO_YEARLY || '').trim(),
})

export const REGULAR_STRIPE_PRICES = Object.freeze({
  esential_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_ESENTIAL_REGULAR_MONTHLY || '').trim(),
  esential_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_ESENTIAL_REGULAR_YEARLY || '').trim(),
  plus_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PLUS_REGULAR_MONTHLY || '').trim(),
  plus_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PLUS_REGULAR_YEARLY || '').trim(),
  pro_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PRO_REGULAR_MONTHLY || '').trim(),
  pro_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_PRO_REGULAR_YEARLY || '').trim(),
  studio_monthly: (PUBLIC_ENV.VITE_STRIPE_PRICE_STUDIO_REGULAR_MONTHLY || '').trim(),
  studio_yearly: (PUBLIC_ENV.VITE_STRIPE_PRICE_STUDIO_REGULAR_YEARLY || '').trim(),
})

export const PRICING_PLANS = Object.freeze([
  {
    key: 'free',
    name: 'Free',
    storage: '15 GB',
    monthly: { founder: '0 lei', regular: '0 lei', founderEquiv: null, regularEquiv: null },
    yearly: { founder: '0 lei', regular: '0 lei', founderEquiv: null, regularEquiv: null },
    features: ['15 GB stocare', '3 galerii active', 'Galerii cu parolă', 'Selecții favorite'],
    lockedFeatures: ['Fără site de prezentare'],
    desc: 'Pentru început, fără card.',
    cta: 'Începe gratuit',
    featured: false,
  },
  {
    key: 'esential',
    name: 'Esențial',
    storage: '100 GB',
    monthly: { founder: '29 lei', regular: '39 lei', founderEquiv: null, regularEquiv: null },
    yearly: { founder: '289 lei', regular: '390 lei', founderEquiv: 'aprox. 24 lei/lună', regularEquiv: 'aprox. 33 lei/lună' },
    features: ['100 GB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Pentru fotograful care livrează constant.',
    cta: 'Alege Esențial',
    featured: false,
  },
  {
    key: 'plus',
    name: 'Plus',
    storage: '500 GB',
    monthly: { founder: '49 lei', regular: '69 lei', founderEquiv: null, regularEquiv: null },
    yearly: { founder: '489 lei', regular: '690 lei', founderEquiv: 'aprox. 41 lei/lună', regularEquiv: 'aprox. 58 lei/lună' },
    features: ['500 GB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Volumul de care ai nevoie în sezon.',
    cta: 'Alege Plus',
    featured: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    storage: '1 TB',
    monthly: { founder: '79 lei', regular: '99 lei', founderEquiv: null, regularEquiv: null },
    yearly: { founder: '789 lei', regular: '990 lei', founderEquiv: 'aprox. 66 lei/lună', regularEquiv: 'aprox. 83 lei/lună' },
    features: ['1 TB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Profesioniști cu volum mare.',
    cta: 'Alege Pro',
    featured: false,
  },
  {
    key: 'studio',
    name: 'Studio',
    storage: '2 TB',
    monthly: { founder: '129 lei', regular: '149 lei', founderEquiv: null, regularEquiv: null },
    yearly: { founder: '1.289 lei', regular: '1.490 lei', founderEquiv: 'aprox. 107 lei/lună', regularEquiv: 'aprox. 124 lei/lună' },
    features: ['2 TB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Fără compromisuri.',
    cta: 'Alege Studio',
    featured: false,
  },
])

export function isFounderOfferActive(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(timestamp) && timestamp <= Date.parse(FOUNDER_OFFER.endsAt)
}

export function getPlanPrice(plan, billingCycle = 'monthly', options = {}) {
  const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly'
  const pricing = plan?.[cycle] || {}
  const hasEligibilityOverride = typeof options?.founderEligible === 'boolean'
  const founderEligible = hasEligibilityOverride
    ? options.founderEligible
    : isFounderOfferActive(options?.now || new Date())
  const founderActive = plan?.key !== 'free' && founderEligible

  return {
    display: founderActive ? pricing.founder : pricing.regular,
    standardDisplay: founderActive ? pricing.regular : null,
    equiv: founderActive ? pricing.founderEquiv : pricing.regularEquiv,
    planId: plan?.key === 'free' ? null : `${plan.key}_${cycle}`,
    founderActive,
  }
}

const PLAN_NAME_BY_KEY = Object.freeze({
  esential: 'Esential',
  plus: 'Plus',
  pro: 'Pro',
  studio: 'Studio',
})

const PRICE_ID_TO_PLAN = new Map()
for (const [planKey, planName] of Object.entries(PLAN_NAME_BY_KEY)) {
  for (const cycle of ['monthly', 'yearly']) {
    const key = `${planKey}_${cycle}`
    const founderId = FOUNDER_STRIPE_PRICES[key]
    const regularId = REGULAR_STRIPE_PRICES[key]
    if (founderId) PRICE_ID_TO_PLAN.set(founderId, planName)
    if (regularId) PRICE_ID_TO_PLAN.set(regularId, planName)
  }
}

const FOUNDER_PRICE_ID_SET = new Set(Object.values(FOUNDER_STRIPE_PRICES).filter(Boolean))

export function resolvePlanFromConfiguredPriceId(priceId) {
  return PRICE_ID_TO_PLAN.get(String(priceId || '').trim()) || ''
}

export function isFounderPriceId(priceId) {
  return FOUNDER_PRICE_ID_SET.has(String(priceId || '').trim())
}
