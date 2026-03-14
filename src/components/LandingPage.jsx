import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions as firebaseFunctions } from '../firebase'
import './LandingPage.css'

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    storage: '15 GB',
    monthly: { display: '0 lei', priceId: null },
    yearly:  { display: '0 lei', equiv: null, priceId: null },
    features: ['15 GB stocare', '3 galerii active', 'Galerii cu parolă', 'Selecții favorite'],
    lockedFeatures: ['Fără site de prezentare'],
    desc: 'Pentru început, fără card.',
    cta: 'Începe gratuit',
    ctaStyle: 'fl-btn-plan-ghost',
    featured: false,
  },
  {
    key: 'esential',
    name: 'Esențial',
    storage: '100 GB',
    monthly: { display: '29 lei', priceId: import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_MONTHLY },
    yearly:  { display: '289 lei', equiv: '~24 lei/lună', priceId: import.meta.env.VITE_STRIPE_PRICE_ESENTIAL_YEARLY },
    features: ['100 GB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Pentru fotograful care livrează constant.',
    cta: 'Alege Esențial',
    ctaStyle: 'fl-btn-plan-ghost',
    featured: false,
  },
  {
    key: 'plus',
    name: 'Plus',
    storage: '500 GB',
    monthly: { display: '49 lei', priceId: import.meta.env.VITE_STRIPE_PRICE_PLUS_MONTHLY },
    yearly:  { display: '489 lei', equiv: '~41 lei/lună', priceId: import.meta.env.VITE_STRIPE_PRICE_PLUS_YEARLY },
    features: ['500 GB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Volumul de care ai nevoie în sezon.',
    cta: 'Alege Plus',
    ctaStyle: 'fl-btn-plan-gold',
    featured: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    storage: '1 TB',
    monthly: { display: '79 lei', priceId: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY },
    yearly:  { display: '789 lei', equiv: '~66 lei/lună', priceId: import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY },
    features: ['1 TB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Profesioniști cu volum mare.',
    cta: 'Alege Pro',
    ctaStyle: 'fl-btn-plan-ghost',
    featured: false,
  },
  {
    key: 'studio',
    name: 'Studio',
    storage: '2 TB',
    monthly: { display: '129 lei', priceId: import.meta.env.VITE_STRIPE_PRICE_STUDIO_MONTHLY },
    yearly:  { display: '1.289 lei', equiv: '~107 lei/lună', priceId: import.meta.env.VITE_STRIPE_PRICE_STUDIO_YEARLY },
    features: ['2 TB stocare', 'Galerii nelimitate', 'Galerii cu parolă', 'Selecții favorite', 'Site de prezentare'],
    lockedFeatures: [],
    desc: 'Fără compromisuri.',
    cta: 'Alege Studio',
    ctaStyle: 'fl-btn-plan-ghost',
    featured: false,
  },
]

function LandingPage({ user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const galerieSlug = searchParams.get('galerie')
  const [contactForm, setContactForm] = useState({ nume: '', email: '', mesaj: '' })
  const [contactSending, setContactSending] = useState(false)
  const [contactFeedback, setContactFeedback] = useState('')
  const [billingCycle, setBillingCycle] = useState('monthly')

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

  const handleContactSubmit = async (e) => {
    e.preventDefault()
    if (contactSending) return

    const nume = String(contactForm.nume || '').trim()
    const email = String(contactForm.email || '').trim().toLowerCase()
    const mesaj = String(contactForm.mesaj || '').trim()

    if (!nume || !email || !mesaj) {
      setContactFeedback('A apărut o eroare. Încearcă din nou.')
      return
    }

    setContactSending(true)
    setContactFeedback('')

    try {
      await addDoc(collection(db, 'contactMessages'), {
        nume,
        email,
        mesaj,
        name: nume,
        message: mesaj,
        phone: '',
        read: false,
        createdAt: new Date(),
      })

      const sendContactNotification = httpsCallable(firebaseFunctions, 'sendContactNotification')
      await sendContactNotification({ nume, email, mesaj })

      setContactForm({ nume: '', email: '', mesaj: '' })
      setContactFeedback('Mesajul tău a fost trimis! Te contactăm în maxim 24 de ore.')
    } catch (err) {
      console.error('Landing contact submit failed', err)
      setContactFeedback('A apărut o eroare. Încearcă din nou.')
    } finally {
      setContactSending(false)
    }
  }

  return (
    <div className="fl">

      {/* ── HEADER ── */}
      <header className="fl-header">
        <button className="fl-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span>
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

            <div className="fl-billing-toggle">
              <button
                className={`fl-billing-option${billingCycle === 'monthly' ? ' fl-billing-option-active' : ''}`}
                onClick={() => setBillingCycle('monthly')}
              >
                Lunar
              </button>
              <button
                className={`fl-billing-option${billingCycle === 'yearly' ? ' fl-billing-option-active' : ''}`}
                onClick={() => setBillingCycle('yearly')}
              >
                Anual
                <span className="fl-billing-save">−17%</span>
              </button>
            </div>
          </div>

          <div className="fl-pricing-grid fl-pricing-grid-5">
            {PLANS.map((plan, i) => {
              const price = billingCycle === 'yearly' ? plan.yearly : plan.monthly
              const delay = i * 0.07
              return (
                <div
                  key={plan.key}
                  className={`fl-plan fl-reveal${plan.featured ? ' fl-plan-featured' : ''}`}
                  style={{ transitionDelay: `${delay}s` }}
                >
                  {plan.featured && <span className="fl-plan-badge">Recomandat</span>}
                  <h3 className="fl-plan-name">{plan.name}</h3>
                  <p className="fl-plan-storage">{plan.storage} stocare</p>
                  <div className="fl-plan-price">
                    <span className="fl-plan-price-amount">
                      {price.display}
                      {plan.key !== 'free' && billingCycle === 'monthly' && <span>/lună</span>}
                      {plan.key !== 'free' && billingCycle === 'yearly' && <span>/an</span>}
                    </span>
                    {billingCycle === 'yearly' && price.equiv && (
                      <p className="fl-plan-price-equiv">{price.equiv}</p>
                    )}
                  </div>
                  <div className="fl-plan-divider" />
                  <ul className="fl-plan-features">
                    {plan.features.map((f) => <li key={f}>{f}</li>)}
                    {plan.lockedFeatures.map((f) => (
                      <li key={f} className="fl-plan-feature-muted">{f}</li>
                    ))}
                  </ul>
                  <p className="fl-plan-desc">{plan.desc}</p>
                  <button
                    className={`fl-btn-plan ${plan.ctaStyle}`}
                    onClick={() => navigate(
                      plan.key === 'free'
                        ? '/register'
                        : `/register?plan=${plan.key}&cycle=${billingCycle}`
                    )}
                  >
                    {plan.cta}
                  </button>
                </div>
              )
            })}
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
            <form className="fl-contact-form" onSubmit={handleContactSubmit}>
              <div className="fl-form-row">
                <input
                  className="fl-input"
                  type="text"
                  placeholder="Nume"
                  value={contactForm.nume}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, nume: e.target.value }))}
                  required
                />
                <input
                  className="fl-input"
                  type="email"
                  placeholder="Email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <textarea
                className="fl-input"
                placeholder="Mesajul tău"
                rows="5"
                value={contactForm.mesaj}
                onChange={(e) => setContactForm((prev) => ({ ...prev, mesaj: e.target.value }))}
                required
              />
              <button type="submit" className="fl-btn-send" disabled={contactSending}>
                {contactSending ? 'Se trimite...' : 'Trimite mesaj'}
              </button>
              {contactFeedback && (
                <p className="fl-contact-feedback">{contactFeedback}</p>
              )}
            </form>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="fl-footer">
        <div className="fl-footer-top">
          <div>
            <div className="fl-footer-logo"><span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span></div>
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
            <div className="fl-footer-legal-links">
              <Link to="/termeni">Termeni</Link>
              <span>·</span>
              <Link to="/confidentialitate">Confidențialitate</Link>
              <span>·</span>
              <Link to="/refund">Refund</Link>
            </div>
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