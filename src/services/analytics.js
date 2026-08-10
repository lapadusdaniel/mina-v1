import { app } from '../firebase'

export const ANALYTICS_CONSENT_KEY = 'mina_analytics_consent_v1'
export const ANALYTICS_CONSENT_EVENT = 'mina:analytics-consent-changed'
export const OPEN_COOKIE_SETTINGS_EVENT = 'mina:open-cookie-settings'

let analyticsPromise = null
let analyticsInstance = null

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getAnalyticsConsent() {
  if (!canUseBrowserStorage()) return null
  const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
  if (value === 'granted') return true
  if (value === 'denied') return false
  return null
}

export async function initializeAnalytics() {
  if (!canUseBrowserStorage() || getAnalyticsConsent() !== true) return null
  if (!String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim()) return null
  if (analyticsInstance) return analyticsInstance
  if (analyticsPromise) return analyticsPromise

  analyticsPromise = import('firebase/analytics')
    .then(async ({ initializeAnalytics: initializeFirebaseAnalytics, isSupported, setAnalyticsCollectionEnabled }) => {
      if (!(await isSupported())) return null
      const analytics = initializeFirebaseAnalytics(app, {
        config: { send_page_view: false },
      })
      setAnalyticsCollectionEnabled(analytics, true)
      analyticsInstance = analytics
      return analytics
    })
    .catch((error) => {
      console.warn('Analytics initialization skipped:', error?.message || error)
      return null
    })

  return analyticsPromise
}

export async function setAnalyticsConsent(granted) {
  if (!canUseBrowserStorage()) return
  const allowed = granted === true
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, allowed ? 'granted' : 'denied')

  if (allowed) {
    await initializeAnalytics()
  } else if (analyticsInstance) {
    const { setAnalyticsCollectionEnabled } = await import('firebase/analytics')
    setAnalyticsCollectionEnabled(analyticsInstance, false)
  }

  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, {
    detail: { granted: allowed },
  }))
}

function sanitizeEventParams(params = {}) {
  const sanitized = {}
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'string') sanitized[key] = value.slice(0, 100)
    else if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value
    else if (typeof value === 'boolean') sanitized[key] = value
  })
  return sanitized
}

export async function trackEvent(eventName, params = {}) {
  if (getAnalyticsConsent() !== true) return false
  const analytics = await initializeAnalytics()
  if (!analytics) return false
  const { logEvent } = await import('firebase/analytics')
  logEvent(analytics, String(eventName || '').trim().slice(0, 40), sanitizeEventParams(params))
  return true
}

export function sanitizeAnalyticsPath(pathname = '/') {
  const path = String(pathname || '/').split('?')[0].split('#')[0] || '/'
  if (/^\/g\/[^/]+/.test(path)) return '/g/:slug'
  if (/^\/gallery\/[^/]+/.test(path)) return '/gallery/:id'
  if (/^\/card\/[^/]+/.test(path)) return '/card/:uid'

  const knownRoutes = new Set([
    '/', '/login', '/register', '/dashboard', '/settings', '/admin',
    '/termeni', '/confidentialitate', '/refund', '/verify-email',
  ])
  return knownRoutes.has(path) ? path : '/:public-slug'
}

export async function trackPageView({ pathname = '/', search = '' } = {}) {
  const pagePath = sanitizeAnalyticsPath(pathname)
  const params = { page_path: pagePath }

  if (pagePath === '/dashboard') {
    const allowedTabs = new Set(['galerii', 'site', 'card', 'abonament', 'setari', 'cos'])
    const tab = new URLSearchParams(String(search || '')).get('tab')
    if (allowedTabs.has(tab)) params.page_section = tab
  }

  return trackEvent('page_view', params)
}

export function openCookieSettings() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))
}
