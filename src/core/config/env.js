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
