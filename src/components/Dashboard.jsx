import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import './Dashboard.css'
import { useUserSubscription } from '../hooks/useUserSubscription'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { 
  Check,
  Contact, 
  Instagram, 
  Mail, 
  MessageCircle, 
  CreditCard, 
  Trash2, 
  Layout, 
  BarChart3, 
  FileText, 
  Settings as SettingsIcon 
} from 'lucide-react'
import AdminGalleryTable from './AdminGalleryTable'
import GalleryDetailView from './GalleryDetailView'
import Settings from '../pages/Settings'
import SubscriptionSection from './SubscriptionSection'
import SiteEditor from './SiteEditor'
import LaunchChecklist from './LaunchChecklist'

const {
  auth: authService,
  galleries: galleriesService,
  media: mediaService,
  sites: sitesService,
} = getAppServices()

const SIDEBAR_TABS = [
  { key: 'galerii', label: 'Galerii', icon: Layout },
  { key: 'card', label: 'Card', icon: Contact },
  { key: 'trash', label: 'Coș de gunoi', icon: Trash2 },
  { key: 'site', label: 'Site-ul meu (Beta)', icon: Layout },
  { key: 'lansare', label: 'Lansare', icon: Check },
  { key: 'statistici', label: 'Statistici', icon: BarChart3 },
  { key: 'contracte', label: 'Contracte', icon: FileText },
  { key: 'abonament', label: 'Abonament', icon: CreditCard },
  { key: 'setari', label: 'Setări', icon: SettingsIcon }
]
const TRASH_RETENTION_DAYS = 30

