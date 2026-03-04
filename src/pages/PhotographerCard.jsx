import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Globe, Instagram, Mail, MessageCircle } from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const { sites: sitesService, media: mediaService } = getAppServices()

function normalizeWebsite(url) {
  const clean = String(url || '').trim()
  if (!clean) return ''
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
}

function normalizeInstagram(value) {
  const clean = String(value || '').trim()
  if (!clean) return ''
  if (/^https?:\/\//i.test(clean)) return clean
  return `https://instagram.com/${clean.replace(/^@/, '')}`
}

function normalizeWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return `https://wa.me/${digits}`
}

function hasCardContent(card) {
  if (!card) return false
  return [
    card.logoUrl,
    card.numeBrand,
    card.slogan,
    card.whatsapp,
    card.instagram,
    card.email,
    card.website,
  ].some((field) => String(field || '').trim().length > 0)
}

export default function PhotographerCard() {
  const { uid } = useParams()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')
  const [card, setCard] = useState({
    logoUrl: '',
    numeBrand: '',
    slogan: '',
    whatsapp: '',
    instagram: '',
    email: '',
    website: '',
    accentColor: '#1d1d1f',
  })

  useEffect(() => {
    let cancelled = false

    const loadCard = async () => {
      setLoading(true)
      setNotFound(false)
      try {
        if (!uid) {
          if (!cancelled) setNotFound(true)
          return
        }

        const [cardData, profileData] = await Promise.all([
          sitesService.getCardProfile(uid),
          sitesService.getProfile(uid).catch(() => null),
        ])

        if (cancelled) return

        const merged = {
          logoUrl: cardData?.logoUrl ?? profileData?.logoUrl ?? '',
          numeBrand: cardData?.numeBrand ?? profileData?.brandName ?? '',
          slogan: cardData?.slogan ?? '',
          whatsapp: cardData?.whatsapp ?? profileData?.whatsappNumber ?? '',
          instagram: cardData?.instagram ?? profileData?.instagramUrl ?? '',
          email: cardData?.email ?? profileData?.emailContact ?? '',
          website: cardData?.website ?? profileData?.websiteUrl ?? '',
          accentColor: cardData?.accentColor ?? profileData?.accentColor ?? '#1d1d1f',
        }

        if (!hasCardContent(merged)) {
          setNotFound(true)
          return
        }

        setCard(merged)

        if (merged.logoUrl) {
          try {
            const logoUrl = await mediaService.getBrandingAsset(merged.logoUrl)
            if (!cancelled) setLogoPreviewUrl(logoUrl)
          } catch (_) {
            if (!cancelled) setLogoPreviewUrl('')
          }
        }
      } catch (error) {
        console.error('Error loading photographer card:', error)
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCard()
    return () => { cancelled = true }
  }, [uid])

  const contactButtons = useMemo(() => {
    const items = []

    const whatsappUrl = normalizeWhatsapp(card.whatsapp)
    if (whatsappUrl) items.push({ key: 'whatsapp', label: 'WhatsApp', href: whatsappUrl, icon: MessageCircle })

    const instagramUrl = normalizeInstagram(card.instagram)
    if (instagramUrl) items.push({ key: 'instagram', label: 'Instagram', href: instagramUrl, icon: Instagram })

    if (card.email) items.push({ key: 'email', label: 'Email', href: `mailto:${card.email}`, icon: Mail })

    const websiteUrl = normalizeWebsite(card.website)
    if (websiteUrl) items.push({ key: 'website', label: 'Website', href: websiteUrl, icon: Globe })

    return items
  }, [card.email, card.instagram, card.website, card.whatsapp])

  if (loading) {
    return (
      <div style={styles.shell}>
        <div style={styles.loading}>Se încarcă cardul...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={styles.shell}>
        <div style={styles.wrapper}>
          <Link to="/" style={styles.minaLink}>MINA</Link>
          <div style={styles.card}>
            <h1 style={styles.title}>Card indisponibil</h1>
            <p style={styles.subtitle}>Fotograful nu a publicat încă datele de contact.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.shell}>
      <div style={styles.wrapper}>
        <Link to="/" style={styles.minaLink}>MINA</Link>

        <div style={styles.card}>
          {logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt={card.numeBrand || 'Logo'} style={styles.logo} />
          ) : null}

          <h1 style={styles.title}>{card.numeBrand || 'Fotograf'}</h1>
          {card.slogan ? <p style={styles.subtitle}>{card.slogan}</p> : null}

          <div style={styles.actions}>
            {contactButtons.map(({ key, label, href, icon: Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.actionBtn, borderColor: `${card.accentColor}40` }}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  shell: {
    minHeight: '100vh',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    fontFamily: "'DM Sans', sans-serif",
  },
  wrapper: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  minaLink: {
    textAlign: 'center',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '2rem',
    letterSpacing: '0.12em',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontStyle: 'normal',
  },
  card: {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '18px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
  },
  logo: {
    width: '96px',
    height: '96px',
    objectFit: 'contain',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.08)',
    padding: '10px',
    background: '#fff',
  },
  title: {
    margin: 0,
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '1.6rem',
    fontWeight: 400,
    color: '#1d1d1f',
    textAlign: 'center',
  },
  subtitle: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#6e6e73',
    textAlign: 'center',
  },
  actions: {
    marginTop: '6px',
    width: '100%',
    display: 'grid',
    gap: '10px',
  },
  actionBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '999px',
    padding: '11px 14px',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
  },
  loading: {
    fontSize: '14px',
    color: '#6e6e73',
  },
}
