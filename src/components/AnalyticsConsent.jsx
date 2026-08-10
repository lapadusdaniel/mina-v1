import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ANALYTICS_CONSENT_EVENT,
  OPEN_COOKIE_SETTINGS_EVENT,
  getAnalyticsConsent,
  initializeAnalytics,
  setAnalyticsConsent,
} from '../services/analytics'
import './AnalyticsConsent.css'

export default function AnalyticsConsent() {
  const [consent, setConsent] = useState(() => getAnalyticsConsent())
  const [preferencesOpen, setPreferencesOpen] = useState(() => getAnalyticsConsent() === null)

  useEffect(() => {
    if (consent === true) initializeAnalytics()
  }, [consent])

  useEffect(() => {
    const openPreferences = () => setPreferencesOpen(true)
    const syncConsent = (event) => setConsent(event.detail?.granted === true)
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openPreferences)
    window.addEventListener(ANALYTICS_CONSENT_EVENT, syncConsent)
    return () => {
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openPreferences)
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, syncConsent)
    }
  }, [])

  if (!preferencesOpen) return null

  const choose = async (granted) => {
    await setAnalyticsConsent(granted)
    setConsent(granted)
    setPreferencesOpen(false)
  }

  return (
    <div className="analytics-consent" role="dialog" aria-modal="true" aria-labelledby="analytics-consent-title">
      <div className="analytics-consent__copy">
        <p className="analytics-consent__eyebrow">Preferințe de confidențialitate</p>
        <h2 id="analytics-consent-title">Ne ajuți să îmbunătățim Mina?</h2>
        <p>
          Folosim Google Analytics numai cu acordul tău, pentru statistici despre utilizarea platformei.
          Nu trimitem nume, emailuri, fotografii sau denumiri de galerii. Cookie-urile esențiale funcționează mereu.
          {' '}<Link to="/confidentialitate">Detalii</Link>
        </p>
      </div>
      <div className="analytics-consent__actions">
        <button type="button" className="analytics-consent__secondary" onClick={() => choose(false)}>
          Refuz
        </button>
        <button type="button" className="analytics-consent__primary" onClick={() => choose(true)}>
          Accept Analytics
        </button>
      </div>
    </div>
  )
}
