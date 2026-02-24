import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import './App.css'
import Login from './components/login.jsx'
import Register from './components/Register.jsx'
import { getAppServices } from './core/bootstrap/appBootstrap'

const Dashboard = lazy(() => import('./components/Dashboard.jsx'))
const ClientGallery = lazy(() => import('./components/ClientGallery.jsx'))
const PhotographerSite = lazy(() => import('./components/PhotographerSite.jsx'))
const LandingPage = lazy(() => import('./components/LandingPage.jsx'))
const AdminPanel = lazy(() => import('./components/AdminPanel.jsx'))

const authService = getAppServices().auth
const sitesService = getAppServices().sites

function FullscreenLoader() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Serif Display', Georgia, serif",
      fontStyle: 'italic',
      fontSize: '1.5rem',
      color: '#1d1d1f',
    }}>
      Mina
    </div>
  )
}

// ── SlugRouter ────────────────────────────────
// Verifică în Firestore dacă slug-ul aparține unui site de fotograf
// sau unei galerii client. Loading state cu logo pulsând.
function SlugRouter() {
  const { slug } = useParams()
  const [target, setTarget] = useState(null) // 'site' | 'gallery' | 'notfound'

  useEffect(() => {
    if (!slug) { setTarget('notfound'); return }
    let cancelled = false

    const check = async () => {
      try {
        const resolved = await sitesService.resolveSlugTarget(slug)
        if (!cancelled) setTarget(resolved)
      } catch (err) {
        console.error('SlugRouter error:', err)
        if (!cancelled) setTarget('notfound')
      }
    }

    check()
    return () => { cancelled = true }
  }, [slug])

  if (target === null) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        fontFamily: "'DM Serif Display', Georgia, serif",
      }}>
        <style>{`
          @keyframes minaLogoPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.25; }
          }
        `}</style>
        <p style={{
          fontStyle: 'italic',
          fontSize: '1.5rem',
          color: '#1d1d1f',
          margin: 0,
          animation: 'minaLogoPulse 1.8s ease-in-out infinite',
        }}>
          Mina
        </p>
      </div>
    )
  }

  if (target === 'site') return <PhotographerSite />
  if (target === 'gallery') return <ClientGallery />
  return <Navigate to="/" replace />
}

function AuthLayout({ children }) {
  return <div style={{ fontFamily: 'Arial, sans-serif' }}>{children}</div>
}

function ProtectedDashboard({ user, onLogout, initialTab }) {
  if (!user) return <Navigate to="/login" replace />
  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <Dashboard user={user} onLogout={onLogout} initialTab={initialTab} />
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = authService.watchSession((sessionUser) => {
      setUser(sessionUser)
      setLoadingAuth(false)
    })
    return () => unsubscribe()
  }, [])

  const handleLogin = (userData) => { setUser(userData); navigate('/dashboard') }
  const handleRegister = (userData) => { setUser(userData); navigate('/dashboard') }
  const handleLogout = async () => {
    if (!window.confirm('Sigur vrei să te deconectezi?')) return
    try { await authService.logout() } catch (e) { console.error(e) }
    setUser(null)
    navigate('/')
  }

  if (loadingAuth) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Serif Display', Georgia, serif",
        fontStyle: 'italic',
        fontSize: '1.5rem',
        color: '#1d1d1f',
      }}>
        Mina
      </div>
    )
  }

  return (
    <Suspense fallback={<FullscreenLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AuthLayout><Login onLogin={handleLogin} onSwitchToRegister={() => navigate('/register')} /></AuthLayout>} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <AuthLayout><Register onRegister={handleRegister} onSwitchToLogin={() => navigate('/login')} /></AuthLayout>} />
        <Route path="/dashboard" element={<ProtectedDashboard user={user} onLogout={handleLogout} />} />
        <Route path="/settings" element={<ProtectedDashboard user={user} onLogout={handleLogout} initialTab="setari" />} />
        <Route path="/admin" element={<AdminPanel user={user} />} />
        <Route path="/gallery/:id" element={<ClientGallery />} />
        <Route path="/" element={<LandingPage user={user} />} />
        <Route path="/:slug" element={<SlugRouter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
