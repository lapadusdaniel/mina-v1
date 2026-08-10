import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { openCookieSettings } from '../services/analytics'
import {
  FOUNDER_OFFER,
  PRICING_PLANS,
  getPlanPrice,
  isFounderOfferActive,
} from '../modules/billing/pricing.config'
import './LandingPage.css'

const LANDING_TITLE = 'Mina — Galerii foto online pentru fotografi'
const LANDING_DESCRIPTION = 'Livrează galerii foto elegante, protejate și ușor de selectat. Mina oferă stocare, galerii pentru clienți și site de prezentare pentru fotografi.'
const sitesService = getAppServices().sites

const PRIMARY_PRICING_PLANS = PRICING_PLANS.filter(({ key }) => ['free', 'esential', 'plus'].includes(key))
const VOLUME_PRICING_PLANS = PRICING_PLANS.filter(({ key }) => ['pro', 'studio'].includes(key))

function LandingPage({ user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const galerieSlug = searchParams.get('galerie')
  const [contactForm, setContactForm] = useState({ nume: '', email: '', mesaj: '', websiteConfirm: '' })
  const [contactSending, setContactSending] = useState(false)
  const [contactFeedback, setContactFeedback] = useState('')
  const [billingCycle, setBillingCycle] = useState('monthly')
  const founderOfferActive = isFounderOfferActive()

  useEffect(() => {
    document.title = LANDING_TITLE
    document.querySelector('meta[name="description"]')?.setAttribute('content', LANDING_DESCRIPTION)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}/`)
  }, [])

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
      await sitesService.submitContactMessage({
        name: nume,
        email,
        message: mesaj,
        websiteConfirm: contactForm.websiteConfirm,
      })

      setContactForm({ nume: '', email: '', mesaj: '', websiteConfirm: '' })
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
          <div className="fl-hero-trust" aria-label="Avantajele planului gratuit">
            <span>5 GB gratuit</span>
            <span>Fără card</span>
            <span>Galerii cu parolă</span>
          </div>
        </section>

        {/* ── PRODUCT SHOWCASE ── */}
        <section className="fl-product-showcase">
          <div className="fl-product-showcase-copy fl-reveal">
            <p className="fl-eyebrow">Produsul Mina</p>
            <h2 className="fl-section-title">
              Tot fluxul tău, <em>într-un singur loc.</em>
            </h2>
            <p>
              Organizezi galeriile, primești selecțiile clienților și îți publici site-ul — fără să schimbi platforma.
            </p>
          </div>

          <figure className="fl-product-frame fl-reveal">
            <img
              src="/landing/mina-product-showcase.jpg"
              alt="Interfața Mina cu dashboardul fotografului, galeria clientului și site-ul de prezentare"
              width="1536"
              height="1024"
              loading="eager"
              decoding="async"
            />
            <figcaption>
              <span>Dashboard organizat</span>
              <span>Galerii pentru clienți</span>
              <span>Site de prezentare</span>
            </figcaption>
          </figure>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="fl-how">
          <div className="fl-how-header fl-reveal">
            <p className="fl-eyebrow">Cum funcționează</p>
            <h2 className="fl-section-title">
              De la fotografii la selecția clientului,<br />
              <em>în trei pași simpli.</em>
            </h2>
          </div>
          <div className="fl-how-grid">
            <article className="fl-how-card fl-reveal">
              <span className="fl-how-number">01</span>
              <h3>Încarci și organizezi</h3>
              <p>Creezi galeria și grupezi fotografiile așa cum vrei să le vadă clientul.</p>
            </article>
            <article className="fl-how-card fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <span className="fl-how-number">02</span>
              <h3>Trimiți un singur link</h3>
              <p>Clientul primește o galerie elegantă, pe care o poți proteja cu parolă.</p>
            </article>
            <article className="fl-how-card fl-reveal" style={{ transitionDelay: '0.2s' }}>
              <span className="fl-how-number">03</span>
              <h3>Primești selecțiile</h3>
              <p>Favoritele ajung direct în Mina, fără liste, capturi de ecran sau mesaje pierdute.</p>
            </article>
          </div>
        </section>

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
              <span className="fl-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg>
              </span>
              <h3 className="fl-feature-title">Galerii pentru clienți</h3>
              <p className="fl-feature-desc">
                Creezi galeria, trimiți linkul, clientul vede și alege favoritele. Experiență clară, fără confuzie.
              </p>
            </div>
            <div className="fl-feature-card fl-reveal" style={{ transitionDelay: '0.1s' }}>
              <span className="fl-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.26 8.7 4.5 4.5 0 0 0 7 18Z"/></svg>
              </span>
              <h3 className="fl-feature-title">Stocare sigură și rapidă</h3>
              <p className="fl-feature-desc">
                Fotografiile tale sunt păstrate în siguranță și disponibile oricând ai nevoie de ele.
              </p>
            </div>
            <div className="fl-feature-card fl-reveal" style={{ transitionDelay: '0.2s' }}>
              <span className="fl-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/></svg>
              </span>
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

            {founderOfferActive && (
              <div className="fl-founder-offer">
                <strong>Preț Fondator, disponibil până la {FOUNDER_OFFER.endsAtLabel}</strong>
                <span>Îl păstrezi cât timp abonamentul rămâne activ.</span>
              </div>
            )}

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
                <span className="fl-billing-save">≈ 2 luni incluse</span>
              </button>
            </div>
            <p className="fl-pricing-includes">
              Toate planurile plătite includ galerii nelimitate, parole, selecții favorite și site de prezentare.
            </p>
          </div>

          <div className="fl-pricing-grid fl-pricing-grid-primary">
            {PRIMARY_PRICING_PLANS.map((plan, i) => {
              const price = getPlanPrice(plan, billingCycle)
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
                    <span className={`fl-plan-founder-label${plan.key === 'free' ? ' fl-plan-placeholder' : ''}`}>
                      {price.founderActive ? 'Preț Fondator' : 'Preț standard'}
                    </span>
                    <span className="fl-plan-price-amount">
                      {price.display}
                      {plan.key !== 'free' && billingCycle === 'monthly' && <span>/lună</span>}
                      {plan.key !== 'free' && billingCycle === 'yearly' && <span>/an</span>}
                    </span>
                    <div className="fl-plan-price-meta">
                      <p className={`fl-plan-price-equiv${billingCycle === 'yearly' && price.equiv ? '' : ' fl-plan-placeholder'}`}>
                        {billingCycle === 'yearly' && price.equiv ? price.equiv : 'Preț lunar echivalent'}
                      </p>
                      <p className={`fl-plan-price-standard${price.standardDisplay ? '' : ' fl-plan-placeholder'}`}>
                        {price.standardDisplay
                          ? `Preț standard: ${price.standardDisplay}/${billingCycle === 'yearly' ? 'an' : 'lună'}`
                          : 'Preț standard'}
                      </p>
                    </div>
                  </div>
                  <p className="fl-plan-summary">
                    {plan.key === 'free'
                      ? '3 galerii active · parole · selecții'
                      : 'Galerii nelimitate · site inclus'}
                  </p>
                  <p className="fl-plan-desc">{plan.desc}</p>
                  <button
                    className={`fl-btn-plan ${plan.featured ? 'fl-btn-plan-gold' : 'fl-btn-plan-ghost'}`}
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
          <div className="fl-volume-plans fl-reveal">
            <div className="fl-volume-heading">
              <div>
                <p className="fl-volume-eyebrow">Pentru volum mare</p>
                <h3>Mai mult spațiu, aceleași funcții.</h3>
              </div>
              <p>Planurile Pro și Studio includ galerii nelimitate, selecții și site de prezentare.</p>
            </div>
            <div className="fl-volume-grid">
              {VOLUME_PRICING_PLANS.map((plan) => {
                const price = getPlanPrice(plan, billingCycle)
                return (
                  <article className="fl-volume-plan" key={plan.key}>
                    <div>
                      <span className="fl-volume-name">{plan.name}</span>
                      <strong>{plan.storage}</strong>
                    </div>
                    <div className="fl-volume-price">
                      <strong>{price.display}</strong>
                      <span>/{billingCycle === 'yearly' ? 'an' : 'lună'}</span>
                      {billingCycle === 'yearly' && price.equiv && <small>{price.equiv}</small>}
                    </div>
                    <button
                      className="fl-btn-volume"
                      onClick={() => navigate(`/register?plan=${plan.key}&cycle=${billingCycle}`)}
                    >
                      Alege {plan.name}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
          {founderOfferActive && (
            <p className="fl-founder-terms">
              Oferta se aplică abonamentelor plătite activate până la {FOUNDER_OFFER.endsAtLabel}, inclusiv. Dacă abonamentul este anulat sau expiră, oferta se pierde. Prețul final este afișat înainte de plată. <Link to="/termeni">Detalii în Termeni</Link>.
            </p>
          )}
        </section>

        {/* ── FAQ ── */}
        <section className="fl-faq">
          <div className="fl-faq-header fl-reveal">
            <p className="fl-eyebrow">Întrebări frecvente</p>
            <h2 className="fl-section-title">Ce merită să știi <em>înainte să începi.</em></h2>
          </div>
          <div className="fl-faq-list fl-reveal">
            <details>
              <summary>Pot încerca Mina fără card?</summary>
              <p>Da. Planul Free include 5 GB de stocare, trei galerii active, parole și selecții favorite.</p>
            </details>
            <details>
              <summary>Cum funcționează selecțiile clienților?</summary>
              <p>Clientul marchează fotografiile favorite direct în galerie, iar selecția apare în contul tău Mina.</p>
            </details>
            <details>
              <summary>Pot proteja o galerie cu parolă?</summary>
              <p>Da. Poți activa parola separat pentru fiecare galerie pe care o trimiți.</p>
            </details>
            <details>
              <summary>Planurile plătite limitează numărul de galerii?</summary>
              <p>Nu. Toate planurile plătite includ galerii nelimitate; alegi planul în funcție de spațiul de stocare.</p>
            </details>
            <details>
              <summary>Pot publica și un site de prezentare?</summary>
              <p>Da. Site-ul de prezentare este inclus în toate planurile plătite, începând cu Esențial.</p>
            </details>
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
              <input
                type="text"
                name="website"
                value={contactForm.websiteConfirm}
                onChange={(e) => setContactForm((prev) => ({ ...prev, websiteConfirm: e.target.value }))}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
              />
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
              <span>·</span>
              <button type="button" className="fl-footer-cookie-btn" onClick={openCookieSettings}>Cookie-uri</button>
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
