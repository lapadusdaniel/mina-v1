import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import './LandingPage.css'

function LandingPage({ user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const galerieSlug = searchParams.get('galerie')

  useEffect(() => {
    if (galerieSlug) navigate(`/${galerieSlug}`, { replace: true })
  }, [galerieSlug, navigate])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.fl-reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  if (galerieSlug) return <div style={{ textAlign: 'center', padding: '100px' }}>Se încarcă...</div>

  return (
    <div className="fl">

      {/* ── HEADER ── */}
      <header className="fl-header">
        <button className="fl-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          Mina
        </button>
        <nav className="fl-nav">
          <a href="#features">Funcționalități</a>
          <a href="#preturi">Prețuri</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="fl-header-actions">
          {user ? (
            <button className="fl-btn-pill" onClick={() => navigate('/dashboard')}>Dashboard</button>
          ) : (
            <>
              <button className="fl-btn-link" onClick={() => navigate('/login')}>Autentificare</button>
              <button className="fl-btn-pill" onClick={() => navigate('/register')}>Înregistrare</button>
            </>
          )}
        </div>
      </header>

      <main>

        {/* ── HERO ── */}
        <section className="fl-hero">
          <p className="fl-hero-eyebrow">Platformă pentru fotografi din România</p>
          <h1 className="fl-hero-title">
            Livrează galerii profesionale.<br />
            <em>Fără să te gândești la spațiu.</em>
          </h1>
          <p className="fl-hero-sub">
            Stochezi, trimiți un link, gata. Clientul vede fotografiile într-o galerie elegantă — tu te ocupi de ce contează.
          </p>
          <div className="fl-hero-actions">
            <button className="fl-btn-cta" onClick={() => navigate('/register')}>
              Începe gratuit
            </button>
            <a className="fl-btn-text" href="#features">
              Descoperă
            </a>
          </div>
        </section>

        {/* ── PHOTO STRIP ── */}
        <div className="fl-strip">
          <div className="fl-strip-inner">
            <div className="fl-strip-photo" data-label="Nuntă" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1519741497674-611481863552?w=400&q=80&auto=format&fit=crop)' }} />
            <div className="fl-strip-photo" data-label="Portret" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80&auto=format&fit=crop)' }} />
            <div className="fl-strip-photo" data-label="Familie" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1511895426328-dc8714191011?w=400&q=80&auto=format&fit=crop)' }} />
            <div className="fl-strip-photo" data-label="Eveniment" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&q=80&auto=format&fit=crop)' }} />
            <div className="fl-strip-photo" data-label="Portret" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&q=80&auto=format&fit=crop)' }} />
          </div>
        </div>

        {/* ── FEATURES ── */}
        <section id="features" className="fl-features">
          <div className="fl-features-header fl-reveal">
            <p className="fl-eyebrow">Funcționalități</p>
            <h2 className="fl-section-title">
              Construit de fotografi,<br />
              <em>pentru fotografi.</em>
            </h2>
          </div>
          <div className="fl-features-grid">
            <div className="fl-feature-card fl-reveal">
              <span className="fl-feature-icon">🖼</span>
              <h3 className="fl-feature-title">Galerii pentru clienți</h3>
              <p className="fl-feature-desc">
                Creezi galeria, trimiți linkul, clientul vede și alege favoritele. Experiență clară, fără confuzie.
              </p>
            </div>
            <div className="fl-feature-card fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <span className="fl-feature-icon">☁️</span>
              <h3 className="fl-feature-title">Stocare sigură și rapidă</h3>
              <p className="fl-feature-desc">
                Fotografiile tale sunt păstrate în siguranță și disponibile oricând ai nevoie de ele.
              </p>
            </div>
            <div className="fl-feature-card fl-reveal" style={{ transitionDelay: '0.2s' }}>
              <span className="fl-feature-icon">🔒</span>
              <h3 className="fl-feature-title">Protecție cu parolă</h3>
              <p className="fl-feature-desc">
                Fiecare galerie poate fi protejată cu parolă. Clientul vede doar ce vrei tu să vadă.
              </p>
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="preturi" className="fl-pricing">
          <div className="fl-pricing-header fl-reveal">
            <p className="fl-eyebrow">Prețuri</p>
            <h2 className="fl-section-title">
              Simplu și <em>transparent.</em>
            </h2>
            <p className="fl-pricing-sub">Alegi planul potrivit pentru volumul tău de lucru.</p>
            <p className="fl-pricing-sub">Add-on 500 GB: 49 lei/lună.</p>
          </div>

          <div className="fl-pricing-grid">
            <div className="fl-plan fl-reveal">
              <h3 className="fl-plan-name">Free</h3>
              <p className="fl-plan-storage">30 GB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">0 lei</span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>30 GB stocare</li>
                <li>3 galerii active</li>
                <li>Galerii protejate cu parolă</li>
                <li>Selecții favorite pentru clienți</li>
                <li className="fl-plan-feature-muted">Fără site de prezentare</li>
              </ul>
              <p className="fl-plan-desc">Pentru început, fără card.</p>
              <button className="fl-btn-plan fl-btn-plan-ghost" onClick={() => navigate('/register')}>
                Începe gratuit
              </button>
            </div>

            <div className="fl-plan fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <h3 className="fl-plan-name">Starter</h3>
              <p className="fl-plan-storage">150 GB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">39 lei<span>/lună</span></span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>150 GB stocare</li>
                <li>Galerii nelimitate</li>
                <li>Galerii protejate cu parolă</li>
                <li>Selecții favorite pentru clienți</li>
                <li>Site de prezentare inclus</li>
              </ul>
              <p className="fl-plan-desc">Pentru fotograful care livrează constant.</p>
              <button className="fl-btn-plan fl-btn-plan-ghost" onClick={() => navigate('/register')}>
                Alege Starter
              </button>
            </div>

            <div className="fl-plan fl-plan-featured fl-reveal" style={{ transitionDelay: '0.2s' }}>
              <span className="fl-plan-badge">Recomandat</span>
              <h3 className="fl-plan-name">Pro</h3>
              <p className="fl-plan-storage">600 GB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">79 lei<span>/lună</span></span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>600 GB stocare</li>
                <li>Galerii nelimitate</li>
                <li>Galerii protejate cu parolă</li>
                <li>Selecții favorite pentru clienți</li>
                <li>Site de prezentare inclus</li>
              </ul>
              <p className="fl-plan-desc">Volumul de care ai nevoie în sezon.</p>
              <button className="fl-btn-plan fl-btn-plan-gold" onClick={() => navigate('/register')}>
                Alege Pro
              </button>
            </div>

            <div className="fl-plan fl-reveal" style={{ transitionDelay: '0.3s' }}>
              <h3 className="fl-plan-name">Studio</h3>
              <p className="fl-plan-storage">2 TB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">129 lei<span>/lună</span></span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>2 TB stocare</li>
                <li>Galerii nelimitate</li>
                <li>Galerii protejate cu parolă</li>
                <li>Selecții favorite pentru clienți</li>
                <li>Site de prezentare inclus</li>
              </ul>
              <p className="fl-plan-desc">Pentru volum mare, fără compromisuri.</p>
              <button className="fl-btn-plan fl-btn-plan-ghost" onClick={() => navigate('/register')}>
                Alege Studio
              </button>
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ── */}
        <section className="fl-cta-final fl-reveal">
          <div className="fl-cta-final-inner">
            <h2 className="fl-section-title">
              Livrare profesionistă.<br />
              <em>Simplu.</em>
            </h2>
            <p className="fl-cta-final-sub">Creat în România, de un fotograf.</p>
            <button className="fl-btn-cta" onClick={() => navigate('/register')}>
              Începe gratuit
            </button>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section id="contact" className="fl-contact">
          <div className="fl-contact-inner fl-reveal">
            <p className="fl-eyebrow" style={{ marginBottom: '16px' }}>Contact</p>
            <h2 className="fl-section-title" style={{ marginBottom: '16px' }}>
              Ai <em>întrebări?</em>
            </h2>
            <p className="fl-contact-sub">
              Scrie-ne și îți răspundem în cel mai scurt timp.
            </p>
            <form className="fl-contact-form" onSubmit={(e) => e.preventDefault()}>
              <div className="fl-form-row">
                <input className="fl-input" type="text" placeholder="Nume" required />
                <input className="fl-input" type="email" placeholder="Email" required />
              </div>
              <textarea className="fl-input" placeholder="Mesajul tău" rows="5" required />
              <button type="submit" className="fl-btn-send">Trimite mesaj</button>
            </form>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="fl-footer">
        <div className="fl-footer-top">
          <div>
            <div className="fl-footer-logo">Mina</div>
            <p className="fl-footer-tagline">
              Galerii profesionale pentru fotografi.<br />
              Made with ♥ în România.
            </p>
          </div>
          <div className="fl-footer-col">
            <h4>Produs</h4>
            <a href="#features">Funcționalități</a>
            <a href="#preturi">Prețuri</a>
          </div>
          <div className="fl-footer-col">
            <h4>Companie</h4>
            <a href="#contact">Contact</a>
          </div>
          <div className="fl-footer-col">
            <h4>Legal</h4>
            <p>GDPR</p>
            <p>Termeni</p>
            <p>Confidențialitate</p>
          </div>
        </div>
        <div className="fl-footer-bottom">
          <span className="fl-footer-copy">© 2026 Mina. Toate drepturile rezervate.</span>
          <span className="fl-footer-made">Construit în România ✦</span>
        </div>
      </footer>

    </div>
  )
}

export default LandingPage