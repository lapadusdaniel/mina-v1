import { useState, useEffect, useRef } from 'react'
import {
  Globe,
  Copy,
  Check,
  Plus,
  Trash2,
  Upload,
  X,
  ExternalLink,
} from 'lucide-react'
import PhotographerSite from './PhotographerSite'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { auth } from '../firebase'

const { sites: sitesService, media: mediaService } = getAppServices()

// ── Helpers ──────────────────────────────────
const generateSlug = (brandName) =>
  (brandName || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || null

const uid = () => Math.random().toString(36).slice(2, 10)

const EDITOR_TABS = ['Acasă', 'Portofoliu', 'Prețuri', 'Despre']

// ── Shared styles ─────────────────────────────
const S = {
  input: {
    width: '100%',
    padding: '10px 13px',
    border: '1px solid #e5e5e7',
    borderRadius: '9px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13.5px',
    fontWeight: 300,
    color: '#1a1a1f',
    background: '#fafafa',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontSize: '10.5px',
    fontWeight: 500,
    color: 'rgba(0,0,0,0.4)',
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },
}

const onFocus = (e) => {
  e.target.style.borderColor = '#1a1a1f'
  e.target.style.boxShadow = '0 0 0 3px rgba(26,26,31,0.06)'
  e.target.style.background = '#fff'
}
const onBlur = (e) => {
  e.target.style.borderColor = '#e5e5e7'
  e.target.style.boxShadow = 'none'
  e.target.style.background = '#fafafa'
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={S.label}>{label}</label>}
      {children}
      {hint && <p style={{ fontSize: '11.5px', color: '#a1a1a6', marginTop: 5 }}>{hint}</p>}
    </div>
  )
}

function FInput({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={S.input}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Field>
  )
}

function FTextarea({ label, value, onChange, placeholder, rows = 4, hint }) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...S.input, resize: 'vertical', minHeight: '80px' }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Field>
  )
}

// ── Photo upload field ────────────────────────
function PhotoField({ label, currentUrl, onUpload, uploading, hint }) {
  const inputRef = useRef()
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {currentUrl && (
          <div style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', background: '#eaeaef' }}>
            <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'transparent',
            border: '1px dashed #d0d0d5', borderRadius: 8,
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12.5px', color: '#888',
            width: 'fit-content',
          }}
        >
          <Upload size={13} />
          {uploading ? 'Se încarcă...' : currentUrl ? 'Schimbă' : 'Încarcă fotografie'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}
        />
      </div>
    </Field>
  )
}

// ── Add button ────────────────────────────────
function AddBtn({ label, onClick, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: small ? '7px 14px' : '9px 16px',
        background: 'transparent',
        border: '1px dashed #d0d0d5',
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: small ? '12px' : '13px',
        color: '#888',
        width: '100%',
        justifyContent: 'center',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1a1a1f'; e.currentTarget.style.color = '#1a1a1f' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d0d5'; e.currentTarget.style.color = '#888' }}
    >
      <Plus size={small ? 12 : 14} /> {label}
    </button>
  )
}

