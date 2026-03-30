import { useState, useEffect, useCallback } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Masonry from 'react-masonry-css'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import './PhotographerSite.css'

const { sites: sitesService, media: mediaService } = getAppServices()

const TABS = ['Acasă', 'Portofoliu', 'Prețuri', 'Despre', 'Contact']

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '#'
  const t = url.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// ── Contact Form ──────────────────────────────
function ContactForm({ photographerUid, accentColor }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    setSending(true)
    try {
      await sitesService.submitContactMessage({ ...form, photographerUid })
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
      <div className="ps-form-success">✓ Mesaj trimis! Te vom contacta în curând.</div>
    )
  }

  return (
    <form className="ps-contact-form" onSubmit={handleSubmit}>
      <div className="ps-form-row">
        <div>
          <label className="ps-form-label">Nume *</label>
          <input
            className="ps-form-input"
            type="text"
            placeholder="Prenume Nume"
            value={form.name}
            onChange={set('name')}
            required
          />
        </div>
        <div>
          <label className="ps-form-label">Email *</label>
          <input
            className="ps-form-input"
            type="email"
            placeholder="email@exemplu.ro"
            value={form.email}
            onChange={set('email')}
            required
          />
        </div>
      </div>
      <div>
        <label className="ps-form-label">Telefon</label>
        <input
          className="ps-form-input"
          type="tel"
          placeholder="+40 712 345 678"
          value={form.phone}
          onChange={set('phone')}
        />
      </div>
      <div>
        <label className="ps-form-label">Mesaj</label>
        <textarea
          className="ps-form-textarea"
          rows={5}
          placeholder="Spune-mi despre evenimentul tău — dată, locație, detalii..."
          value={form.message}
          onChange={set('message')}
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
  const [activeTab, setActiveTab] = useState('Acasă')
  const [siteData, setSiteData] = useState(previewData)
  const [profile, setProfile] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [coverUrl, setCoverUrl] = useState(null)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null)
  const [loading, setLoading] = useState(!previewData)
  const [error, setError] = useState(null)

  // Portfolio state
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryPhotos, setCategoryPhotos] = useState({}) // categoryId → [{url, key}]
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [lightbox, setLightbox] = useState({ open: false, index: 0, slides: [] })

  const slug = previewData
    ? null
    : window.location.pathname.replace(/^\//, '').split('/')[0]

  // ── Load site data ──
  useEffect(() => {
    if (previewData) {
      setSiteData(previewData)
      return () => { document.documentElement.removeAttribute('data-theme') }
    }
    if (!slug) {
      setError('Pagină negăsită.')
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        const data = await sitesService.getSiteBySlug(slug)
        if (!data) {
          setError('Pagina nu a fost găsită.')
          setLoading(false)
          return
        }
        setSiteData(data)

        const profileData = await sitesService.getProfile(data.uid)
        if (profileData) {
          setProfile(profileData)
          if (profileData.theme === 'minimal') {
            document.documentElement.setAttribute('data-theme', 'minimal')
          }
        } else {
          const legacy = await sitesService.getLegacySettings(data.uid)
          if (legacy) {
            setProfile((p) => ({
              ...(p || {}),
              brandName: legacy.numeBrand || '',
              instagramUrl: legacy.instagram || '',
              websiteUrl: legacy.website || '',
            }))
          }
        }
      } catch (err) {
        console.error(err)
        setError('Eroare la încărcare.')
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => { document.documentElement.removeAttribute('data-theme') }
  }, [slug, previewData])

  // ── Load static images ──
  useEffect(() => {
    if (!siteData) return

    if (siteData.logoPath) {
      mediaService.getBrandingAsset(siteData.logoPath).then(setLogoUrl).catch(() => {})
    }

    const coverPath = siteData.coverPhotoPath || siteData.heroImagePath
    if (coverPath) {
      mediaService.getBrandingAsset(coverPath).then(setCoverUrl).catch(() => {
        mediaService.getPhotoUrl(coverPath, 'original').then(setCoverUrl).catch(() => {})
      })
    }

    const profilePath = siteData.profilePhotoPath || siteData.aboutImagePath
    if (profilePath) {
      mediaService.getBrandingAsset(profilePath).then(setProfilePhotoUrl).catch(() => {
        mediaService.getPhotoUrl(profilePath, 'original').then(setProfilePhotoUrl).catch(() => {})
      })
    }
  }, [siteData])

  // ── Init portfolio selected category ──
  useEffect(() => {
    if (activeTab !== 'Portofoliu' || !siteData) return
    const portfolio = siteData.portfolio || []
    if (portfolio.length > 0 && !selectedCategory) {
      setSelectedCategory(portfolio[0].id)
    }
  }, [activeTab, siteData, selectedCategory])

  // ── Load photos for a category ──
  const loadCategoryPhotos = useCallback(
    async (categoryId) => {
      if (!siteData || categoryPhotos[categoryId] !== undefined) return
      const portfolio = siteData.portfolio || []
      const cat = portfolio.find((c) => c.id === categoryId)

      if (!cat?.photos?.length) {
        setCategoryPhotos((p) => ({ ...p, [categoryId]: [] }))
        return
      }

      setLoadingPhotos(true)
      const urls = []
      for (const photo of cat.photos) {
        if (!photo.key) continue
        try {
          const url = await mediaService.getBrandingAsset(photo.key)
          urls.push({ url, key: photo.key })
        } catch {
          /* skip failed photos */
        }
      }
      setCategoryPhotos((p) => ({ ...p, [categoryId]: urls }))
      setLoadingPhotos(false)
    },
    [siteData, categoryPhotos]
  )

  useEffect(() => {
    if (selectedCategory) loadCategoryPhotos(selectedCategory)
  }, [selectedCategory, loadCategoryPhotos])

  if (loading) {
    return (
      <div className="ps-loading">
        <p className="ps-loading-logo">MINA</p>
        <p className="ps-loading-text">Se încarcă...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ps-error">
        <p className="ps-loading-logo">MINA</p>
        <p className="ps-error-title">{error}</p>
        <p className="ps-error-sub">Verifică adresa și încearcă din nou.</p>
      </div>
    )
  }

  if (!siteData) return null

  // ── Derived values (with backward compat) ──
  const brandName = siteData.siteName || siteData.brandName || profile?.brandName || 'Fotograf'
  const tagline = siteData.tagline || siteData.heroBio || ''
  const heroTitle = siteData.heroTitle || brandName
  const bio = siteData.bio || siteData.aboutBio || ''
  const accentColor = siteData.accentColor || profile?.accentColor || '#b8965a'
  const portfolio = siteData.portfolio || []
  const pricing = siteData.pricing || []
  const socialLinks = siteData.socialLinks || {}
  const instagram = socialLinks.instagram || siteData.instagram || profile?.instagramUrl || ''
  const facebook = socialLinks.facebook || ''
  const website = socialLinks.website || siteData.websiteUrl || profile?.websiteUrl || ''
  const contactEmail = siteData.contactEmail || ''
  const contactPhone = siteData.contactPhone || profile?.whatsappNumber || ''

  const currentCategoryPhotos = selectedCategory ? (categoryPhotos[selectedCategory] || []) : []

  return (
    <div className="ps-root">

      {/* ── Nav with tabs ── */}
      <nav className="ps-nav">
        <div className="ps-nav-brand-area">
          {logoUrl
            ? <img src={logoUrl} alt={brandName} className="ps-nav-logo" />
            : <span className="ps-nav-brand">{brandName}</span>
          }
        </div>
        <div className="ps-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`ps-tab${activeTab === tab ? ' ps-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Tab Content ── */}
      <div className="ps-tab-content">

        {/* ── ACASĂ ── */}
        {activeTab === 'Acasă' && (
          <div className="ps-hero">
            <div className="ps-hero-bg">
              {coverUrl && <img src={coverUrl} alt="" className="ps-hero-img" />}
            </div>
            <div className="ps-hero-overlay" />
            <div className="ps-hero-content">
              <span className="ps-hero-eyebrow">{siteData.heroEyebrow || brandName}</span>
              <h1 className="ps-hero-title">{heroTitle}</h1>
              {tagline && <p className="ps-hero-sub">{tagline}</p>}
              <div className="ps-hero-actions">
                <button
                  className="ps-btn-primary"
                  onClick={() => setActiveTab('Portofoliu')}
                >
                  Vezi portofoliu
                </button>
                <button
                  className="ps-btn-secondary"
                  onClick={() => setActiveTab('Contact')}
                >
                  Contact
                </button>
              </div>
            </div>
            <div className="ps-hero-scroll">
              <div className="ps-hero-scroll-line" />
              <span>scroll</span>
            </div>
          </div>
        )}

        {/* ── PORTOFOLIU ── */}
        {activeTab === 'Portofoliu' && (
          <div className="ps-portfolio-tab">
            {portfolio.length === 0 ? (
              <div className="ps-empty-state">
                <p>Portofoliul nu a fost configurat încă.</p>
              </div>
            ) : (
              <>
                <div className="ps-category-filters">
                  {portfolio.map((cat) => (
                    <button
                      key={cat.id}
                      className={`ps-category-btn${selectedCategory === cat.id ? ' ps-category-btn--active' : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {loadingPhotos ? (
                  <div className="ps-photos-loading">Se încarcă fotografiile...</div>
                ) : currentCategoryPhotos.length === 0 ? (
                  <div className="ps-empty-state">
                    <p>Nicio fotografie în această categorie.</p>
                  </div>
                ) : (
                  <Masonry
                    breakpointCols={{ default: 3, 1024: 3, 768: 2, 480: 1 }}
                    className="ps-masonry-grid"
                    columnClassName="ps-masonry-col"
                  >
                    {currentCategoryPhotos.map((photo, i) => (
                      <div
                        key={photo.key}
                        className="ps-masonry-item"
                        onClick={() =>
                          setLightbox({
                            open: true,
                            index: i,
                            slides: currentCategoryPhotos.map((p) => ({ src: p.url })),
                          })
                        }
                      >
                        <img
                          src={photo.url}
                          alt=""
                          loading="lazy"
                          className="ps-masonry-img"
                        />
                      </div>
                    ))}
                  </Masonry>
                )}
              </>
            )}
          </div>
        )}

        {/* ── PREȚURI ── */}
        {activeTab === 'Prețuri' && (
          <div className="ps-pricing-tab">
            {pricing.length === 0 ? (
              <div className="ps-empty-state">
                <p>Pachetele de prețuri nu au fost configurate încă.</p>
              </div>
            ) : (
              pricing.map((eventType) => (
                <div key={eventType.id} className="ps-pricing-section">
                  <h2 className="ps-pricing-event-title">{eventType.eventType}</h2>
                  <div className="ps-pricing-cards">
                    {(eventType.packages || []).map((pkg) => (
                      <div key={pkg.id} className="ps-pricing-card">
                        <h3 className="ps-pricing-card-name">{pkg.name}</h3>
                        <div className="ps-pricing-card-price">
                          {pkg.price}
                          <span className="ps-pricing-card-currency"> lei</span>
                        </div>
                        {pkg.description && (
                          <p className="ps-pricing-card-desc">{pkg.description}</p>
                        )}
                        {pkg.inclusions?.length > 0 && (
                          <ul className="ps-pricing-card-inclusions">
                            {pkg.inclusions.map((item, i) => (
                              <li key={i}>
                                <span
                                  className="ps-pricing-check"
                                  style={{ color: accentColor }}
                                >
                                  ✓
                                </span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          className="ps-pricing-cta"
                          style={{ background: accentColor }}
                          onClick={() => setActiveTab('Contact')}
                        >
                          Rezervă
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── DESPRE ── */}
        {activeTab === 'Despre' && (
          <div className="ps-despre-tab">
            <div className="ps-despre-inner">
              <div className="ps-despre-photo-wrap">
                {profilePhotoUrl
                  ? <img src={profilePhotoUrl} alt={brandName} className="ps-despre-photo" />
                  : <div className="ps-despre-photo-placeholder" />
                }
              </div>
              <div className="ps-despre-text">
                <span className="ps-eyebrow">Despre mine</span>
                <h2 className="ps-section-title">
                  {siteData.aboutTitle || `Salut, sunt ${brandName}`}
                </h2>
                <p className="ps-about-bio">
                  {bio || 'Completează secțiunea "Despre" din editor pentru a te prezenta clienților tăi.'}
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

                {(instagram || facebook || website) && (
                  <div className="ps-social-links">
                    {instagram && (
                      <a
                        href={normalizeUrl(instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ps-social-link"
                      >
                        <span className="ps-social-icon">📸</span> Instagram
                      </a>
                    )}
                    {facebook && (
                      <a
                        href={normalizeUrl(facebook)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ps-social-link"
                      >
                        <span className="ps-social-icon">👥</span> Facebook
                      </a>
                    )}
                    {website && (
                      <a
                        href={normalizeUrl(website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ps-social-link"
                      >
                        <span className="ps-social-icon">🌐</span> Website
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTACT ── */}
        {activeTab === 'Contact' && (
          <div className="ps-contact-tab">
            <div className="ps-contact-inner">
              <div className="ps-contact-info">
                <span className="ps-eyebrow">Hai să vorbim</span>
                <h2 className="ps-section-title">
                  {siteData.contactTitle || 'Rezervă acum'}
                </h2>
                <p className="ps-contact-sub">
                  {siteData.contactSub || 'Completează formularul și te contactez în maxim 24 de ore.'}
                </p>

                <div className="ps-contact-channels">
                  {contactPhone && (
                    <a
                      href={`https://wa.me/${contactPhone.replace(/\D/g, '')}`}
                      className="ps-contact-channel"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="ps-contact-channel-icon" style={{ background: '#25D366' }}>💬</div>
                      <div>
                        <span className="ps-contact-channel-label">WhatsApp</span>
                        <span className="ps-contact-channel-value">{contactPhone}</span>
                      </div>
                    </a>
                  )}
                  {contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="ps-contact-channel">
                      <div className="ps-contact-channel-icon" style={{ background: accentColor }}>✉️</div>
                      <div>
                        <span className="ps-contact-channel-label">Email</span>
                        <span className="ps-contact-channel-value">{contactEmail}</span>
                      </div>
                    </a>
                  )}
                  {instagram && (
                    <a
                      href={normalizeUrl(instagram)}
                      className="ps-contact-channel"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="ps-contact-channel-icon" style={{ background: '#E1306C' }}>📸</div>
                      <div>
                        <span className="ps-contact-channel-label">Instagram</span>
                        <span className="ps-contact-channel-value">
                          {instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@')}
                        </span>
                      </div>
                    </a>
                  )}
                </div>
              </div>

              <ContactForm photographerUid={siteData.uid} accentColor={accentColor} />
            </div>
          </div>
        )}

      </div>

      {/* ── Footer ── */}
      <footer className="ps-footer">
        <span className="ps-footer-brand">{brandName}</span>
        <div className="ps-footer-links">
          {website && (
            <a href={normalizeUrl(website)} target="_blank" rel="noreferrer">Website</a>
          )}
          {instagram && (
            <a href={normalizeUrl(instagram)} target="_blank" rel="noreferrer">Instagram</a>
          )}
          <button
            className="ps-footer-contact-btn"
            onClick={() => setActiveTab('Contact')}
          >
            Contact
          </button>
        </div>
        <span className="ps-footer-fotolio">
          Creat cu <a href="#" onClick={(e) => e.preventDefault()}>Mina</a>
        </span>
      </footer>

      {/* ── Lightbox ── */}
      <Lightbox
        open={lightbox.open}
        close={() => setLightbox((p) => ({ ...p, open: false }))}
        index={lightbox.index}
        slides={lightbox.slides}
      />
    </div>
  )
}
