import { useState, useEffect } from 'react'
import { Eye, Edit3, Globe, Copy, Check, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import PhotographerSite from './PhotographerSite'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const { sites: sitesService } = getAppServices()

// ── Helpers ──────────────────────────────────
const generateSlug = (brandName) =>
  (brandName || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || null

const EMPTY_SERVICE = { icon: '📷', name: '', description: '', price: '', priceLabel: 'lei' }
const EMPTY_TESTIMONIAL = { name: '', event: '', text: '', stars: 5 }

// ── Section collapse wrapper ──────────────────
function EditorSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: '16px',
      overflow: 'hidden',
      marginBottom: '12px',
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 22px',
          background: open ? '#fafafa' : '#fff',
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          fontWeight: 500,
          color: '#1d1d1f',
          letterSpacing: '-0.01em',
          transition: 'background 0.15s',
          borderBottom: open ? '1px solid rgba(0,0,0,0.06)' : 'none',
        }}
      >
        {title}
        {open ? <ChevronUp size={16} color="#a1a1a6" /> : <ChevronDown size={16} color="#a1a1a6" />}
      </button>
      {open && (
        <div style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Input helpers ─────────────────────────────
const inputStyle = {
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
}

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '11px',
  fontWeight: 500,
  color: 'rgba(0,0,0,0.45)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '90px' }

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = '#b8965a'; e.target.style.boxShadow = '0 0 0 3px rgba(184,150,90,0.1)'; e.target.style.background = '#fff' }}
        onBlur={e => { e.target.style.borderColor = '#e5e5e7'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafa' }}
      />
    </Field>
  )
}

