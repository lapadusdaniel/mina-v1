import { logger } from '../../shared/logger'

const REQUIRED_PUBLIC_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_R2_WORKER_URL',
]

export function getPublicEnv() {
  return {
    firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    r2WorkerUrl: import.meta.env.VITE_R2_WORKER_URL || '',
    stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
    stripePriceEsentialMonthly: import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_MONTHLY || '',
    stripePriceEsentialYearly:  import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_YEARLY  || '',
    stripePricePlusMonthly:     import.meta.env.VITE_STRIPE_PRICE_PLUS_MONTHLY     || '',
    stripePricePlusYearly:      import.meta.env.VITE_STRIPE_PRICE_PLUS_YEARLY      || '',
    stripePriceProMonthly:      import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY      || '',
    stripePriceProYearly:       import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY       || '',
    stripePriceStudioMonthly:   import.meta.env.VITE_STRIPE_PRICE_STUDIO_MONTHLY   || '',
    stripePriceStudioYearly:    import.meta.env.VITE_STRIPE_PRICE_STUDIO_YEARLY    || '',
    stripePriceEsentialRegularMonthly: import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_REGULAR_MONTHLY || '',
    stripePriceEsentialRegularYearly:  import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_REGULAR_YEARLY || '',
    stripePricePlusRegularMonthly:     import.meta.env.VITE_STRIPE_PRICE_PLUS_REGULAR_MONTHLY || '',
    stripePricePlusRegularYearly:      import.meta.env.VITE_STRIPE_PRICE_PLUS_REGULAR_YEARLY || '',
    stripePriceProRegularMonthly:      import.meta.env.VITE_STRIPE_PRICE_PRO_REGULAR_MONTHLY || '',
    stripePriceProRegularYearly:       import.meta.env.VITE_STRIPE_PRICE_PRO_REGULAR_YEARLY || '',
    stripePriceStudioRegularMonthly:   import.meta.env.VITE_STRIPE_PRICE_STUDIO_REGULAR_MONTHLY || '',
    stripePriceStudioRegularYearly:    import.meta.env.VITE_STRIPE_PRICE_STUDIO_REGULAR_YEARLY || '',
    stripePortalConfigurationFounder: import.meta.env.VITE_STRIPE_PORTAL_CONFIGURATION_FOUNDER || '',
    stripePortalConfigurationStandard: import.meta.env.VITE_STRIPE_PORTAL_CONFIGURATION_STANDARD || '',
    // legacy kept for backward compat
    stripePriceStarter: import.meta.env.VITE_STRIPE_PRICE_STARTER || '',
    stripePricePro: import.meta.env.VITE_STRIPE_PRICE_PRO || '',
    stripePriceStudio: import.meta.env.VITE_STRIPE_PRICE_STUDIO || import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || '',
  }
}

export function validatePublicEnv({ strict = false } = {}) {
  const missing = REQUIRED_PUBLIC_KEYS.filter((key) => !import.meta.env[key])
  if (missing.length === 0) return { ok: true, missing: [] }

  const message = `Lipsesc variabile de mediu: ${missing.join(', ')}`
  if (strict) {
    throw new Error(message)
  }

  logger.warn(message)
  return { ok: false, missing }
}
