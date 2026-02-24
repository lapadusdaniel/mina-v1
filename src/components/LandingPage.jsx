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

  // Scroll reveal
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
          <a href="#despre">Despre</a>
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
          <p className="fl-hero-eyebrow">Pentru fotografi profesioniști</p>
          <h1 className="fl-hero-title">
            Galerii care lasă<br />
            <em>fotografia să vorbească.</em>
          </h1>
          <p className="fl-hero-sub">
            Tot ce ai nevoie ca fotograf — galerii pentru clienți, stocare sigură, branding personalizat — fără complicații tehnice.
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
            <div className="fl-strip-photo" data-label="Nuntă">
              <span className="fl-strip-icon">🕊</span>
            </div>
            <div className="fl-strip-photo" data-label="Portret">
              <span className="fl-strip-icon">◯</span>
            </div>
            <div className="fl-strip-photo" data-label="Familie">
              <span className="fl-strip-icon">❤</span>
            </div>
            <div className="fl-strip-photo" data-label="Eveniment">
              <span className="fl-strip-icon">✦</span>
            </div>
            <div className="fl-strip-photo" data-label="Commercial">
              <span className="fl-strip-icon">◈</span>
            </div>
          </div>
        </div>

        {/* ── FEATURES ── */}
        <section id="features" className="fl-features">
          <div className="fl-features-header fl-reveal">
            <p className="fl-eyebrow">Funcționalități</p>
            <h2 className="fl-section-title">
              Construit pentru <em>fotografi,</em><br />nu pentru IT-iști.
            </h2>
          </div>
          <div className="fl-features-grid">
            <div className="fl-feature-card fl-reveal">
              <span className="fl-feature-icon">🖼</span>
              <h3 className="fl-feature-title">Galerii pentru clienți</h3>
              <p className="fl-feature-desc">
                Creează galerii personalizate pentru fiecare client. Link unic, acces instant, experiență elegantă.
              </p>
            </div>
            <div className="fl-feature-card fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <span className="fl-feature-icon">☁️</span>
              <h3 className="fl-feature-title">Stocare pe Cloudflare</h3>
              <p className="fl-feature-desc">
                Fotografiile tale sunt stocate sigur pe infrastructura Cloudflare — rapidă, fiabilă, globală.
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

        {/* ── DESPRE ── */}
        <section id="despre" className="fl-despre">
          <div className="fl-despre-inner">
            <div className="fl-reveal">
              <p className="fl-despre-label">Despre Mina</p>
              <h2 className="fl-despre-title">
                Creat de un fotograf,<br />
                <em>pentru fotografi.</em>
              </h2>
              <p className="fl-despre-text">
                Știm cât de mult timp se pierde cu soluții tehnice complicate — link-uri care nu merg, servere care se blochează, formatări care distrug munca ta.
              </p>
              <p className="fl-despre-text" style={{ marginTop: '20px' }}>
                Credem că fotograful trebuie să fie prezent la eveniment, alături de oaspeți — nu blocat în fața monitorului gestionând stocări nesigure. Am construit Mina pentru a fi rapid, intuitiv și invizibil.
              </p>
              <p className="fl-despre-text" style={{ marginTop: '20px' }}>
                Fără clișee, fără promisiuni goale. Doar un instrument care funcționează.
              </p>
            </div>
            <div className="fl-despre-visual fl-reveal" style={{ transitionDelay: '0.15s' }}>
              <div className="fl-despre-visual-inner" />
              <span className="fl-despre-visual-icon">📷</span>
              <div className="fl-despre-badge">
                <span className="fl-despre-badge-icon">✦</span>
                <div className="fl-despre-badge-text">
                  <div className="fl-despre-badge-title">Made în România</div>
                  <div className="fl-despre-badge-sub">Cu atenție la fiecare detaliu</div>
                </div>
              </div>
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
            <p className="fl-pricing-sub">Fără surprize. Plătești doar pentru ce folosești.</p>
          </div>

          <div className="fl-pricing-grid">
            {/* Gratuit */}
            <div className="fl-plan fl-reveal">
              <h3 className="fl-plan-name">Gratuit</h3>
              <p className="fl-plan-storage">15 GB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">0 lei</span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>15 GB stocare foto</li>
                <li>Galerii nelimitate</li>
                <li>Link partajabil</li>
                <li>Suport comunitate</li>
              </ul>
              <button className="fl-btn-plan fl-btn-plan-ghost" onClick={() => navigate('/register')}>
                Începe gratuit
              </button>
            </div>

            {/* Pro */}
            <div className="fl-plan fl-plan-featured fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <span className="fl-plan-badge">Recomandat</span>
              <h3 className="fl-plan-name">Pro</h3>
              <p className="fl-plan-storage">500 GB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">
                  100 lei<span>/lună</span>
                </span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>500 GB stocare foto</li>
                <li>Galerii cu parolă</li>
                <li>Branding personalizat</li>
                <li>Statistici acces</li>
                <li>Suport prioritar</li>
              </ul>
              <button className="fl-btn-plan fl-btn-plan-gold" onClick={() => navigate('/register')}>
                Alege Pro
              </button>
            </div>

            {/* Unlimited */}
            <div className="fl-plan fl-reveal" style={{ transitionDelay: '0.2s' }}>
              <h3 className="fl-plan-name">Unlimited</h3>
              <p className="fl-plan-storage">1 TB stocare</p>
              <div className="fl-plan-price">
                <span className="fl-plan-price-amount">
                  150 lei<span>/lună</span>
                </span>
              </div>
              <div className="fl-plan-divider" />
              <ul className="fl-plan-features">
                <li>1 TB stocare foto</li>
                <li>Tot ce include Pro</li>
                <li>Domeniu custom</li>
                <li>API access</li>
                <li>Suport dedicat</li>
              </ul>
              <button className="fl-btn-plan fl-btn-plan-ghost" onClick={() => navigate('/register')}>
                Alege Unlimited
              </button>
            </div>
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
            <a href="#despre">Despre noi</a>
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
          <span className="fl-footer-copy">© 2025 Mina. Toate drepturile rezervate.</span>
          <span className="fl-footer-made">Construit cu React & Cloudflare ✦</span>
        </div>
      </footer>

    </div>
  )
}

export default LandingPage
