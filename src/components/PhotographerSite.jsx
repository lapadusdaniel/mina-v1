import { useState, useEffect, useCallback, useRef } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Masonry from 'react-masonry-css'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import './PhotographerSite.css'

const { sites: sitesService, media: mediaService } = getAppServices()

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '#'
  const value = url.trim()
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

const normalizeSocialUrl = (url, network) => {
  if (!url || typeof url !== 'string') return '#'
  const value = url.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (network === 'instagram') {
    const handle = value
      .replace(/^@/, '')
      .replace(/^(www\.)?instagram\.com\//i, '')
      .replace(/\/$/, '')
    return `https://instagram.com/${handle}`
  }
  return normalizeUrl(value)
}

const instagramLabel = (value) => {
  if (!value) return ''
  const handle = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
  return handle ? `@${handle}` : ''
}

const whatsappNumber = (value) => {
  if (!value) return ''
  const raw = String(value).trim()
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `40${digits.slice(1)}`
  return digits
}

function ContactForm({ photographerUid }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', websiteConfirm: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name || !form.email) return
    setSending(true)
    setSubmitError('')
    try {
      await sitesService.submitContactMessage({ ...form, photographerUid })
      setSent(true)
      setForm({ name: '', email: '', phone: '', message: '', websiteConfirm: '' })
    } catch (error) {
      console.error(error)
      setSubmitError('Mesajul nu a putut fi trimis. Încearcă din nou sau folosește datele de contact.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return <div className="ps-form-success">Mesaj trimis. Te voi contacta în curând.</div>
  }

  return (
    <form className="ps-contact-form" onSubmit={handleSubmit}>
      <input
        className="ps-contact-honeypot"
        type="text"
        name="website"
        value={form.websiteConfirm}
        onChange={set('websiteConfirm')}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div className="ps-form-row">
        <div className="ps-form-field">
          <label className="ps-form-label" htmlFor="ps-contact-name">Nume</label>
          <input
            id="ps-contact-name"
            className="ps-form-input"
            type="text"
            placeholder="Prenume Nume"
            value={form.name}
            onChange={set('name')}
            required
          />
        </div>
        <div className="ps-form-field">
          <label className="ps-form-label" htmlFor="ps-contact-email">Email</label>
          <input
            id="ps-contact-email"
            className="ps-form-input"
            type="email"
            placeholder="email@exemplu.ro"
            value={form.email}
            onChange={set('email')}
            required
          />
        </div>
      </div>
      <div className="ps-form-field">
        <label className="ps-form-label" htmlFor="ps-contact-phone">Telefon</label>
        <input
          id="ps-contact-phone"
          className="ps-form-input"
          type="tel"
          placeholder="+40 712 345 678"
          value={form.phone}
          onChange={set('phone')}
        />
      </div>
      <div className="ps-form-field">
        <label className="ps-form-label" htmlFor="ps-contact-message">Mesaj</label>
        <textarea
          id="ps-contact-message"
          className="ps-form-textarea"
          rows={5}
          placeholder="Spune-mi despre evenimentul tău — dată, locație, detalii..."
          value={form.message}
          onChange={set('message')}
        />
      </div>
      <button type="submit" className="ps-form-submit" disabled={sending}>
        {sending ? 'Se trimite...' : 'Trimite mesaj'}
      </button>
      {submitError && <p className="ps-form-error" role="alert">{submitError}</p>}
    </form>
  )
}

export default function PhotographerSite({ previewData = null }) {
  const [siteData, setSiteData] = useState(previewData)
  const [profile, setProfile] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [coverUrl, setCoverUrl] = useState(null)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null)
  const [projectCovers, setProjectCovers] = useState({})
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryPhotos, setCategoryPhotos] = useState({})
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [loading, setLoading] = useState(!previewData)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState({ open: false, index: 0, slides: [] })
  const loadingCategoryIds = useRef(new Set())

  const slug = previewData ? null : window.location.pathname.replace(/^\//, '').split('/')[0]

  const scrollToSection = useCallback((sectionId) => {
    setMobileNavOpen(false)
    const target = document.getElementById(sectionId)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (previewData) {
      setSiteData(previewData)
      setLoading(false)
      return
    }
    if (!slug) {
      setError('Pagină negăsită.')
      setLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const data = await sitesService.getSiteBySlug(slug)
        if (!data) {
          if (!cancelled) setError('Pagina nu a fost găsită.')
          return
        }
        if (cancelled) return
        setSiteData(data)
        const profileData = await sitesService.getProfile(data.uid)
        if (profileData) {
          setProfile(profileData)
        } else {
          const legacy = await sitesService.getLegacySettings(data.uid)
          if (legacy && !cancelled) {
            setProfile({
              brandName: legacy.numeBrand || '',
              instagramUrl: legacy.instagram || '',
              websiteUrl: legacy.website || '',
            })
          }
        }
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) setError('Eroare la încărcare.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug, previewData])

  useEffect(() => {
    if (!siteData) return
    let cancelled = false

    const resolveAsset = async (path) => {
      if (!path) return null
      try {
        return await mediaService.getBrandingAsset(path)
      } catch {
        try {
          return await mediaService.getPhotoUrl(path, 'original')
        } catch {
          return null
        }
      }
    }

    if (siteData.logoPath) resolveAsset(siteData.logoPath).then((url) => !cancelled && setLogoUrl(url))

    const fallbackPhoto = (siteData.portfolio || [])
      .flatMap((category) => category.photos || [])
      .find((photo) => photo?.key)
    const coverPath = siteData.coverPhotoPath || siteData.heroImagePath || fallbackPhoto?.key
    resolveAsset(coverPath).then((url) => !cancelled && setCoverUrl(url))

    const profilePath = siteData.profilePhotoPath || siteData.aboutImagePath
    resolveAsset(profilePath).then((url) => !cancelled && setProfilePhotoUrl(url))

    const loadProjectCovers = async () => {
      const entries = await Promise.all(
        (siteData.portfolio || []).map(async (category, index) => {
          const firstPhoto = (category.photos || []).find((photo) => photo?.key)
          if (!firstPhoto) return null
          const url = await resolveAsset(firstPhoto.key)
          return url ? [category.id || `category-${index}`, url] : null
        })
      )
      if (!cancelled) setProjectCovers(Object.fromEntries(entries.filter(Boolean)))
    }
    loadProjectCovers()

    return () => { cancelled = true }
  }, [siteData])

  useEffect(() => {
    if (previewData || !siteData) return
    const metadataBrand = siteData.siteName || siteData.brandName || profile?.brandName || 'Fotograf'
    const metadataDescription = (
      siteData.tagline || siteData.heroBio || `Portofoliul foto și datele de contact pentru ${metadataBrand}.`
    ).trim()
    const previousTitle = document.title
    let descriptionMeta = document.querySelector('meta[name="description"]')
    const createdDescriptionMeta = !descriptionMeta
    const previousDescription = descriptionMeta?.getAttribute('content') || ''

    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta')
      descriptionMeta.setAttribute('name', 'description')
      document.head.appendChild(descriptionMeta)
    }
    document.title = `${metadataBrand} — Fotograf`
    descriptionMeta.setAttribute('content', metadataDescription.slice(0, 160))

    return () => {
      document.title = previousTitle
      if (createdDescriptionMeta) descriptionMeta.remove()
      else descriptionMeta.setAttribute('content', previousDescription)
    }
  }, [siteData, profile, previewData])

  const loadCategoryPhotos = useCallback(async (categoryId) => {
    if (!siteData || categoryPhotos[categoryId] !== undefined || loadingCategoryIds.current.has(categoryId)) return
    const category = (siteData.portfolio || []).find((item, index) => (item.id || `category-${index}`) === categoryId)
    if (!category?.photos?.length) {
      setCategoryPhotos((current) => ({ ...current, [categoryId]: [] }))
      return
    }

    loadingCategoryIds.current.add(categoryId)
    setLoadingPhotos(true)
    setCategoryPhotos((current) => ({ ...current, [categoryId]: [] }))
    const photos = category.photos.filter((photo) => photo?.key)
    const resolved = []

    try {
      for (let start = 0; start < photos.length; start += 6) {
        const batch = await Promise.all(
          photos.slice(start, start + 6).map(async (photo) => {
            try {
              return { url: await mediaService.getBrandingAsset(photo.key), key: photo.key }
            } catch {
              return null
            }
          })
        )
        resolved.push(...batch.filter(Boolean))
        setCategoryPhotos((current) => ({ ...current, [categoryId]: [...resolved] }))
      }
    } finally {
      loadingCategoryIds.current.delete(categoryId)
      setLoadingPhotos(false)
    }
  }, [siteData, categoryPhotos])

  useEffect(() => {
    if (!siteData || selectedCategory) return
    const firstCategoryIndex = (siteData.portfolio || []).findIndex((category) => category.photos?.some((photo) => photo?.key))
    if (firstCategoryIndex >= 0) {
      const category = siteData.portfolio[firstCategoryIndex]
      setSelectedCategory(category.id || `category-${firstCategoryIndex}`)
    }
  }, [siteData, selectedCategory])

  useEffect(() => {
    if (selectedCategory) loadCategoryPhotos(selectedCategory)
  }, [selectedCategory, loadCategoryPhotos])

  if (loading) {
    return (
      <div className="ps-loading">
        <span className="ps-loading-logo">MINA</span>
        <span className="ps-loading-text">Se încarcă...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ps-error">
        <span className="ps-loading-logo">MINA</span>
        <p className="ps-error-title">{error}</p>
        <p className="ps-error-sub">Verifică adresa și încearcă din nou.</p>
      </div>
    )
  }

  if (!siteData) return null

  const brandName = siteData.siteName || siteData.brandName || profile?.brandName || 'Fotograf'
  const tagline = siteData.tagline || siteData.heroBio || ''
  const heroTitle = siteData.heroTitle || brandName
  const heroLabel = siteData.heroEyebrow || 'Fotografie cu sens'
  const bio = siteData.bio || siteData.aboutBio || ''
  const portfolio = (siteData.portfolio || [])
    .map((category, index) => ({ ...category, resolvedId: category.id || `category-${index}` }))
    .filter((category) => category.photos?.some((photo) => photo?.key))
  const pricing = (siteData.pricing || []).filter((eventType) => eventType.packages?.length > 0)
  const socialLinks = siteData.socialLinks || {}
  const instagram = socialLinks.instagram || siteData.instagram || profile?.instagramUrl || ''
  const facebook = socialLinks.facebook || ''
  const website = socialLinks.website || siteData.websiteUrl || profile?.websiteUrl || ''
  const contactEmail = siteData.contactEmail || ''
  const contactPhone = siteData.contactPhone || profile?.whatsappNumber || ''
  const currentCategory = portfolio.find((category) => category.resolvedId === selectedCategory)
  const currentCategoryPhotos = selectedCategory ? (categoryPhotos[selectedCategory] || []) : []
  const hasPortfolio = portfolio.length > 0 && siteData.showPortfolio !== false
  const hasPricing = pricing.length > 0 && siteData.showPricing !== false
  const hasAbout = siteData.showAbout !== false && Boolean(
    bio || siteData.profilePhotoPath || siteData.aboutImagePath ||
    siteData.yearsExp || siteData.sessionsCount || siteData.citiesCount
  )
  const themeStyle = {
    '--ps-accent': siteData.accentColor || '#9b765c',
  }

  const openProject = (categoryId) => {
    setSelectedCategory(categoryId)
    window.requestAnimationFrame(() => scrollToSection('portfolio-gallery'))
  }

  return (
    <div className="ps-root ps-root--editorial" style={themeStyle}>
      <nav className="ps-nav" aria-label="Navigare principală">
        <button className="ps-nav-identity" onClick={() => scrollToSection('home')} aria-label="Acasă">
          {logoUrl
            ? <img src={logoUrl} alt={brandName} className="ps-nav-logo" />
            : <span className="ps-nav-brand">{brandName}</span>
          }
        </button>
        <button
          className={`ps-menu-toggle${mobileNavOpen ? ' is-open' : ''}`}
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label={mobileNavOpen ? 'Închide meniul' : 'Deschide meniul'}
          aria-expanded={mobileNavOpen}
        >
          <span />
          <span />
        </button>
        <div className={`ps-nav-links${mobileNavOpen ? ' is-open' : ''}`}>
          {hasPortfolio && <button onClick={() => scrollToSection('work')}>Portofoliu</button>}
          {hasAbout && <button onClick={() => scrollToSection('about')}>Despre</button>}
          {hasPricing && <button onClick={() => scrollToSection('collections')}>Colecții</button>}
          <button className="ps-nav-contact" onClick={() => scrollToSection('contact')}>Contact</button>
        </div>
      </nav>

      <main>
        <section id="home" className={`ps-hero${coverUrl ? '' : ' ps-hero--empty'}`}>
          {coverUrl && <img src={coverUrl} alt="" className="ps-hero-img" />}
          <div className="ps-hero-overlay" />
          <div className="ps-hero-content">
            <span className="ps-kicker ps-kicker--light">{heroLabel}</span>
            <h1 className="ps-hero-title">{heroTitle}</h1>
            {tagline && <p className="ps-hero-tagline">{tagline}</p>}
            <div className="ps-hero-actions">
              {hasPortfolio && <button onClick={() => scrollToSection('work')}>Descoperă poveștile</button>}
              <button className="ps-text-button ps-text-button--light" onClick={() => scrollToSection('contact')}>Verifică disponibilitatea</button>
            </div>
          </div>
          <button className="ps-scroll-cue" onClick={() => scrollToSection(hasPortfolio ? 'work' : 'contact')} aria-label="Continuă">
            <span>Scroll</span>
            <i />
          </button>
        </section>

        {hasPortfolio && (
          <section id="work" className="ps-section ps-work-section">
            <header className="ps-section-heading ps-section-heading--split">
              <div>
                <span className="ps-kicker">Portofoliu selectat</span>
                <h2>Povești care rămân.</h2>
              </div>
              <p>{siteData.portfolioIntro || tagline || 'Momente autentice, observate discret și păstrate cu grijă.'}</p>
            </header>

            <div className={`ps-project-grid ps-project-grid--${Math.min(portfolio.length, 4)}`}>
              {portfolio.map((category, index) => (
                <button
                  key={category.resolvedId}
                  className="ps-project-card"
                  onClick={() => openProject(category.resolvedId)}
                >
                  <span className="ps-project-media">
                    {projectCovers[category.resolvedId]
                      ? <img src={projectCovers[category.resolvedId]} alt="" loading="lazy" />
                      : <span className="ps-project-placeholder" />
                    }
                    <span className="ps-project-shade" />
                  </span>
                  <span className="ps-project-meta">
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <strong>{category.name}</strong>
                    <em>Vezi povestea</em>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {hasPortfolio && (
          <section id="portfolio-gallery" className="ps-section ps-gallery-section">
            <div className="ps-gallery-heading">
              <div>
                <span className="ps-kicker">Galerie</span>
                <h2>{currentCategory?.name || portfolio[0]?.name}</h2>
              </div>
              <div className="ps-category-switcher" aria-label="Alege proiectul">
                {portfolio.map((category) => (
                  <button
                    key={category.resolvedId}
                    className={selectedCategory === category.resolvedId ? 'is-active' : ''}
                    onClick={() => setSelectedCategory(category.resolvedId)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {loadingPhotos && currentCategoryPhotos.length === 0 ? (
              <div className="ps-photos-loading">Se pregătește povestea...</div>
            ) : currentCategoryPhotos.length === 0 ? (
              <div className="ps-empty-state">Nicio fotografie în această categorie.</div>
            ) : (
              <div className="ps-masonry-wrap">
                <Masonry
                  breakpointCols={{ default: 3, 1024: 3, 760: 2, 480: 1 }}
                  className="ps-masonry-grid"
                  columnClassName="ps-masonry-col"
                >
                  {currentCategoryPhotos.map((photo, index) => (
                    <button
                      key={photo.key}
                      className="ps-masonry-item"
                      onClick={() => setLightbox({
                        open: true,
                        index,
                        slides: currentCategoryPhotos.map((item) => ({ src: item.url })),
                      })}
                    >
                      <img
                        src={photo.url}
                        alt={`${currentCategory?.name || 'Portofoliu'} — fotografia ${index + 1}`}
                        loading="lazy"
                        className="ps-masonry-img"
                      />
                    </button>
                  ))}
                </Masonry>
                {loadingPhotos && <div className="ps-photos-loading ps-photos-loading--more">Se încarcă mai multe fotografii...</div>}
              </div>
            )}
          </section>
        )}

        {hasAbout && (
          <section id="about" className="ps-about-section">
            <div className="ps-about-media">
              {profilePhotoUrl
                ? <img src={profilePhotoUrl} alt={siteData.aboutTitle || brandName} loading="lazy" />
                : projectCovers[portfolio[0]?.resolvedId]
                  ? <img src={projectCovers[portfolio[0]?.resolvedId]} alt="" loading="lazy" />
                  : <span className="ps-about-placeholder" />
              }
            </div>
            <div className="ps-about-copy">
              <span className="ps-kicker">În spatele camerei</span>
              <h2>{siteData.aboutTitle || brandName}</h2>
              {bio && <p>{bio}</p>}
              {(siteData.yearsExp || siteData.sessionsCount || siteData.citiesCount) && (
                <div className="ps-stats-row">
                  {siteData.yearsExp && <div><strong>{siteData.yearsExp}</strong><span>ani experiență</span></div>}
                  {siteData.sessionsCount && <div><strong>{siteData.sessionsCount}</strong><span>povești fotografiate</span></div>}
                  {siteData.citiesCount && <div><strong>{siteData.citiesCount}</strong><span>orașe</span></div>}
                </div>
              )}
              <div className="ps-social-row">
                {instagram && <a href={normalizeSocialUrl(instagram, 'instagram')} target="_blank" rel="noreferrer">Instagram</a>}
                {facebook && <a href={normalizeUrl(facebook)} target="_blank" rel="noreferrer">Facebook</a>}
                {website && <a href={normalizeUrl(website)} target="_blank" rel="noreferrer">Website</a>}
              </div>
            </div>
          </section>
        )}

        {hasPricing && (
          <section id="collections" className="ps-section ps-collections-section">
            <header className="ps-section-heading ps-section-heading--center">
              <span className="ps-kicker">Experiența</span>
              <h2>Colecții construite în jurul vostru.</h2>
              <p>{siteData.pricingIntro || 'Alege punctul de pornire. Detaliile finale le stabilim împreună.'}</p>
            </header>
            {pricing.map((eventType) => (
              <div key={eventType.id} className="ps-pricing-group">
                <h3>{eventType.eventType}</h3>
                <div className="ps-pricing-cards">
                  {eventType.packages.map((pkg) => (
                    <article key={pkg.id} className={`ps-pricing-card${pkg.featured ? ' is-featured' : ''}`}>
                      <div className="ps-pricing-card-top">
                        <h4>{pkg.name}</h4>
                        {pkg.featured && <span>Preferată</span>}
                      </div>
                      <div className="ps-pricing-price">{pkg.price}<small> lei</small></div>
                      {pkg.description && <p>{pkg.description}</p>}
                      {pkg.inclusions?.length > 0 && (
                        <ul>{pkg.inclusions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                      )}
                      <button onClick={() => scrollToSection('contact')}>Solicită oferta</button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section id="contact" className="ps-contact-section">
          <div className="ps-contact-intro">
            <span className="ps-kicker ps-kicker--light">Spune-mi povestea voastră</span>
            <h2>{siteData.contactTitle || 'Să creăm ceva memorabil.'}</h2>
            <p>{siteData.contactSub || 'Scrie-mi câteva detalii despre eveniment și revin cu disponibilitatea.'}</p>
            <div className="ps-contact-channels">
              {contactPhone && <a href={`https://wa.me/${whatsappNumber(contactPhone)}`} target="_blank" rel="noreferrer">WhatsApp · {contactPhone}</a>}
              {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
              {instagram && <a href={normalizeSocialUrl(instagram, 'instagram')} target="_blank" rel="noreferrer">Instagram · {instagramLabel(instagram)}</a>}
            </div>
          </div>
          <div className="ps-contact-form-wrap">
            <ContactForm photographerUid={siteData.uid} />
          </div>
        </section>
      </main>

      <footer className="ps-footer">
        <span className="ps-footer-brand">{brandName}</span>
        <span className="ps-footer-copy">© {new Date().getFullYear()} · Toate drepturile rezervate</span>
        <span className="ps-footer-credit">Creat cu <a href="https://cloudbymina.com" target="_blank" rel="noreferrer">Mina</a></span>
      </footer>

      <Lightbox
        open={lightbox.open}
        close={() => setLightbox((current) => ({ ...current, open: false }))}
        index={lightbox.index}
        slides={lightbox.slides}
      />
    </div>
  )
}
