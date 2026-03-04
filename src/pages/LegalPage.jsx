import { Link } from 'react-router-dom'
import './LegalPage.css'

export default function LegalPage({ title, updatedAt, children }) {
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
          <Link to="/">Acasă</Link>
        </nav>
      </footer>
    </div>
  )
}