function Dashboard({ user, onLogout, initialTab }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = location.pathname === '/settings' ? 'setari' : (searchParams.get('tab') || initialTab || 'galerii')
  const [galerii, setGalerii] = useState([])
  const [loading, setLoading] = useState(true)
  const [galerieActiva, setGalerieActiva] = useState(null)
  const [pozeGalerie, setPozeGalerie] = useState([])
  const [loadingPoze, setLoadingPoze] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)

  const { userPlan, storageLimit, checkAccess } = useUserSubscription(user?.uid)

  // Show success modal when returning from Stripe with ?payment=success
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('payment') === 'success') {
      setShowPaymentSuccess(true)
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, location.pathname, navigate])

  // Profile / Branding State
  const [profileData, setProfileData] = useState({
    numeBrand: '',
    slogan: '',
    whatsapp: '',
    instagram: '',
    email: '',
    website: ''
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  
  const fileInputRef = useRef(null)
  const metadataBackfillQueueRef = useRef(new Set())
  const lastSyncedStorageBytesRef = useRef(null)

  // Auto-cleanup: șterge galeriile din coș mai vechi de TRASH_RETENTION_DAYS (R2 + Firestore)
  useEffect(() => {
    if (!user?.uid) return
    const run = async () => {
      try {
        const retentionCutoff = new Date()
        retentionCutoff.setDate(retentionCutoff.getDate() - TRASH_RETENTION_DAYS)
        const ownerGalleries = await galleriesService.listOwnerGalleries(user.uid)
        const oldTrash = ownerGalleries.filter((g) => {
          if (g.status !== 'trash') return false
          const deletedAt = g.deletedAt?.toDate?.() || (g.deletedAt ? new Date(g.deletedAt) : null)
          if (!deletedAt || Number.isNaN(deletedAt.getTime())) return false
          return deletedAt < retentionCutoff
        })
        if (!oldTrash.length) return
        const idToken = await authService.getCurrentIdToken()
        for (const g of oldTrash) {
          try {
            await mediaService.deleteGalleryAssets(g.id, idToken, g.userId || user.uid)
            await galleriesService.deleteGallery(g.id)
            const removedBytes = Math.max(0, Number(g?.storageBytes || 0))
            if (removedBytes > 0) {
              await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
            }
          } catch (e) {
            console.warn('Trash cleanup failed for gallery', g.id, e)
          }
        }
      } catch (e) {
        console.warn('Trash cleanup query failed', e)
      }
    }
    run()
  }, [user?.uid])

  // Keep a pre-calculated per-user storage counter in Firestore for fast quota checks in Worker.
  useEffect(() => {
    if (!user?.uid) return
    const totalBytes = galerii.reduce((sum, g) => sum + Math.max(0, Number(g?.storageBytes || 0)), 0)
    if (lastSyncedStorageBytesRef.current === totalBytes) return
    lastSyncedStorageBytesRef.current = totalBytes

    galleriesService.setUserStorageUsed(user.uid, totalBytes).catch(() => {
      lastSyncedStorageBytesRef.current = null
    })
  }, [galerii, user?.uid])

  // Real-time listener pentru galerii
  useEffect(() => {
    if (!user?.uid) return
    const unsubscribe = galleriesService.watchOwnerGalleries(user.uid, (data) => {
      data.sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.data ? new Date(a.data) : null) || new Date(0)
        const dbVal = b.createdAt?.toDate?.() || (b.data ? new Date(b.data) : null) || new Date(0)
        return dbVal.getTime() - da.getTime()
      })
      setGalerii(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [user?.uid])


  // Backfill metadata o singură dată pentru galerii vechi (fără N+1 în tabelul de listă).
  useEffect(() => {
    if (!user?.uid || !galerii.length) return

    let cancelled = false

    const missingMetadata = galerii.filter((gallery) => {
      if (!gallery?.id) return false
      if (gallery.status === 'trash') return false
      const missingCover = !gallery.coverKey
      const missingStorage = typeof gallery.storageBytes !== 'number'
      const missingCount = typeof gallery.poze !== 'number'
      if (!missingCover && !missingStorage && !missingCount) return false
      return !metadataBackfillQueueRef.current.has(gallery.id)
    })

    if (!missingMetadata.length) return

    const runBackfill = async () => {
      for (const gallery of missingMetadata.slice(0, 4)) {
        if (cancelled) return

        metadataBackfillQueueRef.current.add(gallery.id)
        let success = false

        try {
          const raw = await mediaService.listGalleryPhotos(gallery.id, user.uid)
          if (cancelled) return

          const items = Array.isArray(raw)
            ? raw
            : (raw?.Contents ?? raw?.objects ?? raw?.items ?? [])

          const normalized = items
            .map((item) => ({
              key: item?.Key ?? item?.key ?? item?.name ?? '',
              size: Number(item?.size ?? item?.Size ?? 0),
            }))
            .filter((item) => item.key)

          const patch = {}

          if (!gallery.coverKey) patch.coverKey = normalized[0]?.key || ''
          if (typeof gallery.storageBytes !== 'number') {
            patch.storageBytes = normalized.reduce((sum, item) => sum + Number(item.size || 0), 0)
          }
          if (typeof gallery.poze !== 'number' || gallery.poze !== normalized.length) {
            patch.poze = normalized.length
          }

          if (Object.keys(patch).length > 0) {
            await galleriesService.updateGallery(gallery.id, patch)
          }

          success = true
        } catch (_) {
        } finally {
          if (!success) {
            metadataBackfillQueueRef.current.delete(gallery.id)
          }
        }
      }
    }

    runBackfill()

    return () => {
      cancelled = true
    }
  }, [galerii, user?.uid])

  // Update galerie activă dacă se schimbă datele în Firebase
  useEffect(() => {
    if (galerieActiva && galerii.length) {
      const updated = galerii.find((g) => g.id === galerieActiva.id)
      if (updated) setGalerieActiva(updated)
    }
  }, [galerii])

  // Logica încărcare poze în galerie
  const handleDeschideGalerie = async (galerie) => {
    setGalerieActiva(galerie)
    setLoadingPoze(true)
    setPozeGalerie([])
    try {
      const poze = await mediaService.listGalleryPhotos(galerie.id, user.uid)
      const pozeWithUrlsRaw = await Promise.all(
        poze.map(async (poza) => {
          const key = poza.key || poza.name || poza.Key
          if (!key) return null
          const url = await mediaService.getPhotoUrl(key, 'thumb')
          return {
            key,
            url,
            size: poza.size ?? poza.Size,
            lastModified: poza.lastModified ?? poza.uploaded ?? poza.LastModified
          }
        })
      )
      const normalizedPhotos = pozeWithUrlsRaw.filter(Boolean)
      setPozeGalerie(normalizedPhotos)

      // Backfill metadata once for older galleries to avoid future N+1 listing in table rows.
      const needsBackfill = !galerie?.coverKey || typeof galerie?.storageBytes !== 'number'
      if (needsBackfill) {
        const coverKey = normalizedPhotos[0]?.key || ''
        const storageBytes = normalizedPhotos.reduce((sum, p) => sum + Number(p?.size || 0), 0)
        galleriesService.updateGallery(galerie.id, {
          coverKey,
          storageBytes,
          poze: normalizedPhotos.length,
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error loading poze:', error)
      alert('Eroare la încărcarea pozelor!')
    } finally {
      setLoadingPoze(false)
    }
  }

  // Logica Upload (Original + Medium + Thumb)
  const handleUploadPoze = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length || !galerieActiva) return
    setUploading(true)
    setUploadProgress(0)
    const totalSteps = files.length * 3
    const reportProgress = (stepIndex, percent) => {
      setUploadProgress(Math.round(((stepIndex + percent / 100) / totalSteps) * 100))
    }
    try {
      const idToken = await authService.getCurrentIdToken()
      let uploadedBytes = 0
      let firstUploadedOriginal = ''
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const baseName = `${Date.now()}-${i}-${(file.name || 'image').replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const baseNameNoExt = baseName.replace(/\.[^.]+$/, '')
        const origPath = `galerii/${galerieActiva.id}/originals/${baseName}`
        const mediumPath = `galerii/${galerieActiva.id}/medium/${baseNameNoExt}.webp`
        const thumbPath = `galerii/${galerieActiva.id}/thumbnails/${baseNameNoExt}.webp`
        uploadedBytes += Number(file.size || 0)
        if (!firstUploadedOriginal) firstUploadedOriginal = origPath

        const [mediumFile, thumbFile] = await Promise.all([
          imageCompression(file, { maxWidthOrHeight: 2560, fileType: 'image/webp', initialQuality: 0.95, useWebWorker: true }),
          imageCompression(file, { maxWidthOrHeight: 1000, fileType: 'image/webp', initialQuality: 0.86, useWebWorker: true })
        ])

        await Promise.all([
          mediaService.uploadPhoto(file, galerieActiva.id, user.uid, (p) => reportProgress(i * 3, p), origPath, idToken),
          mediaService.uploadPhoto(mediumFile, galerieActiva.id, user.uid, (p) => reportProgress(i * 3 + 1, p), mediumPath, idToken),
          mediaService.uploadPhoto(thumbFile, galerieActiva.id, user.uid, (p) => reportProgress(i * 3 + 2, p), thumbPath, idToken)
        ])
      }
      await handleDeschideGalerie(galerieActiva)
      const currentPhotoCount = Number(galerieActiva?.poze ?? pozeGalerie.length ?? 0)
      const currentBytes = Number(galerieActiva?.storageBytes || 0)
      await galleriesService.updateGallery(galerieActiva.id, {
        poze: currentPhotoCount + files.length,
        storageBytes: currentBytes + uploadedBytes,
        coverKey: galerieActiva?.coverKey || firstUploadedOriginal || '',
      })
      await galleriesService.adjustUserStorageUsed(user.uid, uploadedBytes)
    } catch (error) {
      console.error('Error uploading:', error)
      alert('Eroare la upload!')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeletePoza = async (pozaKey) => {
    if (!window.confirm('Ștergi această poză?')) return
    try {
      const removedPhoto = pozeGalerie.find((p) => p.key === pozaKey)
      const idToken = await authService.getCurrentIdToken()
      await mediaService.deletePhoto(pozaKey, idToken)
      const nextPhotos = pozeGalerie.filter((p) => p.key !== pozaKey)
      setPozeGalerie(nextPhotos)

      if (galerieActiva?.id) {
        const nextCoverKey = galerieActiva?.coverKey === pozaKey ? (nextPhotos[0]?.key || '') : (galerieActiva?.coverKey || '')
        const currentPhotoCount = Number(galerieActiva?.poze ?? pozeGalerie.length ?? 0)
        const currentBytes = Number(galerieActiva?.storageBytes || 0)
        const removedBytes = Number(removedPhoto?.size || 0)
        await galleriesService.updateGallery(galerieActiva.id, {
          poze: Math.max(0, currentPhotoCount - 1),
          storageBytes: Math.max(0, currentBytes - removedBytes),
          coverKey: nextCoverKey,
        })
        if (removedBytes > 0) {
          await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la ștergere!')
    }
  }

  // Management Galerii (Trash / Delete / Restore)
  const handleMoveToTrash = async (id) => {
    try {
      await galleriesService.moveToTrash(id, new Date())
      if (galerieActiva?.id === id) {
        setGalerieActiva(null)
        setPozeGalerie([])
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleDeletePermanently = async (id) => {
    if (!window.confirm('Această acțiune va șterge definitiv toate fotografiile din stocarea Cloudflare și nu poate fi anulată. Ștergi definitiv?')) return
    try {
      const targetGallery = galerii.find((g) => g.id === id) || (galerieActiva?.id === id ? galerieActiva : null)
      const removedBytes = Math.max(0, Number(targetGallery?.storageBytes || 0))
      const idToken = await authService.getCurrentIdToken()
      await mediaService.deleteGalleryAssets(id, idToken, user?.uid || '')
      await galleriesService.deleteGallery(id)
      if (removedBytes > 0) {
        await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la ștergere definitivă. Încearcă din nou.')
    }
  }

  const handleRestoreGalerie = async (id) => {
    try {
      await galleriesService.restoreGallery(id)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handlePreview = async (galerie) => {
    let url = `${window.location.origin}/gallery/${galerie.id}`
    try {
      const idToken = await authService.getCurrentIdToken()
      if (idToken && galerie?.id) {
        const rawExpiry = galerie?.dataExpirare ?? galerie?.expiresAt ?? galerie?.dataExpirarii
        const expiryDate = rawExpiry ? new Date(rawExpiry) : null
        const ttlHours = expiryDate && !Number.isNaN(expiryDate.getTime())
          ? Math.max(1, Math.min(24 * 365, Math.ceil((expiryDate.getTime() - Date.now()) / 3600000)))
          : 24 * 30
        const share = await mediaService.createSecureShareToken(galerie.id, idToken, ttlHours)
        if (share?.token) {
          url = `${window.location.origin}/gallery/${galerie.id}?st=${encodeURIComponent(share.token)}`
        }
      }
    } catch (_) {
    }
    window.open(url, '_blank')
  }

  const handleLogout = async () => {
    await onLogout?.()
  }

  useEffect(() => {
    if (!user?.uid || activeTab !== 'card') return
    setProfileLoading(true)
    sitesService.getCardProfile(user.uid)
      .then((d) => {
        if (d) {
          setProfileData({
            numeBrand: d.numeBrand ?? '',
            slogan: d.slogan ?? '',
            whatsapp: d.whatsapp ?? d.telefon ?? '',
            instagram: d.instagram ?? '',
            email: d.email ?? '',
            website: d.website ?? ''
          })
        }
        setProfileLoading(false)
      })
      .catch(() => setProfileLoading(false))
  }, [user?.uid, activeTab])

  const saveProfileSettings = async (e) => {
    e?.preventDefault?.()
    setProfileSaving(true)
    try {
      await sitesService.saveCardProfile(
        user.uid,
        { ...profileData, updatedAt: new Date() },
        { merge: true }
      )
      alert('Modificările au fost salvate.')
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setProfileSaving(false)
    }
  }

  const userInitial = (user?.name || 'U').charAt(0).toUpperCase()

  const renderSidebar = () => (
    <div className="dashboard-sidebar">
      <div className="sidebar-logo-area">
        <h1 className="dashboard-logo" onClick={() => {
          setGalerieActiva(null)
          if (location.pathname === '/settings') navigate('/dashboard?tab=galerii')
          else setSearchParams({ tab: 'galerii' })
        }}>
          Mina
        </h1>
      </div>
      {SIDEBAR_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`dashboard-sidebar-btn ${activeTab === key ? 'active' : ''}`}
          onClick={() => {
            if (key === 'setari') navigate('/settings')
            else if (location.pathname === '/settings') navigate(`/dashboard?tab=${key}`)
            else setSearchParams({ tab: key })
          }}
        >
          <span className="dashboard-sidebar-btn-indicator" />
          {Icon && <Icon size={18} className="dashboard-sidebar-btn-icon" />}
          {label}
        </button>
      ))}
    </div>
  )

  const renderMainContent = () => {
    // Vizualizare poze într-o galerie specifică
    if (galerieActiva) {
      return (
        <GalleryDetailView
          galerie={galerieActiva}
          pozeGalerie={pozeGalerie}
          loadingPoze={loadingPoze}
          user={user}
          uploading={uploading}
          uploadProgress={uploadProgress}
          fileInputRef={fileInputRef}
          onBack={() => { setGalerieActiva(null); setPozeGalerie([]) }}
          onPreview={handlePreview}
          onUploadPoze={handleUploadPoze}
          onDeletePoza={handleDeletePoza}
        />
      )
    }

    const activeTabLabel = SIDEBAR_TABS.find((t) => t.key === activeTab)?.label ?? activeTab

    return (
      <>
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-right">
            <div className="dashboard-profile">
              <div className="dashboard-avatar-wrap" title={user?.email}>
                <div className="dashboard-avatar">{userInitial}</div>
              </div>
              <div className="dashboard-profile-info">
                <span className="dashboard-profile-name">{user?.name || 'Fotograf'}</span>
                <span className="dashboard-profile-email">{user?.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="dashboard-logout-link">Ieșire</button>
          </div>
        </header>

        {/* Tab-uri Galerii / Coș */}
        {(activeTab === 'galerii' || activeTab === 'trash') && (
          <AdminGalleryTable
            user={user}
            galerii={galerii}
            loading={loading}
            activeTab={activeTab}
            userPlan={userPlan}
            storageLimit={storageLimit}
            onDeschideGalerie={handleDeschideGalerie}
            onMoveToTrash={handleMoveToTrash}
            onDeletePermanently={handleDeletePermanently}
            onRestore={handleRestoreGalerie}
            onPreview={handlePreview}
          />
        )}

        {/* Tab Branding / Card */}
        {activeTab === 'card' && (
          <div className="brand-card-container">
            <div className="brand-card-editor">
              <h2 className="brand-card-title">Identitate de brand</h2>
              {profileLoading ? (
                <p>Se încarcă...</p>
              ) : (
                <form onSubmit={saveProfileSettings} className="brand-card-form">
                  <div className="brand-card-form-group">
                    <label>Nume Brand</label>
                    <input
                      type="text"
                      value={profileData.numeBrand}
                      onChange={(e) => setProfileData(p => ({ ...p, numeBrand: e.target.value }))}
                      placeholder="Ex: Studio Foto XYZ"
                    />
                  </div>
                  <div className="brand-card-form-group">
                    <label>Slogan</label>
                    <input
                      type="text"
                      value={profileData.slogan}
                      onChange={(e) => setProfileData(p => ({ ...p, slogan: e.target.value }))}
                      placeholder="Ex: Fotografii care spun povești"
                    />
                  </div>
                  <div className="brand-card-form-group">
                    <label>WhatsApp / Instagram / Email</label>
                    <input
                      type="tel"
                      value={profileData.whatsapp}
                      onChange={(e) => setProfileData(p => ({ ...p, whatsapp: e.target.value }))}
                      placeholder="WhatsApp"
                    />
                    <input
                      type="text"
                      value={profileData.instagram}
                      onChange={(e) => setProfileData(p => ({ ...p, instagram: e.target.value }))}
                      placeholder="Instagram"
                    />
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData(p => ({ ...p, email: e.target.value }))}
                      placeholder="Email de contact"
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={profileSaving}>
                    {profileSaving ? 'Se salvează...' : 'Salvează modificările'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab Site ── ADĂUGAT */}
        {activeTab === 'site' && (
          <SiteEditor user={user} userGalleries={galerii} />
        )}

        {/* Tab Lansare */}
        {activeTab === 'lansare' && <LaunchChecklist />}

        {/* Tab Setări Generale */}
        {activeTab === 'setari' && <Settings user={user} />}

        {/* Tab Abonament */}
        {activeTab === 'abonament' && (
          <div className="dashboard-subscription-wrap" style={{ width: '100%', padding: '20px 40px' }}>
            <SubscriptionSection user={user} userPlan={userPlan} storageLimit={storageLimit} checkAccess={checkAccess} />
          </div>
        )}

        {/* Placeholder pentru tab-uri în lucru */}
        {['statistici', 'contracte'].includes(activeTab) && (
          <div className="dashboard-tab-placeholder">
            Secțiunea {activeTabLabel} urmează să fie implementată.
          </div>
        )}
      </>
    )
  }

  return (
    <div className="dashboard-layout">
      {renderSidebar()}
      <div className={`dashboard-main-content ${!galerieActiva ? 'page-content dashboard-app' : ''}`}>
        {renderMainContent()}
      </div>

      {showPaymentSuccess && (
        <div className="dashboard-payment-success-overlay" onClick={() => setShowPaymentSuccess(false)}>
          <div className="dashboard-payment-success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard-payment-success-icon">
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h3>Plata a fost primită</h3>
            <p>Contul tău a fost actualizat. Bine ai revenit în Mina.</p>
            <button type="button" onClick={() => setShowPaymentSuccess(false)}>
              Înțeles
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
