import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './LegalPage.css'
import { openCookieSettings } from '../services/analytics'

export default function LegalPage({ title, updatedAt, children }) {
  useEffect(() => {
    const pageTitle = `${title} — Mina`
    const description = `${title} pentru platforma Mina, disponibilă la cloudbymina.com.`
    document.title = pageTitle
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}${window.location.pathname}`)
    return () => {
      document.title = 'Mina — Galerii foto online pentru fotografi'
    }
  }, [title])

  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/" className="legal-brand">MINA</Link>
      </header>

      <main className="legal-main">
        <article className="legal-article">
          <h1>{title}</h1>
          <p className="legal-updated">Ultima actualizare: {updatedAt}</p>
          {children}
        </article>
      </main>

      <footer className="legal-footer">
        <nav className="legal-footer-links" aria-label="Navigație pagini legale">
          <Link to="/termeni">Termeni</Link>
          <span>·</span>
          <Link to="/confidentialitate">Confidențialitate</Link>
          <span>·</span>
          <Link to="/refund">Refund</Link>
          <span>·</span>
          <button type="button" className="legal-footer-cookie-btn" onClick={openCookieSettings}>Preferințe cookie</button>
          <span>·</span>
          <Link to="/">Acasă</Link>
        </nav>
      </footer>
    </div>
  )
}
