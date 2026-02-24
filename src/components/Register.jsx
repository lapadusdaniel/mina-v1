import { useState } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const authService = getAppServices().auth

function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    brandName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.name || !formData.brandName || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Completează toate câmpurile.')
      return
    }
    if (formData.password.length < 8) {
      setError('Parola trebuie să aibă minim 8 caractere.')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Parolele nu coincid.')
      return
    }

    setLoading(true)
    try {
      const sessionUser = await authService.registerWithEmail({
        name: formData.name,
        brandName: formData.brandName,
        email: formData.email,
        password: formData.password,
      })
      onRegister(sessionUser)
    } catch (err) {
      if (err.code === 'auth/configuration-not-found') {
        setError('Firebase Authentication nu este configurat în proiect. Activează Auth > Email/Password în Firebase Console.')
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Înregistrarea cu Email/Parolă nu este activă. Activează provider-ul în Firebase Console.')
      } else
      if (err.code === 'auth/email-already-in-use') {
        setError('Există deja un cont cu acest email.')
      } else if (err.code === 'auth/invalid-email') {
        setError('Adresă de email invalidă.')
      } else {
        setError('Eroare la înregistrare. Încearcă din nou.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
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
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '7px',
    fontSize: '11.5px',
    fontWeight: 500,
    color: 'rgba(0, 0, 0, 0.45)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  }

  const handleFocus = (e) => {
    e.target.style.borderColor = '#b8965a'
    e.target.style.boxShadow = '0 0 0 3px rgba(184, 150, 90, 0.1)'
    e.target.style.backgroundColor = '#fff'
  }

  const handleBlur = (e) => {
    e.target.style.borderColor = '#e5e5e7'
    e.target.style.boxShadow = 'none'
    e.target.style.backgroundColor = '#fafafa'
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
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
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
            14 zile gratuit. Fără card.
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

          {error && (
            <div style={{
              backgroundColor: '#fff0f0',
              border: '1px solid rgba(192, 57, 43, 0.2)',
              color: '#c0392b',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '24px',
              fontSize: '13.5px',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Nume</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ion Popescu"
                  disabled={loading}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <div>
                <label style={labelStyle}>Brand</label>
                <input
                  type="text"
                  name="brandName"
                  value={formData.brandName}
                  onChange={handleChange}
                  placeholder="Studio Foto"
                  disabled={loading}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="email@exemplu.ro"
                disabled={loading}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
              <div>
                <label style={labelStyle}>Parolă</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min. 8 caractere"
                  disabled={loading}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirmă</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repetă parola"
                  disabled={loading}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
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
              {loading ? 'Se creează contul...' : 'Creează cont gratuit'}
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
            Ai deja cont?{' '}
            <span
              onClick={loading ? undefined : onSwitchToLogin}
              style={{
                color: '#b8965a',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                opacity: loading ? 0.4 : 1,
              }}
            >
              Autentifică-te
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Register