// ── Divider ───────────────────────────────────
const Divider = () => (
  <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '20px 0' }} />
)

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export default function SiteEditor({ user }) {
  const [activeTab, setActiveTab] = useState('Acasă')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState(null)
  const [brandName, setBrandName] = useState('')
  const [showFullPreview, setShowFullPreview] = useState(false)

  // Upload states
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingProfile, setUploadingProfile] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState(null)

  // Preview URLs (local object URLs for immediate display)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null)
  const [profilePreviewUrl, setProfilePreviewUrl] = useState(null)
  const [categoryPhotoUrls, setCategoryPhotoUrls] = useState({})

  const [form, setForm] = useState({
    // Acasă
    heroEyebrow: '',
    heroTitle: '',
    tagline: '',
    coverPhotoPath: '',
    contactEmail: '',
    contactPhone: '',
    contactTitle: '',
    contactSub: '',
    accentColor: '#1a1a1f',
    // Portfolio
    portfolio: [],
    // Pricing
    pricing: [],
    // Despre
    aboutTitle: '',
    bio: '',
    profilePhotoPath: '',
    yearsExp: '',
    sessionsCount: '',
    citiesCount: '',
    socialLinks: { instagram: '', facebook: '', website: '' },
    // Legacy backward compat
    heroBio: '',
    heroImagePath: '',
    aboutBio: '',
    aboutImagePath: '',
    instagram: '',
    websiteUrl: '',
    services: [],
    testimonials: [],
    portfolioGalleryIds: [],
  })

  const set = (key) => (val) => setForm((p) => ({ ...p, [key]: val }))
  const setNested = (outer, inner) => (val) =>
    setForm((p) => ({ ...p, [outer]: { ...(p[outer] || {}), [inner]: val } }))

  // ── Load data ──
  useEffect(() => {
    if (!user?.uid) return
    const load = async () => {
      try {
        const profileData = await sitesService.getProfile(user.uid)
        const bn = profileData?.brandName || ''
        setBrandName(bn)
        setSlug(generateSlug(bn))

        const siteData = await sitesService.getSiteByOwnerUid(user.uid)
        if (siteData) {
          setForm((prev) => ({ ...prev, ...siteData }))

          const coverPath = siteData.coverPhotoPath || siteData.heroImagePath
          if (coverPath) mediaService.getBrandingAsset(coverPath).then(setCoverPreviewUrl).catch(() => {})

          const profilePath = siteData.profilePhotoPath || siteData.aboutImagePath
          if (profilePath) mediaService.getBrandingAsset(profilePath).then(setProfilePreviewUrl).catch(() => {})

          const portfolio = siteData.portfolio || []
          if (portfolio.length > 0) {
            const loadCatPhotos = async () => {
              const result = {}
              for (const cat of portfolio) {
                const photos = []
                for (const photo of (cat.photos || [])) {
                  if (!photo.key) continue
                  try {
                    const url = await mediaService.getBrandingAsset(photo.key)
                    photos.push({ url, key: photo.key })
                  } catch { /* skip */ }
                }
                result[cat.id] = photos
              }
              setCategoryPhotoUrls(result)
            }
            loadCatPhotos()
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.uid])

  // ── Auth token ──
  const getIdToken = async () => {
    const token = await auth?.currentUser?.getIdToken()
    if (!token) throw new Error('Nu ești autentificat.')
    return token
  }

  // ── Cover upload ──
  const handleCoverUpload = async (file) => {
    setUploadingCover(true)
    try {
      const idToken = await getIdToken()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `branding/${user.uid}/cover.${ext}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      setCoverPreviewUrl(URL.createObjectURL(file))
      setForm((p) => ({ ...p, coverPhotoPath: path, heroImagePath: path }))
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea fotografiei de copertă.')
    } finally {
      setUploadingCover(false)
    }
  }

  // ── Profile photo upload ──
  const handleProfileUpload = async (file) => {
    setUploadingProfile(true)
    try {
      const idToken = await getIdToken()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `branding/${user.uid}/profile-photo.${ext}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      setProfilePreviewUrl(URL.createObjectURL(file))
      setForm((p) => ({ ...p, profilePhotoPath: path, aboutImagePath: path }))
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea fotografiei de profil.')
    } finally {
      setUploadingProfile(false)
    }
  }

  // ── Portfolio ──
  const addCategory = () =>
    setForm((p) => ({ ...p, portfolio: [...(p.portfolio || []), { id: uid(), name: 'Categorie nouă', photos: [] }] }))

  const updateCategory = (catId, key, val) =>
    setForm((p) => ({ ...p, portfolio: (p.portfolio || []).map((c) => c.id === catId ? { ...c, [key]: val } : c) }))

  const removeCategory = (catId) => {
    setForm((p) => ({ ...p, portfolio: (p.portfolio || []).filter((c) => c.id !== catId) }))
    setCategoryPhotoUrls((p) => { const n = { ...p }; delete n[catId]; return n })
  }

  const handleCategoryPhotoUpload = async (file, catId) => {
    setUploadingCategory(catId)
    try {
      const idToken = await getIdToken()
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `branding/${user.uid}/portfolio/${catId}/${safeName}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      const previewUrl = URL.createObjectURL(file)
      setForm((p) => ({
        ...p,
        portfolio: (p.portfolio || []).map((c) =>
          c.id === catId ? { ...c, photos: [...(c.photos || []), { key: path }] } : c
        ),
      }))
      setCategoryPhotoUrls((p) => ({ ...p, [catId]: [...(p[catId] || []), { url: previewUrl, key: path }] }))
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea fotografiei.')
    } finally {
      setUploadingCategory(null)
    }
  }

  const removeCategoryPhoto = (catId, photoKey) => {
    setForm((p) => ({
      ...p,
      portfolio: (p.portfolio || []).map((c) =>
        c.id === catId ? { ...c, photos: (c.photos || []).filter((ph) => ph.key !== photoKey) } : c
      ),
    }))
    setCategoryPhotoUrls((p) => ({ ...p, [catId]: (p[catId] || []).filter((ph) => ph.key !== photoKey) }))
  }

  // ── Pricing ──
  const addEventType = () =>
    setForm((p) => ({ ...p, pricing: [...(p.pricing || []), { id: uid(), eventType: 'Tip eveniment', packages: [] }] }))

  const updateEventType = (evId, val) =>
    setForm((p) => ({ ...p, pricing: (p.pricing || []).map((ev) => ev.id === evId ? { ...ev, eventType: val } : ev) }))

  const removeEventType = (evId) =>
    setForm((p) => ({ ...p, pricing: (p.pricing || []).filter((ev) => ev.id !== evId) }))

  const addPackage = (evId) => {
    const pkg = { id: uid(), name: 'Pachet', price: '', description: '', inclusions: [], featured: false }
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId ? { ...ev, packages: [...(ev.packages || []), pkg] } : ev
      ),
    }))
  }

  const updatePackage = (evId, pkgId, key, val) =>
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? { ...ev, packages: (ev.packages || []).map((pkg) => pkg.id === pkgId ? { ...pkg, [key]: val } : pkg) }
          : ev
      ),
    }))

  const removePackage = (evId, pkgId) =>
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId ? { ...ev, packages: (ev.packages || []).filter((pkg) => pkg.id !== pkgId) } : ev
      ),
    }))

  const addInclusion = (evId, pkgId) =>
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId ? { ...pkg, inclusions: [...(pkg.inclusions || []), ''] } : pkg
              ),
            }
          : ev
      ),
    }))

  const updateInclusion = (evId, pkgId, idx, val) =>
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId
                  ? { ...pkg, inclusions: (pkg.inclusions || []).map((inc, i) => i === idx ? val : inc) }
                  : pkg
              ),
            }
          : ev
      ),
    }))

  const removeInclusion = (evId, pkgId, idx) =>
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId ? { ...pkg, inclusions: (pkg.inclusions || []).filter((_, i) => i !== idx) } : pkg
              ),
            }
          : ev
      ),
    }))

  // ── Save ──
  const handleSave = async () => {
    if (!user?.uid) return
    setSaving(true)
    try {
      const sl = generateSlug(brandName)
      await sitesService.saveSiteByOwnerUid(user.uid, {
        ...form,
        uid: user.uid,
        brandName,
        slug: sl,
        heroBio: form.tagline || form.heroBio,
        heroImagePath: form.coverPhotoPath || form.heroImagePath,
        aboutBio: form.bio || form.aboutBio,
        aboutImagePath: form.profilePhotoPath || form.aboutImagePath,
        instagram: form.socialLinks?.instagram || form.instagram,
        websiteUrl: form.socialLinks?.website || form.websiteUrl,
        updatedAt: new Date(),
      })
      setSlug(sl)
    } catch (err) {
      console.error(err)
      alert('Eroare la salvare.')
    } finally {
      setSaving(false)
    }
  }

  const siteUrl = slug ? `${window.location.origin}/${slug}` : null
  const handleCopy = () => {
    if (!siteUrl) return
    navigator.clipboard?.writeText(siteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── previewData (always live) ──
  const previewData = {
    ...form,
    uid: user?.uid,
    brandName,
    slug,
    tagline: form.tagline || form.heroBio,
    bio: form.bio || form.aboutBio,
    socialLinks: form.socialLinks || {},
  }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", color: '#a1a1a6', fontSize: '13px' }}>
        Se încarcă...
      </div>
    )
  }

  // ── Full-screen preview mode (mobile or on demand) ──
  if (showFullPreview) {
    return (
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'sticky', top: 52, zIndex: 200,
          background: '#111',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', gap: 12,
        }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
            {siteUrl || 'Previzualizare site'}
          </span>
          <button
            onClick={() => setShowFullPreview(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', background: '#fff', color: '#1a1a1f',
              border: 'none', borderRadius: '100px', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: '12.5px', fontWeight: 500,
            }}
          >
            ← Editor
          </button>
        </div>
        <PhotographerSite previewData={previewData} />
      </div>
    )
  }

  // ── Two-panel edit mode ──
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── Top Bar ── */}
      <div style={{
        position: 'sticky',
        top: 52,
        zIndex: 100,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 20px',
        gap: 12,
        minHeight: 52,
      }}>
        {/* Site URL */}
        <div style={{ minWidth: 0 }}>
          {siteUrl ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: '12.5px', fontWeight: 400, color: '#86868b',
                textDecoration: 'none', letterSpacing: '0.01em',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {siteUrl} <ExternalLink size={11} />
            </a>
          ) : (
            <span style={{ fontSize: '12px', color: '#c0c0c8' }}>
              Setează un nume de brand în Setări
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
          {siteUrl && (
            <button
              onClick={handleCopy}
              style={btnStyle(copied ? '#2e7d32' : '#444')}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span className="se-btn-label">{copied ? 'Copiat' : 'Copiază'}</span>
            </button>
          )}
          {siteUrl && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...btnStyle('#444'), textDecoration: 'none' }}
            >
              <Globe size={13} />
              <span className="se-btn-label">Deschide</span>
            </a>
          )}
          <button
            onClick={() => setShowFullPreview(true)}
            style={btnStyle('#444')}
          >
            <span>Preview</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...btnStyle('#fff'),
              background: saving ? '#555' : '#1a1a1f',
              borderColor: 'transparent',
            }}
          >
            {saving ? 'Salvez...' : 'Salvează'}
          </button>
        </div>
      </div>

      {/* ── Two Panels ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: 'calc(100vh - 104px)' }}>

        {/* ── LEFT PANEL: Editor ── */}
        <div style={{
          width: 340,
          flexShrink: 0,
          position: 'sticky',
          top: 104,
          height: 'calc(100vh - 104px)',
          overflowY: 'auto',
          borderRight: '1px solid rgba(0,0,0,0.07)',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* Tab nav inside left panel */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            background: '#fff',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            flexShrink: 0,
          }}>
            {EDITOR_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '12px 4px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #1a1a1f' : '2px solid transparent',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '12px',
                  fontWeight: activeTab === tab ? 500 : 400,
                  color: activeTab === tab ? '#1a1a1f' : '#888',
                  cursor: 'pointer',
                  letterSpacing: '0.01em',
                  marginBottom: '-1px',
                  transition: 'color 0.15s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '20px 20px 40px', overflowY: 'auto', flex: 1 }}>

            {/* ── ACASĂ ── */}
            {activeTab === 'Acasă' && (
              <>
                <PhotoField
                  label="Fotografie copertă"
                  currentUrl={coverPreviewUrl}
                  onUpload={handleCoverUpload}
                  uploading={uploadingCover}
                  hint="Imaginea hero de pe pagina principală."
                />
                <Divider />
                <FInput label="Titlu principal" value={form.heroTitle} onChange={set('heroTitle')} placeholder="Fotografii care spun povești" />
                <FInput label="Text mic deasupra titlului" value={form.heroEyebrow} onChange={set('heroEyebrow')} placeholder={brandName} />
                <FTextarea label="Tagline" value={form.tagline} onChange={set('tagline')} placeholder="Surprind momentele care contează." rows={3} />
                <Divider />
                <p style={sectionHeadStyle}>Contact</p>
                <FInput label="Email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@studiofoto.ro" type="email" />
                <FInput label="Telefon / WhatsApp" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+40 712 345 678" />
                <FInput label="Titlu secțiune Contact" value={form.contactTitle} onChange={set('contactTitle')} placeholder="Să vorbim" />
                <FTextarea label="Subtitlu Contact" value={form.contactSub} onChange={set('contactSub')} rows={2} placeholder="Te contactez în maxim 24 de ore." />
              </>
            )}

            {/* ── PORTOFOLIU ── */}
            {activeTab === 'Portofoliu' && (
              <>
                <p style={{ fontSize: '12px', fontWeight: 300, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  Organizează fotografiile în categorii. Fiecare categorie apare ca filtru pe site.
                </p>

                {(form.portfolio || []).map((cat) => (
                  <div key={cat.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                    {/* Category header */}
                    <div style={{ padding: '10px 12px', background: '#fafafa', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => updateCategory(cat.id, 'name', e.target.value)}
                        style={{ ...S.input, flex: 1, background: '#fff', padding: '7px 10px', fontSize: '13px' }}
                        placeholder="Nome categorie"
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: '4px', flexShrink: 0 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Photos grid */}
                    <div style={{ padding: '10px 12px' }}>
                      {(categoryPhotoUrls[cat.id] || []).length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 10 }}>
                          {(categoryPhotoUrls[cat.id] || []).map((photo) => (
                            <div key={photo.key} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: '#eaeaef' }}>
                              <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                type="button"
                                onClick={() => removeCategoryPhoto(cat.id, photo.key)}
                                style={{
                                  position: 'absolute', top: 2, right: 2,
                                  background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                                  width: 18, height: 18, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                }}
                              >
                                <X size={9} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', background: 'transparent',
                        border: '1px dashed #d0d0d5', borderRadius: 7,
                        cursor: uploadingCategory === cat.id ? 'wait' : 'pointer',
                        fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#888',
                      }}>
                        <Upload size={11} />
                        {uploadingCategory === cat.id ? 'Se încarcă...' : 'Adaugă fotografii'}
                        <input
                          type="file" accept="image/*" multiple
                          style={{ display: 'none' }}
                          disabled={uploadingCategory === cat.id}
                          onChange={async (e) => {
                            for (const f of Array.from(e.target.files || [])) {
                              await handleCategoryPhotoUpload(f, cat.id)
                            }
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <AddBtn label="Adaugă categorie" onClick={addCategory} />
              </>
            )}

            {/* ── PREȚURI ── */}
            {activeTab === 'Prețuri' && (
              <>
                <p style={{ fontSize: '12px', fontWeight: 300, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                  Adaugă tipuri de evenimente și pachete de prețuri.
                </p>

                {(form.pricing || []).map((ev) => (
                  <div key={ev.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
                    {/* Event type */}
                    <div style={{ padding: '10px 12px', background: '#fafafa', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={ev.eventType}
                        onChange={(e) => updateEventType(ev.id, e.target.value)}
                        style={{ ...S.input, flex: 1, background: '#fff', padding: '7px 10px', fontSize: '13px', fontWeight: 500 }}
                        placeholder="ex: Nuntă"
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                      <button type="button" onClick={() => removeEventType(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 4, flexShrink: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Packages */}
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(ev.packages || []).map((pkg) => (
                        <div key={pkg.id} style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: '12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Pachet</span>
                            <button type="button" onClick={() => removePackage(ev.id, pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 2 }}>
                              <Trash2 size={12} />
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div>
                              <label style={S.label}>Nume</label>
                              <input value={pkg.name} onChange={(e) => updatePackage(ev.id, pkg.id, 'name', e.target.value)} style={{ ...S.input, padding: '8px 10px' }} placeholder="Esențial" onFocus={onFocus} onBlur={onBlur} />
                            </div>
                            <div>
                              <label style={S.label}>Preț (lei)</label>
                              <input type="number" value={pkg.price} onChange={(e) => updatePackage(ev.id, pkg.id, 'price', e.target.value)} style={{ ...S.input, padding: '8px 10px' }} placeholder="1500" onFocus={onFocus} onBlur={onBlur} />
                            </div>
                          </div>

                          <div>
                            <label style={S.label}>Descriere</label>
                            <textarea
                              value={pkg.description}
                              onChange={(e) => updatePackage(ev.id, pkg.id, 'description', e.target.value)}
                              rows={2}
                              style={{ ...S.input, resize: 'vertical', minHeight: '52px', padding: '7px 10px' }}
                              placeholder="Ce include..."
                              onFocus={onFocus}
                              onBlur={onBlur}
                            />
                          </div>

                          {/* Inclusions */}
                          <div>
                            <label style={{ ...S.label, marginBottom: 7 }}>Include</label>
                            {(pkg.inclusions || []).map((inc, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                                <input
                                  value={inc}
                                  onChange={(e) => updateInclusion(ev.id, pkg.id, idx, e.target.value)}
                                  style={{ ...S.input, flex: 1, padding: '7px 10px', fontSize: '12.5px' }}
                                  placeholder="ex: 8 ore fotografiat"
                                  onFocus={onFocus}
                                  onBlur={onBlur}
                                />
                                <button type="button" onClick={() => removeInclusion(ev.id, pkg.id, idx)} style={{ background: 'none', border: '1px solid #e5e5e7', borderRadius: 7, cursor: 'pointer', color: '#c0392b', padding: '0 8px', flexShrink: 0 }}>
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addInclusion(ev.id, pkg.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', border: '1px dashed #d0d0d5', borderRadius: 7, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '11.5px', color: '#999', marginTop: 2 }}
                            >
                              <Plus size={10} /> Adaugă item
                            </button>
                          </div>

                          {/* Featured toggle */}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 2 }}>
                            <input
                              type="checkbox"
                              checked={!!pkg.featured}
                              onChange={(e) => updatePackage(ev.id, pkg.id, 'featured', e.target.checked)}
                              style={{ accentColor: '#1a1a1f', width: 14, height: 14 }}
                            />
                            <span style={{ fontSize: '12px', fontWeight: 400, color: '#555' }}>Marcat ca „Recomandat"</span>
                          </label>
                        </div>
                      ))}
                      <AddBtn label="Adaugă pachet" onClick={() => addPackage(ev.id)} small />
                    </div>
                  </div>
                ))}

                <AddBtn label="Adaugă tip eveniment" onClick={addEventType} />
              </>
            )}

            {/* ── DESPRE ── */}
            {activeTab === 'Despre' && (
              <>
                <PhotoField
                  label="Fotografie de profil"
                  currentUrl={profilePreviewUrl}
                  onUpload={handleProfileUpload}
                  uploading={uploadingProfile}
                  hint="Afișată în tab-ul Despre. Format pătrat recomandat."
                />
                <Divider />
                <FInput label="Titlu / Nume" value={form.aboutTitle} onChange={set('aboutTitle')} placeholder={brandName} />
                <FTextarea
                  label="Bio"
                  value={form.bio}
                  onChange={set('bio')}
                  placeholder="Prezintă-te clienților tăi..."
                  rows={5}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <FInput label="Ani exp." value={form.yearsExp} onChange={set('yearsExp')} placeholder="5" />
                  <FInput label="Ședințe" value={form.sessionsCount} onChange={set('sessionsCount')} placeholder="200" />
                  <FInput label="Orașe" value={form.citiesCount} onChange={set('citiesCount')} placeholder="12" />
                </div>
                <Divider />
                <p style={sectionHeadStyle}>Social & web</p>
                <FInput label="Instagram" value={form.socialLinks?.instagram} onChange={setNested('socialLinks', 'instagram')} placeholder="https://instagram.com/username" />
                <FInput label="Facebook" value={form.socialLinks?.facebook} onChange={setNested('socialLinks', 'facebook')} placeholder="https://facebook.com/pagina" />
                <FInput label="Website" value={form.socialLinks?.website} onChange={setNested('socialLinks', 'website')} placeholder="https://studiofoto.ro" />
              </>
            )}

          </div>
        </div>

        {/* ── RIGHT PANEL: Live preview ── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          minHeight: 'calc(100vh - 104px)',
          overflowY: 'auto',
          background: '#f7f7f7',
        }}>
          <PhotographerSite previewData={previewData} />
        </div>

      </div>

    </div>
  )
}

// ── Shared button style helper ────────────────
function btnStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '100px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12.5px',
    fontWeight: 400,
    color,
    transition: 'all 0.15s',
    letterSpacing: '0.01em',
    textDecoration: 'none',
  }
}

const sectionHeadStyle = {
  fontSize: '10.5px',
  fontWeight: 500,
  color: 'rgba(0,0,0,0.4)',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  marginBottom: 12,
}
