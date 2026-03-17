import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import SubscriptionSection from '../components/SubscriptionSection'
import BillingSettings from '../components/BillingSettings'
import BillingHistory from '../components/BillingHistory'
import './Settings.css'

const SETTINGS_TABS = [
  { id: 'account', label: 'Cont' },
  { id: 'billing', label: 'Facturare' },
  { id: 'security', label: 'Securitate' },
]

export default function Settings({ user, userPlan, storageLimit, checkAccess }) {
  const navigate = useNavigate()
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [activeTab, setActiveTab] = useState('account')

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Ești sigur? Toate galeriile și pozele tale vor fi șterse permanent. Această acțiune nu poate fi anulată.')
    if (!confirmed) return

    setDeletingAccount(true)
    try {
      if (!auth.currentUser) {
        navigate('/')
        return
      }
      await auth.currentUser.delete()
      navigate('/')
    } catch (error) {
      console.error(error)
      if (error?.code === 'auth/requires-recent-login') {
        alert('Pentru securitate, te rog să te deconectezi și să te reconectezi înainte de a șterge contul.')
      } else {
        alert('Nu am putut șterge contul. Încearcă din nou.')
      }
    } finally {
      setDeletingAccount(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Setări</h2>
        <p>Gestionează contul, facturarea și setările sensibile într-un singur loc.</p>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Tab-uri setări">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'account' && (
        <section className="settings-tab-panel" aria-label="Cont">
          <div className="settings-panel-head">
            <h3 className="settings-panel-title">Cont</h3>
            <p className="settings-subtitle">Planul activ, limitele și administrarea abonamentului tău.</p>
          </div>
          <div className="settings-account-subscription">
            <SubscriptionSection
              user={user}
              userPlan={userPlan}
              storageLimit={storageLimit}
              checkAccess={checkAccess}
              mode="billingOnly"
            />
          </div>
        </section>
      )}

      {activeTab === 'billing' && (
        <section className="settings-tab-panel" aria-label="Facturare">
          <div className="settings-panel-head">
            <h3 className="settings-panel-title">Facturare</h3>
            <p className="settings-subtitle">Completează datele fiscale și urmărește istoricul facturilor emise.</p>
          </div>
          <div className="settings-billing-stack">
            <BillingSettings user={user} />
            <BillingHistory user={user} />
          </div>
        </section>
      )}

      {activeTab === 'security' && (
        <section className="settings-danger-zone" aria-label="Securitate">
          <h3 className="settings-danger-title">Zonă periculoasă</h3>
          <p className="settings-danger-text">
            Ștergerea contului este permanentă și elimină accesul la platformă.
          </p>
          <button
            type="button"
            className="settings-delete-account-btn"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? 'Se șterge contul...' : 'Șterge contul'}
          </button>
        </section>
      )}
    </div>
  )
}
