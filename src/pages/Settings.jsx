import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import SubscriptionSection from '../components/SubscriptionSection'
import './Settings.css'

export default function Settings({ user, userPlan, storageLimit, checkAccess }) {
  const navigate = useNavigate()
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
        <p>Abonamentul și facturarea sunt gestionate aici. Branding-ul este unificat în tab-ul Card.</p>
      </div>

      <section className="settings-panel" aria-label="Abonament și facturare">
        <h3 className="settings-panel-title">Abonament & Facturare</h3>
        <SubscriptionSection
          user={user}
          userPlan={userPlan}
          storageLimit={storageLimit}
          checkAccess={checkAccess}
          mode="billingOnly"
        />
      </section>

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
