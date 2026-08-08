import { useEffect, useState } from 'react'
import { reload } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { Link } from 'react-router-dom'
import { auth, functions } from '../firebase'
import './VerifyEmail.css'

function friendlyErrorMessage(code) {
  if (code === 'functions/deadline-exceeded') {
    return 'Linkul a expirat. Intră în cont și cere un email nou de confirmare.'
  }
  if (code === 'functions/permission-denied' || code === 'functions/invalid-argument') {
    return 'Linkul nu mai este valid sau a fost deja folosit. Intră în cont și verifică starea adresei.'
  }
  return 'Nu am putut confirma adresa. Intră în cont și cere un email nou de confirmare.'
}

export default function VerifyEmail() {
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('Verificăm adresa ta de email…')

  useEffect(() => {
    document.title = 'Confirmare email | Mina'
    const robotsMeta = document.createElement('meta')
    robotsMeta.name = 'robots'
    robotsMeta.content = 'noindex, nofollow'
    document.head.appendChild(robotsMeta)

    let cancelled = false
    const confirmEmail = async () => {
      const verificationToken = new URLSearchParams(window.location.search).get('token')
      if (!verificationToken) {
        if (!cancelled) {
          setStatus('error')
          setMessage('Linkul de confirmare este incomplet. Intră în cont și cere unul nou.')
        }
        return
      }

      try {
        const confirmBrandedEmail = httpsCallable(functions, 'confirmBrandedEmail')
        await confirmBrandedEmail({ token: verificationToken })
        if (auth.currentUser) {
          await reload(auth.currentUser)
          await auth.currentUser.getIdToken(true)
        }
        if (!cancelled) {
          setStatus('success')
          setMessage('Adresa ta de email a fost confirmată. Contul Mina este pregătit.')
        }
      } catch (error) {
        if (auth.currentUser) {
          try {
            await reload(auth.currentUser)
            if (auth.currentUser.emailVerified) {
              await auth.currentUser.getIdToken(true)
              if (!cancelled) {
                setStatus('success')
                setMessage('Adresa ta de email este deja confirmată. Contul Mina este pregătit.')
              }
              return
            }
          } catch (_) {
            // The original action-code error below is more useful to the user.
          }
        }

        if (!cancelled) {
          setStatus('error')
          setMessage(friendlyErrorMessage(error?.code))
        }
      }
    }

    confirmEmail()
    return () => {
      cancelled = true
      robotsMeta.remove()
    }
  }, [])

  return (
    <main className="verify-email-page">
      <section className="verify-email-shell" aria-live="polite">
        <Link to="/" className="verify-email-logo" aria-label="Mina — pagina principală">MINA</Link>
        <div className={`verify-email-card verify-email-card--${status}`}>
          <div className="verify-email-accent" />
          <div className="verify-email-content">
            <div className="verify-email-icon" aria-hidden="true">
              {status === 'checking' ? <span className="verify-email-spinner" /> : status === 'success' ? '✓' : '!'}
            </div>
            <p className="verify-email-eyebrow">
              {status === 'checking' ? 'Confirmare în curs' : status === 'success' ? 'Totul este gata' : 'Link invalid'}
            </p>
            <h1>{status === 'success' ? 'Email confirmat' : status === 'error' ? 'Nu am putut confirma' : 'Un moment'}</h1>
            <p className="verify-email-message">{message}</p>
            {status !== 'checking' && (
              <a className="verify-email-button" href={auth.currentUser ? '/dashboard' : '/login'}>
                {auth.currentUser ? 'Mergi în dashboard' : 'Intră în cont'}
              </a>
            )}
          </div>
        </div>
        <p className="verify-email-help">Ai nevoie de ajutor? <a href="mailto:hello@cloudbymina.com">hello@cloudbymina.com</a></p>
      </section>
    </main>
  )
}
