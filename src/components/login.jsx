import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { auth } from '../firebase'

const authService = getAppServices().auth

function Login({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  const openResetFlow = () => {
    setShowReset(true)
    setResetError('')
    setResetSuccess('')
    setError('')
    if (email.trim()) setResetEmail(email.trim())
  }

  const backToLogin = () => {
    setShowReset(false)
    setResetError('')
    setResetSuccess('')
    setResetLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Completează toate câmpurile.')
      return
    }
    setLoading(true)
    try {
      const sessionUser = await authService.loginWithEmail({ email, password })
      onLogin(sessionUser)
    } catch (err) {
      if (err.code === 'auth/configuration-not-found') {
        setError('Firebase Authentication nu este configurat în proiect. Activează Auth > Email/Password în Firebase Console.')
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Email sau parolă greșită.')
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Login cu Email/Parolă nu este activ. Activează provider-ul în Firebase Console.')
      } else if (err.code === 'auth/user-not-found') {
        setError('Nu există cont cu acest email.')
      } else if (err.code === 'auth/invalid-email') {
        setError('Adresă de email invalidă.')
      } else {
        setError('Eroare la autentificare. Încearcă din nou.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setResetError('')

    const targetEmail = String(resetEmail || '').trim()
    if (!targetEmail) {
      setResetError('Completează adresa de email.')
      return
    }

    setResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, targetEmail)
      setResetSuccess('Am trimis un link de resetare la adresa introdusă. Verifică și folderul Spam.')
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        setResetError('Nu am găsit niciun cont cu această adresă.')
      } else {
        setResetError('A apărut o eroare. Încearcă din nou.')
      }
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f7',
      padding: '40px 24px',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link
            to="/"
            style={{
              display: 'inline-block',
              margin: '0 0 8px',
              lineHeight: 1,
              textDecoration: 'none',
            }}
          >
            <span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span>
          </Link>
          <p style={{
            fontSize: '15px',
            fontWeight: 300,
            color: '#86868b',
            margin: 0,
          }}>
            {showReset ? 'Resetare parolă' : 'Intră în contul tău'}
          </p>
        </div>

        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '36px 32px',
          boxShadow: '0 2px 24px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
        }}>

          {!showReset && error && (
            <div style={{
              backgroundColor: '#fff0f0',
              border: '1px solid rgba(192, 57, 43, 0.2)',
              color: '#c0392b',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '24px',
              fontSize: '13.5px',
              fontWeight: 400,
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {showReset ? (
            resetSuccess ? (
              <div>
                <div style={{
                  backgroundColor: '#f3faf4',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  color: '#166534',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  fontSize: '13.5px',
                  fontWeight: 400,
                  textAlign: 'center',
                }}>
                  {resetSuccess}
                </div>

                <p style={{
                  marginTop: '10px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 300,
                  color: '#86868b',
                  marginBottom: 0,
                }}>
                  <span
                    onClick={backToLogin}
                    style={{
                      color: '#b8965a',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Înapoi la login
                  </span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                {resetError && (
                  <div style={{
                    backgroundColor: '#fff0f0',
                    border: '1px solid rgba(192, 57, 43, 0.2)',
                    color: '#c0392b',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                    fontSize: '13.5px',
                    fontWeight: 400,
                    textAlign: 'center',
                  }}>
                    {resetError}
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '7px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: 'rgba(0, 0, 0, 0.45)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => { setResetEmail(e.target.value); setResetError('') }}
                    placeholder="nume@exemplu.ro"
                    disabled={resetLoading}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1px solid #e5e5e7',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: 300,
                      color: '#1d1d1f',
                      backgroundColor: '#fafafa',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      margin: 0,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#b8965a'
                      e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
                      e.target.style.backgroundColor = '#fff'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e5e7'
                      e.target.style.boxShadow = 'none'
                      e.target.style.backgroundColor = '#fafafa'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: resetLoading ? '#3a3a3c' : '#1d1d1f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '100px',
                    fontSize: '15px',
                    fontWeight: 500,
                    cursor: resetLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '0.01em',
                    transition: 'background 0.15s',
                  }}
                >
                  {resetLoading ? 'Se trimite...' : 'Trimite link de resetare'}
                </button>

                <p style={{
                  marginTop: '18px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 300,
                  color: '#86868b',
                  marginBottom: 0,
                }}>
                  <span
                    onClick={resetLoading ? undefined : backToLogin}
                    style={{
                      color: '#b8965a',
                      cursor: resetLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      opacity: resetLoading ? 0.5 : 1,
                    }}
                  >
                    Înapoi la login
                  </span>
                </p>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '7px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: 'rgba(0, 0, 0, 0.45)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    placeholder="nume@exemplu.ro"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1px solid #e5e5e7',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: 300,
                      color: '#1d1d1f',
                      backgroundColor: '#fafafa',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      margin: 0,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#b8965a'
                      e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
                      e.target.style.backgroundColor = '#fff'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e5e7'
                      e.target.style.boxShadow = 'none'
                      e.target.style.backgroundColor = '#fafafa'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '7px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: 'rgba(0, 0, 0, 0.45)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    Parolă
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    placeholder="••••••••"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1px solid #e5e5e7',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: 300,
                      color: '#1d1d1f',
                      backgroundColor: '#fafafa',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      margin: 0,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#b8965a'
                      e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
                      e.target.style.backgroundColor = '#fff'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e5e7'
                      e.target.style.boxShadow = 'none'
                      e.target.style.backgroundColor = '#fafafa'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: loading ? '#3a3a3c' : '#1d1d1f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '100px',
                    fontSize: '15px',
                    fontWeight: 500,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '0.01em',
                    transition: 'background 0.15s',
                  }}
                >
                  {loading ? 'Se autentifică...' : 'Intră în cont'}
                </button>
              </form>

              <p style={{
                marginTop: '14px',
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: 400,
                color: '#86868b',
                marginBottom: 0,
              }}>
                <span
                  onClick={loading ? undefined : openResetFlow}
                  style={{
                    color: '#b8965a',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Ai uitat parola?
                </span>
              </p>

              <p style={{
                marginTop: '18px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 300,
                color: '#86868b',
                marginBottom: 0,
              }}>
                Nu ai cont?{' '}
                <span
                  onClick={loading ? undefined : onSwitchToRegister}
                  style={{
                    color: '#b8965a',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Înregistrează-te
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
