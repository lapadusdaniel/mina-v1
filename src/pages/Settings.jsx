import { useState, useEffect, useRef } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import SubscriptionSection from '../components/SubscriptionSection'
import './Settings.css'

const { auth: authService, sites: sitesService, media: mediaService } = getAppServices()

const LOGO_PATH = (userId) => `branding/${userId}/logo.png`
const DEFAULTS = {
  brandName: 'My Gallery',
  instagramUrl: '',
  whatsappNumber: '',
  websiteUrl: '',
  accentColor: '#000000',
  logoUrl: '',
}

export default function Settings({ user, theme, setTheme, userPlan, storageLimit, checkAccess }) {
  const [activeTab, setActiveTab] = useState('branding')
  const [form, setForm] = useState({ ...DEFAULTS })
  const [logoPreview, setLogoPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!user?.uid) return
    const load = async () => {
      try {
        const data = await sitesService.getProfile(user.uid)
        if (data) {
          setForm({
            brandName: data.brandName ?? DEFAULTS.brandName,
            instagramUrl: data.instagramUrl ?? '',
            whatsappNumber: data.whatsappNumber ?? '',
            websiteUrl: data.websiteUrl ?? '',
            accentColor: data.accentColor ?? DEFAULTS.accentColor,
            logoUrl: data.logoUrl ?? '',
          })

          if (data.logoUrl) {
            try {
              const url = await mediaService.getBrandingAsset(data.logoUrl)
              setLogoPreview(url)
            } catch {
              setLogoPreview(null)
            }
          }
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.uid])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.uid) return

    setSaving(true)
    try {
      await sitesService.saveProfile(
        user.uid,
        {
          ...form,
          brandName: form.brandName.trim() || DEFAULTS.brandName,
          updatedAt: new Date(),
        },
        { merge: true }
      )
      alert('Setările au fost salvate.')
    } catch (error) {
      console.error(error)
      alert('Eroare la salvare.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !user?.uid) return

    if (!file.type.startsWith('image/')) {
      alert('Selectează un fișier imagine (PNG, JPG).')
      return
    }

    setLogoUploading(true)
    try {
      const path = LOGO_PATH(user.uid)
      const idToken = await authService.getCurrentIdToken()
      await mediaService.uploadFileToPath(file, path, undefined, idToken)
      const blobUrl = await mediaService.getBrandingAsset(path)
      setLogoPreview(blobUrl)
      setForm((prev) => ({ ...prev, logoUrl: path }))
      await sitesService.saveProfile(user.uid, { logoUrl: path, updatedAt: new Date() }, { merge: true })
    } catch (error) {
      console.error(error)
      alert('Eroare la încărcarea logo-ului.')
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return <div className="settings-loading">Se încarcă...</div>
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Setări</h2>
        <p>Controlezi brandingul, tema și zona de abonament dintr-un singur loc.</p>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Setări">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'branding'}
          className={`settings-tab-btn ${activeTab === 'branding' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('branding')}
        >
          Branding
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'theme'}
          className={`settings-tab-btn ${activeTab === 'theme' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('theme')}
        >
          Temă
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'billing'}
          className={`settings-tab-btn ${activeTab === 'billing' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          Abonament & Facturare
        </button>
      </div>

      {activeTab === 'branding' && (
        <section className="settings-panel" role="tabpanel" aria-label="Branding">
          <h3 className="settings-panel-title">Branding</h3>

          <form onSubmit={handleSubmit} className="st-form">
            <div className="st-field">
              <label>Logo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                style={{ display: 'none' }}
              />
              <div className="st-logo-row">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="btn-secondary"
                >
                  {logoUploading ? 'Se încarcă...' : 'Încarcă logo'}
                </button>
                {logoPreview && (
                  <img src={logoPreview} alt="Logo" className="st-logo-preview" />
                )}
              </div>
            </div>

            <div className="st-field">
              <label>Nume brand</label>
              <input
                type="text"
                value={form.brandName}
                onChange={(e) => setForm((prev) => ({ ...prev, brandName: e.target.value }))}
                placeholder={DEFAULTS.brandName}
              />
            </div>

            <div className="st-field">
              <label>Culoare accent</label>
              <div className="st-color-row">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
                  className="st-color-input"
                />
                <input
                  type="text"
                  value={form.accentColor}
                  onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
                  className="st-color-text"
                />
              </div>
            </div>

            <div className="st-field">
              <label>WhatsApp</label>
              <input
                type="text"
                value={form.whatsappNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, whatsappNumber: e.target.value }))}
                placeholder="+40 712 345 678"
              />
            </div>

            <div className="st-field">
              <label>Instagram</label>
              <input
                type="text"
                value={form.instagramUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                placeholder="https://instagram.com/username sau @username"
              />
            </div>

            <div className="st-field">
              <label>Website</label>
              <input
                type="url"
                value={form.websiteUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Se salvează...' : 'Salvează setările'}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'theme' && (
        <section className="settings-panel" role="tabpanel" aria-label="Temă">
          <h3 className="settings-panel-title">Tema interfeței</h3>
          <p className="settings-subtitle">Se aplică pe dashboard, galerii și site-ul tău public.</p>

          <div className="settings-theme-grid">
            {[
              { id: 'luxos', label: 'Luxos', bg: '#0d0900', accent: '#d4af64', text: '#f5e6c0', desc: 'Dark auriu, serif elegant' },
              { id: 'minimal', label: 'Minimal', bg: '#ffffff', accent: '#111111', text: '#1d1d1f', desc: 'Alb pur, fără distrageri' },
              { id: 'indraznet', label: 'Îndrăzneț', bg: '#0a0a1a', accent: '#a970ff', text: '#ffffff', desc: 'Dark violet, modern' },
              { id: 'cald', label: 'Cald', bg: '#faf6f0', accent: '#8b6040', text: '#2d1f0f', desc: 'Bej crem, organic' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                style={{
                  background: t.bg,
                  border: `2px solid ${theme === t.id ? t.accent : 'transparent'}`,
                  borderRadius: 14,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'border-color 0.2s, transform 0.15s',
                  transform: theme === t.id ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: theme === t.id ? `0 0 0 4px ${t.accent}22` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{t.label}</span>
                  {theme === t.id && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Activ
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: t.text, opacity: 0.55, fontWeight: 300 }}>{t.desc}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'billing' && (
        <section className="settings-panel" role="tabpanel" aria-label="Abonament și facturare">
          <h3 className="settings-panel-title">Abonament & Facturare</h3>
          <SubscriptionSection
            user={user}
            userPlan={userPlan}
            storageLimit={storageLimit}
            checkAccess={checkAccess}
            mode="billingOnly"
          />
        </section>
      )}
    </div>
  )
}
