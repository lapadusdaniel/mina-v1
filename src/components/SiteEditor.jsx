import { useState, useEffect, useRef } from 'react'
import {
  Eye,
  Edit3,
  Globe,
  Copy,
  Check,
  Plus,
  Trash2,
  Upload,
  ExternalLink,
  X,
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

// ── Shared input styles ───────────────────────
const S = {
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #e5e5e7',
    borderRadius: '10px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 300,
    color: '#1d1d1f',
    background: '#fafafa',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
}

const focusStyle = (e) => {
  e.target.style.borderColor = '#b8965a'
  e.target.style.boxShadow = '0 0 0 3px rgba(184,150,90,0.1)'
  e.target.style.background = '#fff'
}
const blurStyle = (e) => {
  e.target.style.borderColor = '#e5e5e7'
  e.target.style.boxShadow = 'none'
  e.target.style.background = '#fafafa'
}

function Field({ label, children, hint }) {
  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      {children}
      {hint && (
        <p style={{ fontSize: '12px', color: '#a1a1a6', marginTop: '6px' }}>{hint}</p>
      )}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...S.input }}
        onFocus={focusStyle}
        onBlur={blurStyle}
      />
    </Field>
  )
}

function Textarea({ label, value, onChange, placeholder, rows = 4, hint }) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...S.input, resize: 'vertical', minHeight: '90px' }}
        onFocus={focusStyle}
        onBlur={blurStyle}
      />
    </Field>
  )
}

// ── Photo Upload Button ───────────────────────
function PhotoUpload({ label, currentUrl, onUpload, uploading, hint }) {
  const inputRef = useRef()

  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {currentUrl && (
          <div style={{ position: 'relative', width: 120, height: 120, borderRadius: 12, overflow: 'hidden', background: '#eaeaef' }}>
            <img
              src={currentUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            background: 'transparent',
            border: '1px dashed #d1d1d6',
            borderRadius: '10px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13.5px',
            color: uploading ? '#a1a1a6' : '#86868b',
            width: 'fit-content',
          }}
        >
          <Upload size={14} />
          {uploading ? 'Se încarcă...' : currentUrl ? 'Schimbă fotografia' : 'Încarcă fotografie'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ''
          }}
        />
      </div>
    </Field>
  )
}

// ── Add-item button ───────────────────────────
function AddBtn({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        background: 'transparent',
        border: '1px dashed #d1d1d6',
        borderRadius: '10px',
        cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '13.5px',
        color: '#86868b',
        width: '100%',
        justifyContent: 'center',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#b8965a'; e.currentTarget.style.color = '#b8965a' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d1d6'; e.currentTarget.style.color = '#86868b' }}
    >
      <Plus size={15} /> {label}
    </button>
  )
}

