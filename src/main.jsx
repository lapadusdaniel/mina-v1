import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

function renderStartupError(error) {
  const message = error?.message || 'Eroare necunoscută la inițializare.'
  createRoot(document.getElementById('root')).render(
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: '#f5f5f7',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        maxWidth: '680px',
        width: '100%',
        background: '#fff',
        border: '1px solid #e5e5e7',
        borderRadius: '14px',
        padding: '22px',
      }}>
        <p style={{ margin: 0, fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: 'italic', fontSize: '1.5rem', color: '#1d1d1f' }}>
          Mina
        </p>
        <p style={{ margin: '14px 0 8px', fontSize: '16px', color: '#1d1d1f', fontWeight: 600 }}>
          Configurare lipsă sau invalidă
        </p>
        <p style={{ margin: 0, fontSize: '14px', color: '#3a3a3c', lineHeight: 1.6 }}>
          Verifică fișierul <code>.env</code> din proiect și repornește serverul.
        </p>
        <pre style={{
          marginTop: '14px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#f9f9fb',
          borderRadius: '10px',
          padding: '12px',
          fontSize: '12px',
          color: '#6e6e73',
        }}>
          {message}
        </pre>
      </div>
    </div>
  )
}

async function startApp() {
  try {
    const [{ default: App }, { bootstrapApp }] = await Promise.all([
      import('./App.jsx'),
      import('./core/bootstrap/appBootstrap'),
    ])

    bootstrapApp()

    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    )
  } catch (error) {
    console.error('Startup failed:', error)
    renderStartupError(error)
  }
}

startApp()
