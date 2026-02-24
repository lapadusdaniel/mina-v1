import { useState } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const authService = getAppServices().auth

function Login({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      } else
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
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

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '1.75rem',
            color: '#1d1d1f',
            letterSpacing: '0.01em',
            margin: '0 0 8px',
          }}>
            Mina
          </h1>
          <p style={{
            fontSize: '15px',
            fontWeight: 300,
            color: '#86868b',
            margin: 0,
          }}>
            Intră în contul tău
          </p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '36px 32px',
          boxShadow: '0 2px 24px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
        }}>

          {/* Error */}
          {error && (
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

          <form onSubmit={handleSubmit}>
            {/* Email */}
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
                onFocus={e => {
                  e.target.style.borderColor = '#b8965a'
                  e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
                  e.target.style.backgroundColor = '#fff'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#e5e5e7'
                  e.target.style.boxShadow = 'none'
                  e.target.style.backgroundColor = '#fafafa'
                }}
              />
            </div>

            {/* Parola */}
            <div style={{ marginBottom: '28px' }}>
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
                onFocus={e => {
                  e.target.style.borderColor = '#b8965a'
                  e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
                  e.target.style.backgroundColor = '#fff'
                }}
                onBlur={e => {
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
            marginTop: '24px',
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
        </div>
      </div>
    </div>
  )
}

export default Login
