import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import SubscriptionSection from '../components/SubscriptionSection'
import './Settings.css'

export default function Settings({ user, theme, setTheme, userPlan, storageLimit, checkAccess }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('theme')
  const [deletingAccount, setDeletingAccount] = useState(false)

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
        <p>Tema și zona de abonament/facturare sunt gestionate aici. Branding-ul este unificat în tab-ul Card.</p>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Setări">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'theme'}
          className={`settings-tab-btn ${activeTab === 'theme' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('theme')}
        >
          Temă
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'billing'}
          className={`settings-tab-btn ${activeTab === 'billing' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          Abonament & Facturare
        </button>
      </div>

      {activeTab === 'theme' && (
        <section className="settings-panel" role="tabpanel" aria-label="Temă">
          <h3 className="settings-panel-title">Tema interfeței</h3>
          <p className="settings-subtitle">Se aplică pe dashboard, galerii și site-ul tău public.</p>

          <div className="settings-theme-grid">
            {[
              { id: 'minimal', label: 'Minimal', bg: '#ffffff', accent: '#111111', text: '#1d1d1f', desc: 'Alb pur, fără distrageri' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                style={{
                  background: t.bg,
                  border: `2px solid ${theme === t.id ? t.accent : 'transparent'}`,
                  borderRadius: 14,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'border-color 0.2s, transform 0.15s',
                  transform: theme === t.id ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: theme === t.id ? `0 0 0 4px ${t.accent}22` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{t.label}</span>
                  {theme === t.id && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Activ
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: t.text, opacity: 0.55, fontWeight: 300 }}>{t.desc}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'billing' && (
        <section className="settings-panel" role="tabpanel" aria-label="Abonament și facturare">
          <h3 className="settings-panel-title">Abonament & Facturare</h3>
          <SubscriptionSection
            user={user}
            userPlan={userPlan}
            storageLimit={storageLimit}
            checkAccess={checkAccess}
            mode="billingOnly"
          />
        </section>
      )}

      <section className="settings-danger-zone" aria-label="Zonă periculoasă">
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
    </div>
  )
}