function Textarea({ label, value, onChange, placeholder, rows = 4 }) {
  return (
    <Field label={label}>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={textareaStyle}
        onFocus={e => { e.target.style.borderColor = '#b8965a'; e.target.style.boxShadow = '0 0 0 3px rgba(184,150,90,0.1)'; e.target.style.background = '#fff' }}
        onBlur={e => { e.target.style.borderColor = '#e5e5e7'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafa' }}
      />
    </Field>
  )
}

// ── Main SiteEditor ───────────────────────────
export default function SiteEditor({ user, userGalleries = [] }) {
  const [mode, setMode] = useState('edit') // 'edit' | 'preview'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState(null)
  const [brandName, setBrandName] = useState('')

  const [form, setForm] = useState({
    // Hero
    heroEyebrow: '',
    heroTitle: '',
    heroBio: '',
    // Portfolio
    portfolioTitle: '',
    portfolioSub: '',
    portfolioGalleryIds: [],
    // About
    aboutTitle: '',
    aboutBio: '',
    yearsExp: '',
    sessionsCount: '',
    citiesCount: '',
    // Services
    servicesTitle: '',
    servicesSub: '',
    services: [],
    // Testimonials
    testimonialsTitle: '',
    testimonialsSub: '',
    testimonials: [],
    // Contact
    contactTitle: '',
    contactSub: '',
    contactEmail: '',
    contactPhone: '',
    instagram: '',
    websiteUrl: '',
    // Meta
    accentColor: '#b8965a',
  })

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  // ── Load data ──
  useEffect(() => {
    if (!user?.uid) return
    const load = async () => {
      try {
        // Ia brandName din profiles
        const profileData = await sitesService.getProfile(user.uid)
        const bn = profileData?.brandName || ''
        setBrandName(bn)
        const sl = generateSlug(bn)
        setSlug(sl)

        // Ia datele de site
        const siteData = await sitesService.getSiteByOwnerUid(user.uid)
        if (siteData) {
          const d = siteData
          setForm(prev => ({ ...prev, ...d }))
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.uid])

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
        updatedAt: new Date(),
      }, { merge: true })
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

  // ── Services helpers ──
  const addService = () => setForm(p => ({ ...p, services: [...p.services, { ...EMPTY_SERVICE }] }))
  const removeService = (i) => setForm(p => ({ ...p, services: p.services.filter((_, idx) => idx !== i) }))
  const updateService = (i, key, val) => setForm(p => ({
    ...p,
    services: p.services.map((s, idx) => idx === i ? { ...s, [key]: val } : s)
  }))

  // ── Testimonials helpers ──
  const addTestimonial = () => setForm(p => ({ ...p, testimonials: [...p.testimonials, { ...EMPTY_TESTIMONIAL }] }))
  const removeTestimonial = (i) => setForm(p => ({ ...p, testimonials: p.testimonials.filter((_, idx) => idx !== i) }))
  const updateTestimonial = (i, key, val) => setForm(p => ({
    ...p,
    testimonials: p.testimonials.map((t, idx) => idx === i ? { ...t, [key]: val } : t)
  }))

  // ── Toggle gallery in portfolio ──
  const toggleGallery = (id) => {
    const ids = form.portfolioGalleryIds || []
    setForm(p => ({
      ...p,
      portfolioGalleryIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    }))
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
    }
    return (
      <div style={{ position: 'relative' }}>
        {/* Preview bar */}
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
            Previzualizare site · {siteUrl || 'Setează brandul în Setări pentru a genera linkul'}
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
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 40px',
        gap: 16,
      }}>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f', margin: 0 }}>
            Site-ul meu
          </p>
          {siteUrl ? (
            <p style={{ fontSize: '12px', fontWeight: 300, color: '#86868b', margin: '2px 0 0' }}>
              {siteUrl}
            </p>
          ) : (
            <p style={{ fontSize: '12px', fontWeight: 300, color: '#c0c0c8', margin: '2px 0 0' }}>
              Setează un nume de brand în Setări pentru a activa site-ul
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {siteUrl && (
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px',
                background: 'transparent',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '100px',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: copied ? '#2e7d32' : '#3a3a3c',
                transition: 'all 0.15s',
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
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px',
                background: 'transparent',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '100px',
                textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: '#3a3a3c',
              }}
            >
              <Globe size={14} /> Deschide
            </a>
          )}
          <button
            onClick={() => setMode('preview')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px',
              background: 'transparent',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '100px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: '#3a3a3c',
            }}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 22px',
              background: saving ? '#3a3a3c' : '#1d1d1f',
              color: '#fff',
              border: 'none',
              borderRadius: '100px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>

      {/* ── Editor content ── */}
      <div style={{ padding: '32px 40px 80px', maxWidth: '720px' }}>

        {/* Hero */}
        <EditorSection title="🌅 Hero — Prima impresie" defaultOpen={true}>
          <Input label="Text mic deasupra titlului" value={form.heroEyebrow} onChange={set('heroEyebrow')} placeholder={brandName || 'Fotograf de nuntă'} />
          <Input label="Titlu principal" value={form.heroTitle} onChange={set('heroTitle')} placeholder="Fotografii care spun povești" />
          <Textarea label="Subtitlu / tagline" value={form.heroBio} onChange={set('heroBio')} placeholder="Surprind momentele care contează cu autenticitate și artă." rows={3} />
          <p style={{ fontSize: '12px', color: '#a1a1a6', margin: 0 }}>
            💡 Imaginea de fundal Hero se setează din Setări → Logo & Branding (în curând: upload direct)
          </p>
        </EditorSection>

        {/* Portfolio */}
        <EditorSection title="📸 Portofoliu — Galeriile afișate pe site">
          <Input label="Titlu secțiune" value={form.portfolioTitle} onChange={set('portfolioTitle')} placeholder="Povești în imagini" />
          <Input label="Subtitlu" value={form.portfolioSub} onChange={set('portfolioSub')} placeholder="Fiecare fotografie e o amintire care va dura o viață." />

          <Field label="Selectează galeriile vizibile pe site">
            {userGalleries.filter(g => g.status !== 'trash' && g.status !== 'archived').length === 0 ? (
              <p style={{ fontSize: '13px', color: '#a1a1a6' }}>Nu ai galerii active. Adaugă galerii din tab-ul Galerii.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {userGalleries
                  .filter(g => g.status !== 'trash' && g.status !== 'archived')
                  .map(g => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 14px', background: (form.portfolioGalleryIds || []).includes(g.id) ? 'rgba(184,150,90,0.07)' : '#fafafa', border: `1px solid ${(form.portfolioGalleryIds || []).includes(g.id) ? 'rgba(184,150,90,0.4)' : '#e5e5e7'}`, borderRadius: '10px', transition: 'all 0.15s' }}>
                      <input
                        type="checkbox"
                        checked={(form.portfolioGalleryIds || []).includes(g.id)}
                        onChange={() => toggleGallery(g.id)}
                        style={{ accentColor: '#b8965a', width: 15, height: 15 }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 400, color: '#1d1d1f' }}>{g.nume}</span>
                      {g.categoria && <span style={{ fontSize: '12px', color: '#a1a1a6', marginLeft: 'auto' }}>{g.categoria}</span>}
                    </label>
                  ))}
              </div>
            )}
          </Field>
        </EditorSection>

        {/* About */}
        <EditorSection title="👤 Despre mine">
          <Input label="Titlu secțiune" value={form.aboutTitle} onChange={set('aboutTitle')} placeholder={`Salut, sunt ${brandName || 'fotograf'}`} />
          <Textarea label="Bio / Descriere" value={form.aboutBio} onChange={set('aboutBio')} placeholder="Prezintă-te clienților tăi — cine ești, ce te pasionează, ce face munca ta specială." rows={5} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Input label="Ani experiență" value={form.yearsExp} onChange={set('yearsExp')} placeholder="5" />
            <Input label="Ședințe foto" value={form.sessionsCount} onChange={set('sessionsCount')} placeholder="200" />
            <Input label="Orașe" value={form.citiesCount} onChange={set('citiesCount')} placeholder="12" />
          </div>
          <p style={{ fontSize: '12px', color: '#a1a1a6', margin: 0 }}>
            💡 Lasă câmpurile goale dacă nu vrei să afișezi statistici.
          </p>
        </EditorSection>

        {/* Services */}
        <EditorSection title="💼 Servicii & Prețuri">
          <Input label="Titlu secțiune" value={form.servicesTitle} onChange={set('servicesTitle')} placeholder="Pachete & Servicii" />
          <Input label="Subtitlu" value={form.servicesSub} onChange={set('servicesSub')} placeholder="Fiecare pachet e personalizat pentru nevoile tale." />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(form.services || []).map((s, i) => (
              <div key={i} style={{ padding: '18px', background: '#fafafa', borderRadius: '12px', border: '1px solid #e5e5e7', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f' }}>Serviciu #{i + 1}</span>
                  <button type="button" onClick={() => removeService(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Icon</label>
                    <input value={s.icon || ''} onChange={e => updateService(i, 'icon', e.target.value)} style={{ ...inputStyle, textAlign: 'center', fontSize: '20px', padding: '8px' }} placeholder="📷" />
                  </div>
                  <div>
                    <label style={labelStyle}>Nume serviciu</label>
                    <input value={s.name || ''} onChange={e => updateService(i, 'name', e.target.value)} style={inputStyle} placeholder="Nuntă" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Descriere scurtă</label>
                  <textarea value={s.description || ''} onChange={e => updateService(i, 'description', e.target.value)} style={{ ...textareaStyle, minHeight: '60px' }} placeholder="Ce include pachetul..." rows={2} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Preț</label>
                    <input value={s.price || ''} onChange={e => updateService(i, 'price', e.target.value)} style={inputStyle} placeholder="de la 1500" />
                  </div>
                  <div>
                    <label style={labelStyle}>Label preț</label>
                    <input value={s.priceLabel || ''} onChange={e => updateService(i, 'priceLabel', e.target.value)} style={inputStyle} placeholder="lei" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addService}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'transparent', border: '1px dashed #d1d1d6', borderRadius: '10px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '13.5px', color: '#86868b', width: '100%', justifyContent: 'center', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#b8965a'; e.currentTarget.style.color = '#b8965a' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d1d6'; e.currentTarget.style.color = '#86868b' }}
          >
            <Plus size={15} /> Adaugă serviciu
          </button>
        </EditorSection>

        {/* Testimonials */}
        <EditorSection title="⭐ Testimoniale">
          <Input label="Titlu secțiune" value={form.testimonialsTitle} onChange={set('testimonialsTitle')} placeholder="Povești adevărate" />
          <Input label="Subtitlu" value={form.testimonialsSub} onChange={set('testimonialsSub')} placeholder="Fiecare cuvânt vine din suflet." />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(form.testimonials || []).map((t, i) => (
              <div key={i} style={{ padding: '18px', background: '#fafafa', borderRadius: '12px', border: '1px solid #e5e5e7', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f' }}>Review #{i + 1}</span>
                  <button type="button" onClick={() => removeTestimonial(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Numele clientului</label>
                    <input value={t.name || ''} onChange={e => updateTestimonial(i, 'name', e.target.value)} style={inputStyle} placeholder="Maria & Ion" />
                  </div>
                  <div>
                    <label style={labelStyle}>Eveniment</label>
                    <input value={t.event || ''} onChange={e => updateTestimonial(i, 'event', e.target.value)} style={inputStyle} placeholder="Nuntă, Iulie 2024" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Mesaj</label>
                  <textarea value={t.text || ''} onChange={e => updateTestimonial(i, 'text', e.target.value)} style={{ ...textareaStyle, minHeight: '70px' }} placeholder="Ce au spus despre colaborarea cu tine..." rows={3} />
                </div>
                <div>
                  <label style={labelStyle}>Stele (1-5)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button" onClick={() => updateTestimonial(i, 'stars', n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', opacity: n <= (t.stars || 5) ? 1 : 0.25, transition: 'opacity 0.15s' }}>★</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTestimonial}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'transparent', border: '1px dashed #d1d1d6', borderRadius: '10px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '13.5px', color: '#86868b', width: '100%', justifyContent: 'center', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#b8965a'; e.currentTarget.style.color = '#b8965a' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d1d6'; e.currentTarget.style.color = '#86868b' }}
          >
            <Plus size={15} /> Adaugă testimonial
          </button>
        </EditorSection>

        {/* Contact */}
        <EditorSection title="📬 Contact">
          <Input label="Titlu secțiune" value={form.contactTitle} onChange={set('contactTitle')} placeholder="Rezervă acum" />
          <Input label="Subtitlu" value={form.contactSub} onChange={set('contactSub')} placeholder="Completează formularul și te contactez în maxim 24 de ore." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="Email de contact" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@studiofoto.ro" type="email" />
            <Input label="Telefon / WhatsApp" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+40 712 345 678" />
          </div>
          <Input label="Instagram" value={form.instagram} onChange={set('instagram')} placeholder="https://instagram.com/username" />
          <Input label="Website (dacă ai altul)" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://studiofoto.ro" />
        </EditorSection>

      </div>
    </div>
  )
}
