import { useState, useEffect, useRef } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const { auth: authService, sites: sitesService, media: mediaService } = getAppServices()

const LOGO_PATH = (userId) => `branding/${userId}/logo.png`
const DEFAULTS = {
  brandName: 'My Gallery',
  instagramUrl: '',
  whatsappNumber: '',
  websiteUrl: '',
  accentColor: '#000000',
  logoUrl: ''
}

export default function Settings({ user }) {
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
        const d = await sitesService.getProfile(user.uid)
        if (d) {
          setForm({
            brandName: d.brandName ?? DEFAULTS.brandName,
            instagramUrl: d.instagramUrl ?? '',
            whatsappNumber: d.whatsappNumber ?? '',
            websiteUrl: d.websiteUrl ?? '',
            accentColor: d.accentColor ?? DEFAULTS.accentColor,
            logoUrl: d.logoUrl ?? ''
          })
          if (d.logoUrl) {
            try {
              const url = await mediaService.getBrandingAsset(d.logoUrl)
              setLogoPreview(url)
            } catch {
              setLogoPreview(null)
            }
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.uid])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.uid) return
    setSaving(true)
    try {
      await sitesService.saveProfile(user.uid, {
        ...form,
        brandName: form.brandName.trim() || DEFAULTS.brandName,
        updatedAt: new Date()
      }, { merge: true })
      alert('Setările au fost salvate.')
    } catch (err) {
      console.error(err)
      alert('Eroare la salvare.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
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
      setForm((p) => ({ ...p, logoUrl: path }))
      await sitesService.saveProfile(user.uid, { logoUrl: path, updatedAt: new Date() }, { merge: true })
    } catch (err) {
      console.error(err)
      alert('Eroare la încărcarea logo-ului.')
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Se încarcă...</div>
  }

  return (
    <div className="settings-page" style={{ padding: '40px 0', maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: 24, fontWeight: 600 }}>Branding &amp; Setări</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Logo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
              className="btn-secondary"
              style={{ padding: '10px 20px' }}
            >
              {logoUploading ? 'Se încarcă...' : 'Încarcă logo'}
            </button>
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo"
                style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid #eee', borderRadius: 8 }}
              />
            )}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Nume brand</label>
          <input
            type="text"
            value={form.brandName}
            onChange={(e) => setForm((p) => ({ ...p, brandName: e.target.value }))}
            placeholder={DEFAULTS.brandName}
            style={{
              width: '100%', padding: 12, fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
              outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Culoare de accent</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => setForm((p) => ({ ...p, accentColor: e.target.value }))}
              style={{ width: 48, height: 48, padding: 0, border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}
            />
            <input
              type="text"
              value={form.accentColor}
              onChange={(e) => setForm((p) => ({ ...p, accentColor: e.target.value }))}
              style={{
                width: 100, padding: 10, fontSize: 14, fontFamily: 'monospace', border: '1px solid #ddd',
                borderRadius: 6, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>WhatsApp</label>
          <input
            type="text"
            value={form.whatsappNumber}
            onChange={(e) => setForm((p) => ({ ...p, whatsappNumber: e.target.value }))}
            placeholder="+40 712 345 678"
            style={{
              width: '100%', padding: 12, fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
              outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Instagram</label>
          <input
            type="text"
            value={form.instagramUrl}
            onChange={(e) => setForm((p) => ({ ...p, instagramUrl: e.target.value }))}
            placeholder="https://instagram.com/username sau @username"
            style={{
              width: '100%', padding: 12, fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
              outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Website</label>
          <input
            type="url"
            value={form.websiteUrl}
            onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
            placeholder="https://example.com"
            style={{
              width: '100%', padding: 12, fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
              outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={saving} style={{ padding: 14, alignSelf: 'flex-start' }}>
          {saving ? 'Se salvează...' : 'Salvează setările'}
        </button>
      </form>
    </div>
  )
}
