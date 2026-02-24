import { useState, useEffect } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import './PhotographerSite.css'

const { sites: sitesService, media: mediaService } = getAppServices()

// ── Helpers ──────────────────────────────────
const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '#'
  const t = url.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// ── Sub-components ────────────────────────────

function Stars({ count = 5 }) {
  return (
    <div className="ps-testimonial-stars">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="ps-testimonial-star">★</span>
      ))}
    </div>
  )
}

function PortfolioSection({ galleries, siteData }) {
  const [images, setImages] = useState([]) // [{url, galleryName, category}]

  useEffect(() => {
    if (!galleries?.length) return
    let cancelled = false
    const load = async () => {
      const result = []
      for (const g of galleries.slice(0, 3)) {
        try {
          const poze = await mediaService.listGalleryPhotos(g.id, g.userId)
          const items = Array.isArray(poze) ? poze : []
          // ia primele 3-4 poze din fiecare galerie
          const slice = items.slice(0, g === galleries[0] ? 4 : 2)
          for (const p of slice) {
            const key = p.key || p.Key
            if (!key) continue
            const url = await mediaService.getPhotoUrl(key, 'thumb')
            result.push({ url, galleryName: g.nume, category: g.categoria })
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setImages(result)
    }
    load()
    return () => { cancelled = true }
  }, [galleries])

  return (
    <section className="ps-section" id="portfolio">
      <div className="ps-section-inner">
        <span className="ps-eyebrow">Portofoliu</span>
        <h2 className="ps-section-title">
          {siteData?.portfolioTitle || 'Povești în imagini'}
        </h2>
        <p className="ps-section-sub">
          {siteData?.portfolioSub || 'Fiecare fotografie e o amintire care va dura o viață.'}
        </p>

        <div className="ps-portfolio-grid">
          {images.length > 0
            ? images.slice(0, 7).map((img, i) => (
                <div
                  key={i}
                  className={`ps-portfolio-item ${i === 0 ? 'ps-portfolio-item--wide' : ''}`}
                >
                  <img src={img.url} alt={img.galleryName} className="ps-portfolio-img" loading="lazy" />
                  <div className="ps-portfolio-overlay">
                    <p className="ps-portfolio-overlay-title">{img.galleryName}</p>
                    {img.category && <p className="ps-portfolio-overlay-meta">{img.category}</p>}
                  </div>
                </div>
              ))
            : Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`ps-portfolio-item ${i === 0 ? 'ps-portfolio-item--wide' : ''}`}>
                  <div className="ps-portfolio-placeholder" />
                </div>
              ))}
        </div>
      </div>
    </section>
  )
}

function ContactForm({ siteData, accentColor }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    setSending(true)
    try {
      await sitesService.submitContactMessage({
        ...form,
        photographerUid: siteData?.uid,
      })
      setSent(true)
      setForm({ name: '', email: '', phone: '', message: '' })
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="ps-form-success">
        ✓ Mesaj trimis! Te vom contacta în curând.
      </div>
    )
  }

  return (
    <form className="ps-contact-form" onSubmit={handleSubmit}>
      <div className="ps-form-row">
        <div>
          <label className="ps-form-label">Nume</label>
          <input
            type="text"
            className="ps-form-input"
            placeholder="Prenume Nume"
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="ps-form-label">Email</label>
          <input
            type="email"
            className="ps-form-input"
            placeholder="email@exemplu.ro"
            value={form.email}
            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
            required
          />
        </div>
      </div>
      <div>
        <label className="ps-form-label">Telefon (opțional)</label>
        <input
          type="tel"
          className="ps-form-input"
          placeholder="+40 712 345 678"
          value={form.phone}
          onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
        />
      </div>
      <div>
        <label className="ps-form-label">Mesaj</label>
        <textarea
          className="ps-form-textarea"
          rows={5}
          placeholder="Spune-mi despre evenimentul tău — dată, locație, detalii..."
          value={form.message}
          onChange={(e) => setForm(p => ({ ...p, message: e.target.value }))}
        />
      </div>
      <button
        type="submit"
        className="ps-form-submit"
        disabled={sending}
        style={{ background: accentColor || '#1d1d1f' }}
      >
        {sending ? 'Se trimite...' : 'Trimite mesaj'}
      </button>
    </form>
  )
}