// ── Main SiteEditor ───────────────────────────
export default function SiteEditor({ user }) {
  const [mode, setMode] = useState('edit') // 'edit' | 'preview'
  const [activeTab, setActiveTab] = useState('Acasă')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState(null)
  const [brandName, setBrandName] = useState('')

  // Per-field upload state
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingProfile, setUploadingProfile] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState(null) // categoryId

  // Live preview URLs for uploaded photos
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null)
  const [profilePreviewUrl, setProfilePreviewUrl] = useState(null)
  const [categoryPhotoUrls, setCategoryPhotoUrls] = useState({}) // categoryId -> [{url, key}]

  const [form, setForm] = useState({
    // Hero / Acasă
    heroEyebrow: '',
    heroTitle: '',
    tagline: '',          // replaces heroBio
    coverPhotoPath: '',   // replaces heroImagePath
    contactEmail: '',
    contactPhone: '',
    contactTitle: '',
    contactSub: '',
    accentColor: '#b8965a',
    // Portfolio (new structure)
    portfolio: [],        // [{ id, name, photos: [{ key }] }]
    // Pricing (new structure)
    pricing: [],          // [{ id, eventType, packages: [{ id, name, price, description, inclusions }] }]
    // Despre
    aboutTitle: '',
    bio: '',              // replaces aboutBio
    profilePhotoPath: '', // replaces aboutImagePath
    yearsExp: '',
    sessionsCount: '',
    citiesCount: '',
    socialLinks: { instagram: '', facebook: '', website: '' },
    // Legacy fields kept for backward compat with existing site data
    heroBio: '',
    heroImagePath: '',
    aboutBio: '',
    aboutImagePath: '',
    instagram: '',
    websiteUrl: '',
    // Existing fields that PhotographerSite still uses
    services: [],
    testimonials: [],
    portfolioGalleryIds: [],
  })

  const set = (key) => (val) => setForm((p) => ({ ...p, [key]: val }))
  const setNested = (outerKey, innerKey) => (val) =>
    setForm((p) => ({ ...p, [outerKey]: { ...(p[outerKey] || {}), [innerKey]: val } }))

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

          // Load existing cover preview
          const coverPath = siteData.coverPhotoPath || siteData.heroImagePath
          if (coverPath) {
            mediaService.getBrandingAsset(coverPath).then(setCoverPreviewUrl).catch(() => {})
          }

          // Load existing profile photo preview
          const profilePath = siteData.profilePhotoPath || siteData.aboutImagePath
          if (profilePath) {
            mediaService.getBrandingAsset(profilePath).then(setProfilePreviewUrl).catch(() => {})
          }

          // Load portfolio category photo previews
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

  // ── Upload helper ──
  const getIdToken = async () => {
    const token = await auth?.currentUser?.getIdToken()
    if (!token) throw new Error('Nu ești autentificat.')
    return token
  }

  // ── Upload cover photo ──
  const handleCoverUpload = async (file) => {
    setUploadingCover(true)
    try {
      const idToken = await getIdToken()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `branding/${user.uid}/cover.${ext}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      const previewUrl = URL.createObjectURL(file)
      setCoverPreviewUrl(previewUrl)
      setForm((p) => ({ ...p, coverPhotoPath: path, heroImagePath: path }))
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea fotografiei de copertă.')
    } finally {
      setUploadingCover(false)
    }
  }

  // ── Upload profile photo ──
  const handleProfileUpload = async (file) => {
    setUploadingProfile(true)
    try {
      const idToken = await getIdToken()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `branding/${user.uid}/profile-photo.${ext}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      const previewUrl = URL.createObjectURL(file)
      setProfilePreviewUrl(previewUrl)
      setForm((p) => ({ ...p, profilePhotoPath: path, aboutImagePath: path }))
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea fotografiei de profil.')
    } finally {
      setUploadingProfile(false)
    }
  }

  // ── Portfolio: add category ──
  const addCategory = () => {
    const newCat = { id: uid(), name: 'Categorie nouă', photos: [] }
    setForm((p) => ({ ...p, portfolio: [...(p.portfolio || []), newCat] }))
  }

  const updateCategory = (catId, key, val) => {
    setForm((p) => ({
      ...p,
      portfolio: (p.portfolio || []).map((c) => c.id === catId ? { ...c, [key]: val } : c),
    }))
  }

  const removeCategory = (catId) => {
    setForm((p) => ({ ...p, portfolio: (p.portfolio || []).filter((c) => c.id !== catId) }))
    setCategoryPhotoUrls((p) => {
      const next = { ...p }
      delete next[catId]
      return next
    })
  }

  // ── Portfolio: upload photo to category ──
  const handleCategoryPhotoUpload = async (file, catId) => {
    setUploadingCategory(catId)
    try {
      const idToken = await getIdToken()
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `branding/${user.uid}/portfolio/${catId}/${safeName}`
      await mediaService.uploadFileToPath(file, path, null, idToken)
      const previewUrl = URL.createObjectURL(file)

      // Add to form
      setForm((p) => ({
        ...p,
        portfolio: (p.portfolio || []).map((c) =>
          c.id === catId
            ? { ...c, photos: [...(c.photos || []), { key: path }] }
            : c
        ),
      }))

      // Add preview URL
      setCategoryPhotoUrls((p) => ({
        ...p,
        [catId]: [...(p[catId] || []), { url: previewUrl, key: path }],
      }))
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
        c.id === catId
          ? { ...c, photos: (c.photos || []).filter((ph) => ph.key !== photoKey) }
          : c
      ),
    }))
    setCategoryPhotoUrls((p) => ({
      ...p,
      [catId]: (p[catId] || []).filter((ph) => ph.key !== photoKey),
    }))
  }

  // ── Pricing: event types ──
  const addEventType = () => {
    setForm((p) => ({
      ...p,
      pricing: [...(p.pricing || []), { id: uid(), eventType: 'Tip eveniment', packages: [] }],
    }))
  }

  const updateEventType = (evId, val) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) => ev.id === evId ? { ...ev, eventType: val } : ev),
    }))
  }

  const removeEventType = (evId) => {
    setForm((p) => ({ ...p, pricing: (p.pricing || []).filter((ev) => ev.id !== evId) }))
  }

  // ── Pricing: packages ──
  const addPackage = (evId) => {
    const pkg = { id: uid(), name: 'Pachet', price: '', description: '', inclusions: [] }
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId ? { ...ev, packages: [...(ev.packages || []), pkg] } : ev
      ),
    }))
  }

  const updatePackage = (evId, pkgId, key, val) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId ? { ...pkg, [key]: val } : pkg
              ),
            }
          : ev
      ),
    }))
  }

  const removePackage = (evId, pkgId) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? { ...ev, packages: (ev.packages || []).filter((pkg) => pkg.id !== pkgId) }
          : ev
      ),
    }))
  }

  // Inclusions CRUD
  const addInclusion = (evId, pkgId) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId
                  ? { ...pkg, inclusions: [...(pkg.inclusions || []), ''] }
                  : pkg
              ),
            }
          : ev
      ),
    }))
  }

  const updateInclusion = (evId, pkgId, idx, val) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId
                  ? {
                      ...pkg,
                      inclusions: (pkg.inclusions || []).map((inc, i) => i === idx ? val : inc),
                    }
                  : pkg
              ),
            }
          : ev
      ),
    }))
  }

  const removeInclusion = (evId, pkgId, idx) => {
    setForm((p) => ({
      ...p,
      pricing: (p.pricing || []).map((ev) =>
        ev.id === evId
          ? {
              ...ev,
              packages: (ev.packages || []).map((pkg) =>
                pkg.id === pkgId
                  ? { ...pkg, inclusions: (pkg.inclusions || []).filter((_, i) => i !== idx) }
                  : pkg
              ),
            }
          : ev
      ),
    }))
  }

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
        // Sync legacy fields for backward compat
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

  // ── Copy link ──
  const siteUrl = slug ? `${window.location.origin}/${slug}` : null
  const handleCopy = () => {
    if (!siteUrl) return
    navigator.clipboard?.writeText(siteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", color: '#a1a1a6', fontSize: '14px' }}>
        Se încarcă...
      </div>
    )
  }

  // ── Preview mode ──
  if (mode === 'preview') {
    const previewData = {
      ...form,
      uid: user?.uid,
      brandName,
      slug,
      tagline: form.tagline || form.heroBio,
      bio: form.bio || form.aboutBio,
      socialLinks: form.socialLinks || {},
    }
    return (
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'sticky',
          top: 52,
          zIndex: 200,
          background: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          gap: 16,
        }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
            Previzualizare · {siteUrl || 'Setează brandul în Setări'}
          </span>
          <button
            onClick={() => setMode('edit')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', background: '#fff', color: '#1d1d1f',
              border: 'none', borderRadius: '100px', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: '13px', fontWeight: 500,
            }}
          >
            <Edit3 size={14} /> Înapoi la editor
          </button>
        </div>
        <PhotographerSite previewData={previewData} />
      </div>
    )
  }

  // ── Edit mode ──
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        position: 'sticky',
        top: 52,
        zIndex: 100,
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 40px',
        gap: 16,
      }}>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f', margin: 0 }}>Site-ul meu</p>
          {siteUrl
            ? <p style={{ fontSize: '12px', fontWeight: 300, color: '#86868b', margin: '2px 0 0' }}>{siteUrl}</p>
            : <p style={{ fontSize: '12px', fontWeight: 300, color: '#c0c0c8', margin: '2px 0 0' }}>Setează un nume de brand în Setări</p>
          }
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {siteUrl && (
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
                background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '100px',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                color: copied ? '#2e7d32' : '#3a3a3c',
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiat!' : 'Copiază link'}
            </button>
          )}
          {siteUrl && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
                background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '100px',
                textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#3a3a3c',
              }}
            >
              <Globe size={14} /> Deschide
            </a>
          )}
          <button
            onClick={() => setMode('preview')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '100px',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#3a3a3c',
            }}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 22px', background: saving ? '#3a3a3c' : '#1d1d1f', color: '#fff',
              border: 'none', borderRadius: '100px', cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: '13px', fontWeight: 500,
            }}
          >
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>

      {/* ── Editor Tab Nav ── */}
      <div style={{
        position: 'sticky',
        top: 101,
        zIndex: 99,
        background: '#fff',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '0 40px',
        display: 'flex',
        gap: 0,
      }}>
        {EDITOR_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #1d1d1f' : '2px solid transparent',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13.5px',
              fontWeight: activeTab === tab ? 500 : 400,
              color: activeTab === tab ? '#1d1d1f' : '#86868b',
              cursor: 'pointer',
              transition: 'color 0.15s',
              marginBottom: '-1px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ padding: '32px 40px 80px', maxWidth: '740px' }}>

        {/* ── ACASĂ tab ── */}
        {activeTab === 'Acasă' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <PhotoUpload
              label="Fotografie copertă (Hero)"
              currentUrl={coverPreviewUrl}
              onUpload={handleCoverUpload}
              uploading={uploadingCover}
              hint="Aceasta va fi fotografia de fundal a paginii principale."
            />

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

            <Input label="Text mic deasupra titlului" value={form.heroEyebrow} onChange={set('heroEyebrow')} placeholder={brandName || 'Fotograf de eveniment'} />
            <Input label="Titlu principal" value={form.heroTitle} onChange={set('heroTitle')} placeholder="Fotografii care spun povești" />
            <Textarea label="Tagline / subtitlu" value={form.tagline} onChange={set('tagline')} placeholder="Surprind momentele care contează cu autenticitate și artă." rows={3} />

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

            <p style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Contact</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Email de contact" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@studiofoto.ro" type="email" />
              <Input label="Telefon / WhatsApp" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+40 712 345 678" />
            </div>
            <Input label="Titlu secțiune Contact" value={form.contactTitle} onChange={set('contactTitle')} placeholder="Rezervă acum" />
            <Textarea label="Subtitlu Contact" value={form.contactSub} onChange={set('contactSub')} placeholder="Completează formularul și te contactez în maxim 24 de ore." rows={2} />

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

            <Field label="Culoare accent">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={form.accentColor || '#b8965a'}
                  onChange={(e) => set('accentColor')(e.target.value)}
                  style={{ width: 44, height: 36, border: '1px solid #e5e5e7', borderRadius: 8, cursor: 'pointer', padding: 2 }}
                />
                <input
                  type="text"
                  value={form.accentColor || '#b8965a'}
                  onChange={(e) => set('accentColor')(e.target.value)}
                  style={{ ...S.input, width: 120 }}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
            </Field>
          </div>
        )}

        {/* ── PORTOFOLIU tab ── */}
        {activeTab === 'Portofoliu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: '13px', fontWeight: 300, color: '#6e6e73', margin: 0 }}>
              Organizează fotografiile în categorii. Fiecare categorie va apărea ca un filtru pe site-ul tău public.
            </p>

            {(form.portfolio || []).map((cat) => (
              <div key={cat.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                {/* Category header */}
                <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12, background: '#fafafa' }}>
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, 'name', e.target.value)}
                    style={{ ...S.input, flex: 1, background: '#fff' }}
                    placeholder="Nume categorie (ex: Nunți)"
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeCategory(cat.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 6, flexShrink: 0 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Category photos */}
                <div style={{ padding: '16px 20px' }}>
                  {(categoryPhotoUrls[cat.id] || []).length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {(categoryPhotoUrls[cat.id] || []).map((photo) => (
                        <div key={photo.key} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#eaeaef' }}>
                          <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          <button
                            type="button"
                            onClick={() => removeCategoryPhoto(cat.id, photo.key)}
                            style={{
                              position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)',
                              border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                            }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                    background: 'transparent', border: '1px dashed #d1d1d6', borderRadius: 10,
                    cursor: uploadingCategory === cat.id ? 'wait' : 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#86868b',
                  }}>
                    <Upload size={13} />
                    {uploadingCategory === cat.id ? 'Se încarcă...' : 'Adaugă fotografii'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      disabled={uploadingCategory === cat.id}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || [])
                        for (const file of files) {
                          await handleCategoryPhotoUpload(file, cat.id)
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}

            <AddBtn label="Adaugă categorie" onClick={addCategory} />
          </div>
        )}

        {/* ── PREȚURI tab ── */}
        {activeTab === 'Prețuri' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ fontSize: '13px', fontWeight: 300, color: '#6e6e73', margin: 0 }}>
              Adaugă tipuri de evenimente și pachetele de prețuri asociate.
            </p>

            {(form.pricing || []).map((ev) => (
              <div key={ev.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                {/* Event type header */}
                <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="text"
                    value={ev.eventType}
                    onChange={(e) => updateEventType(ev.id, e.target.value)}
                    style={{ ...S.input, flex: 1, background: '#fff', fontWeight: 500 }}
                    placeholder="Ex: Nuntă"
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeEventType(ev.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 6, flexShrink: 0 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Packages */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(ev.packages || []).map((pkg) => (
                    <div key={pkg.id} style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#a1a1a6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pachet</span>
                        <button type="button" onClick={() => removePackage(ev.id, pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={S.label}>Nume pachet</label>
                          <input value={pkg.name} onChange={(e) => updatePackage(ev.id, pkg.id, 'name', e.target.value)} style={S.input} placeholder="Esential" onFocus={focusStyle} onBlur={blurStyle} />
                        </div>
                        <div>
                          <label style={S.label}>Preț (lei)</label>
                          <input type="number" value={pkg.price} onChange={(e) => updatePackage(ev.id, pkg.id, 'price', e.target.value)} style={S.input} placeholder="1500" onFocus={focusStyle} onBlur={blurStyle} />
                        </div>
                      </div>
                      <div>
                        <label style={S.label}>Descriere</label>
                        <textarea
                          value={pkg.description}
                          onChange={(e) => updatePackage(ev.id, pkg.id, 'description', e.target.value)}
                          rows={2}
                          style={{ ...S.input, resize: 'vertical', minHeight: '60px' }}
                          placeholder="Ce include pachetul..."
                          onFocus={focusStyle}
                          onBlur={blurStyle}
                        />
                      </div>
                      <div>
                        <label style={S.label}>Ce include (câte un item pe linie)</label>
                        {(pkg.inclusions || []).map((inc, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input
                              value={inc}
                              onChange={(e) => updateInclusion(ev.id, pkg.id, idx, e.target.value)}
                              style={{ ...S.input, flex: 1 }}
                              placeholder="Ex: 8 ore de fotografiat"
                              onFocus={focusStyle}
                              onBlur={blurStyle}
                            />
                            <button type="button" onClick={() => removeInclusion(ev.id, pkg.id, idx)} style={{ background: 'none', border: '1px solid #e5e5e7', borderRadius: 8, cursor: 'pointer', color: '#c0392b', padding: '0 10px', flexShrink: 0 }}>
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addInclusion(ev.id, pkg.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                            background: 'transparent', border: '1px dashed #d1d1d6', borderRadius: 8,
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '12.5px', color: '#a1a1a6',
                          }}
                        >
                          <Plus size={12} /> Adaugă item
                        </button>
                      </div>
                    </div>
                  ))}

                  <AddBtn label="Adaugă pachet" onClick={() => addPackage(ev.id)} />
                </div>
              </div>
            ))}

            <AddBtn label="Adaugă tip eveniment" onClick={addEventType} />
          </div>
        )}

        {/* ── DESPRE tab ── */}
        {activeTab === 'Despre' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PhotoUpload
              label="Fotografie de profil"
              currentUrl={profilePreviewUrl}
              onUpload={handleProfileUpload}
              uploading={uploadingProfile}
              hint="Fotografia ta personală afișată în tab-ul 'Despre'."
            />

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

            <Input label="Titlu secțiune" value={form.aboutTitle} onChange={set('aboutTitle')} placeholder={`Salut, sunt ${brandName || 'fotograf'}`} />
            <Textarea
              label="Bio / Descriere"
              value={form.bio}
              onChange={set('bio')}
              placeholder="Prezintă-te clienților tăi — cine ești, ce te pasionează, ce face munca ta specială."
              rows={5}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Input label="Ani experiență" value={form.yearsExp} onChange={set('yearsExp')} placeholder="5" />
              <Input label="Ședințe foto" value={form.sessionsCount} onChange={set('sessionsCount')} placeholder="200" />
              <Input label="Orașe" value={form.citiesCount} onChange={set('citiesCount')} placeholder="12" />
            </div>

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

            <p style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Social & web</p>
            <Input
              label="Instagram"
              value={form.socialLinks?.instagram}
              onChange={setNested('socialLinks', 'instagram')}
              placeholder="https://instagram.com/username"
            />
            <Input
              label="Facebook"
              value={form.socialLinks?.facebook}
              onChange={setNested('socialLinks', 'facebook')}
              placeholder="https://facebook.com/pagina"
            />
            <Input
              label="Website"
              value={form.socialLinks?.website}
              onChange={setNested('socialLinks', 'website')}
              placeholder="https://studiofoto.ro"
            />
          </div>
        )}

      </div>
    </div>
  )
}