// ── Main Component ────────────────────────────
export default function PhotographerSite({ previewData = null }) {
  // previewData: dacă e setat, folosim datele direct (din SiteEditor preview)
  // altfel fetch din Firestore pe baza slug-ului din URL

  const [siteData, setSiteData] = useState(previewData)
  const [profile, setProfile] = useState(null)
  const [galleries, setGalleries] = useState([])
  const [logoUrl, setLogoUrl] = useState(null)
  const [heroImageUrl, setHeroImageUrl] = useState(null)
  const [aboutImageUrl, setAboutImageUrl] = useState(null)
  const [loading, setLoading] = useState(!previewData)
  const [error, setError] = useState(null)

  // Extrage slug din URL dacă nu e preview
  const slug = previewData
    ? null
    : window.location.pathname.replace(/^\//, '').split('/')[0]

  useEffect(() => {
    if (previewData) {
      setSiteData(previewData)
      return
    }
    if (!slug) { setError('Pagină negăsită.'); setLoading(false); return }

    const load = async () => {
      try {
        const data = await sitesService.getSiteBySlug(slug)
        if (!data) {
          setError('Pagina nu a fost găsită.')
          setLoading(false)
          return
        }
        setSiteData(data)

        // Încarcă profilul
        const profileData = await sitesService.getProfile(data.uid)
        if (profileData) setProfile(profileData)
        else {
          const legacy = await sitesService.getLegacySettings(data.uid)
          if (legacy) {
            setProfile((p) => ({
              ...(p || {}),
              brandName: legacy.numeBrand || p?.brandName || 'My Gallery',
              instagramUrl: legacy.instagram || '',
              websiteUrl: legacy.website || '',
            }))
          }
        }

        // Încarcă galeriile selectate
        if (data.portfolioGalleryIds?.length) {
          const gs = await sitesService.getGalleriesByIds(data.portfolioGalleryIds)
          setGalleries(gs)
        }
      } catch (err) {
        console.error(err)
        setError('Eroare la încărcare.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug, previewData])

  // Încarcă imaginile din R2 când siteData e disponibil
  useEffect(() => {
    if (!siteData) return
    if (siteData.logoPath) {
      mediaService.getBrandingAsset(siteData.logoPath).then(setLogoUrl).catch(() => {})
    }
    if (siteData.heroImagePath) {
      mediaService.getPhotoUrl(siteData.heroImagePath, 'original').then(setHeroImageUrl).catch(() => {})
    }
    if (siteData.aboutImagePath) {
      mediaService.getPhotoUrl(siteData.aboutImagePath, 'original').then(setAboutImageUrl).catch(() => {})
    }
  }, [siteData])

  if (loading) {
    return (
      <div className="ps-loading">
        <p className="ps-loading-logo">Mina</p>
        <p className="ps-loading-text">Se încarcă...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ps-error">
        <p className="ps-loading-logo">Mina</p>
        <p className="ps-error-title">{error}</p>
        <p className="ps-error-sub">Verifică adresa și încearcă din nou.</p>
      </div>
    )
  }

  if (!siteData) return null

  const brandName = siteData.brandName || profile?.brandName || 'Fotograf'
  const accentColor = siteData.accentColor || profile?.accentColor || '#1d1d1f'
  const services = siteData.services || []
  const testimonials = siteData.testimonials || []

  const navLinks = [
    { label: 'Portofoliu', href: '#portfolio' },
    { label: 'Despre', href: '#despre' },
    { label: 'Servicii', href: '#servicii' },
    { label: 'Testimoniale', href: '#testimoniale' },
    { label: 'Contact', href: '#contact', cta: true },
  ]

  return (
    <div className="ps-root">

      {/* ── Nav ── */}
      <nav className="ps-nav">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="ps-nav-logo" />
        ) : (
          <a href="#" className="ps-nav-brand">{brandName}</a>
        )}
        <ul className="ps-nav-links">
          {navLinks.map(link => (
            <li key={link.href}>
              <a href={link.href} className={link.cta ? 'ps-nav-cta' : ''}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Hero ── */}
      <section className="ps-hero">
        <div className="ps-hero-bg">
          {heroImageUrl && (
            <img src={heroImageUrl} alt="" className="ps-hero-img" />
          )}
        </div>
        <div className="ps-hero-overlay" />

        <div className="ps-hero-content">
          <span className="ps-hero-eyebrow">{siteData.heroEyebrow || brandName}</span>
          <h1 className="ps-hero-title">
            {siteData.heroTitle || 'Fotografii care\nspun povești'}
          </h1>
          <p className="ps-hero-sub">
            {siteData.heroBio || 'Surprind momentele care contează cu autenticitate și artă.'}
          </p>
          <div className="ps-hero-actions">
            <a href="#contact" className="ps-btn-primary">Rezervă o ședință</a>
            <a href="#portfolio" className="ps-btn-secondary">Vezi portofoliul</a>
          </div>
        </div>

        <div className="ps-hero-scroll">
          <div className="ps-hero-scroll-line" />
          <span>scroll</span>
        </div>
      </section>

      {/* ── Portfolio ── */}
      <PortfolioSection galleries={galleries} siteData={siteData} />

      {/* ── Despre ── */}
      <section className="ps-section ps-section--alt" id="despre">
        <div className="ps-section-inner">
          <div className="ps-about-grid">
            <div className="ps-about-img-wrap">
              {aboutImageUrl ? (
                <img src={aboutImageUrl} alt={brandName} className="ps-about-img" />
              ) : (
                <div className="ps-about-img-placeholder" />
              )}
            </div>
            <div className="ps-about-text">
              <span className="ps-eyebrow">Despre mine</span>
              <h2 className="ps-section-title">
                {siteData.aboutTitle || `Salut, sunt ${brandName}`}
              </h2>
              <p className="ps-about-bio">
                {siteData.aboutBio || 'Completează secțiunea "Despre" din editorul de site pentru a te prezenta clienților tăi.'}
              </p>
              {(siteData.yearsExp || siteData.sessionsCount || siteData.citiesCount) && (
                <div className="ps-about-stats">
                  {siteData.yearsExp && (
                    <div>
                      <span className="ps-about-stat-value">{siteData.yearsExp}+</span>
                      <span className="ps-about-stat-label">Ani experiență</span>
                    </div>
                  )}
                  {siteData.sessionsCount && (
                    <div>
                      <span className="ps-about-stat-value">{siteData.sessionsCount}+</span>
                      <span className="ps-about-stat-label">Ședințe foto</span>
                    </div>
                  )}
                  {siteData.citiesCount && (
                    <div>
                      <span className="ps-about-stat-value">{siteData.citiesCount}</span>
                      <span className="ps-about-stat-label">Orașe</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Servicii ── */}
      {services.length > 0 && (
        <section className="ps-section" id="servicii">
          <div className="ps-section-inner">
            <span className="ps-eyebrow">Ce ofer</span>
            <h2 className="ps-section-title">
              {siteData.servicesTitle || 'Pachete & Servicii'}
            </h2>
            <p className="ps-section-sub">
              {siteData.servicesSub || 'Fiecare pachet e personalizat pentru nevoile tale.'}
            </p>
            <div className="ps-services-grid">
              {services.map((s, i) => (
                <div key={i} className="ps-service-card">
                  {s.icon && <span className="ps-service-icon">{s.icon}</span>}
                  <h3 className="ps-service-name">{s.name}</h3>
                  {s.description && <p className="ps-service-desc">{s.description}</p>}
                  {s.price && (
                    <p className="ps-service-price">
                      {s.price}
                      {s.priceLabel && (
                        <span className="ps-service-price-label">{s.priceLabel}</span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimoniale ── */}
      {testimonials.length > 0 && (
        <section className="ps-section ps-section--dark" id="testimoniale">
          <div className="ps-section-inner">
            <span className="ps-eyebrow">Ce spun clienții</span>
            <h2 className="ps-section-title">
              {siteData.testimonialsTitle || 'Povești adevărate'}
            </h2>
            <p className="ps-section-sub">
              {siteData.testimonialsSub || 'Fiecare cuvânt vine din suflet.'}
            </p>
            <div className="ps-testimonials-grid">
              {testimonials.map((t, i) => (
                <div key={i} className="ps-testimonial-card">
                  <Stars count={t.stars || 5} />
                  <p className="ps-testimonial-text">"{t.text}"</p>
                  <div className="ps-testimonial-author">
                    <div className="ps-testimonial-avatar">
                      {(t.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="ps-testimonial-name">{t.name}</p>
                      {t.event && <p className="ps-testimonial-event">{t.event}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Contact ── */}
      <section className="ps-section" id="contact">
        <div className="ps-section-inner">
          <div className="ps-contact-grid">
            <div className="ps-contact-info">
              <span className="ps-eyebrow">Hai să vorbim</span>
              <h2 className="ps-section-title">
                {siteData.contactTitle || 'Rezervă acum'}
              </h2>
              <p className="ps-section-sub" style={{ marginBottom: 0 }}>
                {siteData.contactSub || 'Completează formularul și te contactez în maxim 24 de ore.'}
              </p>

              <div className="ps-contact-channels">
                {(siteData.contactPhone || profile?.whatsappNumber) && (
                  <a
                    href={`https://wa.me/${(siteData.contactPhone || profile?.whatsappNumber || '').replace(/\D/g, '')}`}
                    className="ps-contact-channel"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ps-contact-channel-icon" style={{ background: '#25D366' }}>💬</div>
                    <div>
                      <span className="ps-contact-channel-label">WhatsApp</span>
                      <span className="ps-contact-channel-value">
                        {siteData.contactPhone || profile?.whatsappNumber}
                      </span>
                    </div>
                  </a>
                )}
                {(siteData.contactEmail || profile?.instagramUrl) && (
                  <a
                    href={`mailto:${siteData.contactEmail || ''}`}
                    className="ps-contact-channel"
                  >
                    <div className="ps-contact-channel-icon" style={{ background: accentColor }}>✉️</div>
                    <div>
                      <span className="ps-contact-channel-label">Email</span>
                      <span className="ps-contact-channel-value">{siteData.contactEmail}</span>
                    </div>
                  </a>
                )}
                {(siteData.instagram || profile?.instagramUrl) && (
                  <a
                    href={normalizeUrl(siteData.instagram || profile?.instagramUrl || '')}
                    className="ps-contact-channel"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ps-contact-channel-icon" style={{ background: '#E1306C' }}>📸</div>
                    <div>
                      <span className="ps-contact-channel-label">Instagram</span>
                      <span className="ps-contact-channel-value">
                        {(siteData.instagram || profile?.instagramUrl || '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '@')}
                      </span>
                    </div>
                  </a>
                )}
              </div>
            </div>

            <ContactForm siteData={{ ...siteData, uid: siteData.uid }} accentColor={accentColor} />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ps-footer">
        <span className="ps-footer-brand">{brandName}</span>
        <div className="ps-footer-links">
          {(siteData.websiteUrl || profile?.websiteUrl) && (
            <a href={normalizeUrl(siteData.websiteUrl || profile?.websiteUrl)} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
          {(siteData.instagram || profile?.instagramUrl) && (
            <a href={normalizeUrl(siteData.instagram || profile?.instagramUrl)} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
          <a href="#contact">Contact</a>
        </div>
        <span className="ps-footer-fotolio">
          Creat cu <a href="#" onClick={(e) => e.preventDefault()}>Mina</a>
        </span>
      </footer>

    </div>
  )
}
