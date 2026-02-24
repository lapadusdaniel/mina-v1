import { useState, useEffect, useRef, useMemo } from 'react'
import { MoreVertical, Settings, Eye, Pin, Trash2, Link2, Share2, Archive, ArchiveRestore } from 'lucide-react'
import GallerySettingsModal from './GallerySettingsModal'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { formatBytes, formatDateRO, CATEGORII_FILTRU } from '../utils/galleryUtils'
import AdminGalleryForm from './AdminGalleryForm'
import { ImagePlus, Users, Heart } from 'lucide-react'

import './Dashboard.css'

const { auth: authService, galleries: galleriesService, media: mediaService } = getAppServices()

const PINNED_STORAGE_KEY = 'mina-pinned-galleries'
const LEGACY_PINNED_STORAGE_KEY = 'fotolio-pinned-galleries'
const PLAN_LIMITS_GB = { Free: 15, Pro: 500, Unlimited: 1000 }
const TRASH_AUTO_DELETE_DAYS = 30

function readPinnedIdsFromStorage() {
  try {
    const rawCurrent = localStorage.getItem(PINNED_STORAGE_KEY)
    if (rawCurrent) {
      const parsedCurrent = JSON.parse(rawCurrent)
      if (Array.isArray(parsedCurrent)) return parsedCurrent
    }
  } catch (_) {
  }

  try {
    const rawLegacy = localStorage.getItem(LEGACY_PINNED_STORAGE_KEY)
    if (rawLegacy) {
      const parsedLegacy = JSON.parse(rawLegacy)
      if (Array.isArray(parsedLegacy)) return parsedLegacy
    }
  } catch (_) {
  }

  return []
}

function getDaysUntilAutoDelete(deletedAt) {
  if (!deletedAt) return null
  const d = deletedAt?.toDate ? deletedAt.toDate() : new Date(deletedAt)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const daysSince = Math.floor((now - d) / 86400000)
  return Math.max(0, TRASH_AUTO_DELETE_DAYS - daysSince)
}

function computeShareTtlHours(dataExpirareRaw) {
  if (!dataExpirareRaw) return 24 * 30
  const expiresAt = new Date(dataExpirareRaw)
  if (Number.isNaN(expiresAt.getTime())) return 24 * 30
  const hours = Math.ceil((expiresAt.getTime() - Date.now()) / 3600000)
  return Math.max(1, Math.min(24 * 365, hours))
}

const IconViews = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const IconDownloads = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

function GalleryRow({
  galerie, user, onDeschide, onMoveToTrash, onDeletePermanently, onRestore, onPreview,
  isPinned, onTogglePin, isTrashView, isArchivedView, isSelected, onToggleSelect,
  onArchive, onUnarchive, onOpenSettings
}) {
  const [coverUrl, setCoverUrl] = useState(null)
  const [totalSize, setTotalSize] = useState(0)
  const [coverLoading, setCoverLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copyTooltip, setCopyTooltip] = useState(false)
  const urlRef = useRef(null)
  const menuRef = useRef(null)

  const galleryUrl = galerie?.id
    ? `${window.location.origin}/gallery/${galerie.id}`
    : ''

  const buildSecureShareUrl = async () => {
    if (!galerie?.id) return galleryUrl
    try {
      const idToken = await authService.getCurrentIdToken()
      if (!idToken) return galleryUrl

      const ttlHours = computeShareTtlHours(galerie?.dataExpirare ?? galerie?.expiresAt ?? galerie?.dataExpirarii)
      const shareData = await mediaService.createSecureShareToken(galerie.id, idToken, ttlHours)
      if (!shareData?.token) return galleryUrl

      return `${window.location.origin}/gallery/${galerie.id}?st=${encodeURIComponent(shareData.token)}`
    } catch (_) {
      return galleryUrl
    }
  }

  const handleCopy = async (e) => {
    e.stopPropagation()
    if (galleryUrl && navigator.clipboard?.writeText) {
      const secureUrl = await buildSecureShareUrl()
      navigator.clipboard.writeText(secureUrl)
      setCopyTooltip(true)
      setTimeout(() => setCopyTooltip(false), 1500)
    }
  }

  const handleShare = async (e) => {
    e.stopPropagation()
    if (!galleryUrl) return
    const secureUrl = await buildSecureShareUrl()
    if (navigator.share) {
      navigator.share({ url: secureUrl, title: galerie?.nume || 'Galerie' }).catch(() => {})
    } else if (galleryUrl) {
      window.open(secureUrl, '_blank')
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (!cancelled) setTotalSize(Number(galerie?.storageBytes || 0))

        const preferredCoverKey = galerie?.coverKey
        if (!preferredCoverKey) {
          if (!cancelled) setCoverUrl(null)
          return
        }

        const url = await mediaService.getPhotoUrl(preferredCoverKey, 'thumb')
        if (cancelled) {
          URL.revokeObjectURL(url)
        } else {
          urlRef.current = url
          setCoverUrl(url)
        }
      } catch (_) {
      } finally {
        if (!cancelled) setCoverLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [galerie.id, galerie.coverKey, galerie.storageBytes, user.uid])

  const fileCount = galerie?.poze ?? 0
  const metaText = `${fileCount} fișiere • ${formatBytes(totalSize)}`
  const dataEvenimentFormatted = galerie?.dataEveniment ? formatDateRO(galerie.dataEveniment) : null
  const dataExpirareRaw = galerie?.dataExpirare ?? galerie?.expiresAt ?? galerie?.dataExpirarii
  const dataExpirareFormatted = dataExpirareRaw ? formatDateRO(dataExpirareRaw) : null
  const isExpired = dataExpirareRaw ? new Date(dataExpirareRaw) < new Date() : false
  const daysUntilAutoDelete = isTrashView ? getDaysUntilAutoDelete(galerie?.deletedAt) : null

  const showArchiveBtn = !isTrashView && !isArchivedView && onArchive
  const showUnarchiveInMenu = isArchivedView && onUnarchive

  return (
    <div className={`gallery-row ${isTrashView ? 'gallery-row-trash' : ''}`}>
      <div
        className="gallery-row-col gallery-row-col-branding"
        onClick={() => onDeschide(galerie)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDeschide(galerie); } }}
      >
        {!isTrashView && onToggleSelect && (
          <div className="gallery-row-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(galerie?.id, e.target.checked); }}
              className="gallery-row-checkbox"
            />
          </div>
        )}
        <div className="gallery-row-cover">
          {coverLoading ? (
            <div className="gallery-row-cover-placeholder" />
          ) : coverUrl ? (
            <img src={coverUrl} alt="" className="gallery-row-cover-img" />
          ) : (
            <div className="gallery-row-cover-placeholder" />
          )}
        </div>
        <div className="gallery-row-main">
          <h3 className="gallery-row-name">
            {isPinned && <Pin size={12} className="gallery-row-pin-icon" />}
            <span className="gallery-row-name-inner">{galerie?.nume}</span>
          </h3>
          <p className="gallery-row-meta">{metaText}</p>
        </div>
      </div>
      <div className="gallery-row-col gallery-row-col-stat" data-label="Vizualizări">
        <div className="gallery-stat">
          <IconViews />
          <span>{galerie?.vizualizari ?? 0}</span>
        </div>
      </div>
      <div className="gallery-row-col gallery-row-col-stat" data-label="Descărcări">
        <div className="gallery-stat">
          <IconDownloads />
          <span>{galerie?.descarcari ?? 0}</span>
        </div>
      </div>
      <div className="gallery-row-col gallery-row-col-stat gallery-row-col-activitate" data-label="Activitate">
        <div className="gallery-activity-stats">
          <span className="gallery-activity-item" title="Clienți cu selecție">
            <Users size={12} className="gallery-activity-icon" />
            {Number(galerie?.selectionClientsCount ?? Object.keys(galerie?.selectii || {}).length ?? 0)}
          </span>
          <span className="gallery-activity-item" title="Total favorite">
            <Heart size={12} className="gallery-activity-icon" />
            {Number(galerie?.selectionTotalCount ?? galerie?.favorite?.length ?? 0)}
          </span>
        </div>
      </div>
      <div className="gallery-row-col gallery-row-col-stat gallery-row-col-date" data-label="Data Eveniment">
        <span className="gallery-stat-label">{dataEvenimentFormatted ? `📅 ${dataEvenimentFormatted}` : '—'}</span>
      </div>
      <div className="gallery-row-col gallery-row-col-stat gallery-row-col-date" data-label={isTrashView ? 'Ștergere' : 'Status'}>
        {isTrashView && daysUntilAutoDelete != null ? (
          <span className="gallery-stat-label gallery-trash-days" title="Zile rămase până la ștergere automată recomandată">
            {daysUntilAutoDelete > 0
              ? `${daysUntilAutoDelete} zile până la ștergere`
              : 'Expirat pentru ștergere'}
          </span>
        ) : (
          <>
            <span className={`gallery-stat-status ${isExpired ? 'gallery-stat-status-expirat' : 'gallery-stat-status-activ'}`}>
              {isExpired ? 'Expirat' : 'Activ'}
            </span>
            {dataExpirareFormatted && (
              <span className="gallery-stat-label" style={{ display: 'block', fontSize: '11px', color: '#86868b', marginTop: 2 }}>
                {isExpired ? `Expirat: ${dataExpirareFormatted}` : `Expiră: ${dataExpirareFormatted}`}
              </span>
            )}
          </>
        )}
      </div>
      <div className="gallery-row-col gallery-row-col-actions" ref={menuRef}>
        {!isTrashView && (
          <div className="gallery-row-quick-actions">
            <button type="button" className="gallery-row-quick-btn" onClick={handleCopy} title="Copiază link">
              <Link2 size={16} />
              {copyTooltip && <span className="gallery-row-copy-tooltip">Copiat!</span>}
            </button>
            <button type="button" className="gallery-row-quick-btn" onClick={handleShare} title="Share">
              <Share2 size={16} />
            </button>
            {showArchiveBtn && (
              <button
                type="button"
                className="gallery-row-quick-btn"
                onClick={(e) => { e.stopPropagation(); onArchive(galerie?.id); }}
                title="Arhivează"
              >
                <Archive size={16} />
              </button>
            )}
          </div>
        )}
        {isTrashView && (
          <button
            type="button"
            className="gallery-row-restore-btn"
            onClick={(e) => { e.stopPropagation(); onRestore?.(galerie?.id); }}
          >
            Restaurare
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="gallery-row-kebab-btn"
          title="Meniu acțiuni"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <MoreVertical size={20} />
        </button>
        {menuOpen && (
          <div className="gallery-row-menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="gallery-row-menu-item"
              onClick={() => { setMenuOpen(false); onOpenSettings?.(galerie); }}
            >
              <Settings size={16} />
              <span>Setări Galerie</span>
            </button>
            <button
              type="button"
              className="gallery-row-menu-item"
              onClick={() => { setMenuOpen(false); onPreview?.(galerie); }}
            >
              <Eye size={16} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              className="gallery-row-menu-item"
              onClick={() => { setMenuOpen(false); onTogglePin?.(galerie?.id); }}
            >
              <Pin size={16} />
              <span>Pin gallery</span>
            </button>
            {showUnarchiveInMenu && (
              <button
                type="button"
                className="gallery-row-menu-item"
                onClick={() => { setMenuOpen(false); onUnarchive(galerie?.id); }}
              >
                <ArchiveRestore size={16} />
                <span>Restaurare din arhivă</span>
              </button>
            )}
            <button
              type="button"
              className="gallery-row-menu-item gallery-row-menu-item-danger"
              onClick={() => {
                setMenuOpen(false)
                if (isTrashView) {
                  if (window.confirm('Sigur vrei să ștergi definitiv această galerie? Nu poate fi recuperată.')) {
                    onDeletePermanently?.(galerie?.id)
                  }
                } else {
                  if (window.confirm('Sigur vrei să ștergi această galerie?')) {
                    onMoveToTrash?.(galerie?.id)
                  }
                }
              }}
            >
              <Trash2 size={16} />
              <span>{isTrashView ? 'Șterge definitiv' : 'Delete gallery'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminGalleryTable({
  user,
  galerii,
  loading,
  activeTab,
  userPlan: userPlanProp,
  storageLimit: storageLimitProp,
  onDeschideGalerie,
  onMoveToTrash,
  onDeletePermanently,
  onRestore,
  onPreview,
  onGalleryArchived,
  onGalleryUnarchived
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Toate categoriile')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showAddGalerie, setShowAddGalerie] = useState(false)
  const [formFiles, setFormFiles] = useState([])
  const [selectedGaleriiIds, setSelectedGaleriiIds] = useState([])
  const [dragOverlayVisible, setDragOverlayVisible] = useState(false)
  const dragCounterRef = useRef(0)
  const [pinnedGaleriiIds, setPinnedGaleriiIds] = useState(() => readPinnedIdsFromStorage())
  const [settingsGalerie, setSettingsGalerie] = useState(null)

  useEffect(() => {
    // One-time migration from old key name to the Mina key name.
    const migrated = readPinnedIdsFromStorage()
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(migrated))
  }, [])

  const handleTogglePin = (galerieId) => {
    setPinnedGaleriiIds((prev) => {
      const next = prev.includes(galerieId)
        ? prev.filter((id) => id !== galerieId)
        : [...prev, galerieId]
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleArchive = async (id) => {
    try {
      await galleriesService.updateGallery(id, { status: 'archived' })
      onGalleryArchived?.(id)
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la arhivare!')
    }
  }

  const handleUnarchive = async (id) => {
    try {
      await galleriesService.updateGallery(id, { status: 'active' })
      onGalleryUnarchived?.(id)
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la restaurare din arhivă!')
    }
  }

  const handleToggleSelect = (id, checked) => {
    setSelectedGaleriiIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    )
  }

  const handleBulkPin = () => {
    setPinnedGaleriiIds((prev) => {
      const next = [...new Set([...prev, ...selectedGaleriiIds])]
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next))
      return next
    })
    setSelectedGaleriiIds([])
  }

  const handleMoveToTrashWithCleanup = async (id) => {
    await onMoveToTrash?.(id)
    setPinnedGaleriiIds((prev) => {
      const next = prev.filter((x) => x !== id)
      if (next.length !== prev.length) localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleBulkMoveToTrash = async () => {
    if (!selectedGaleriiIds.length || !window.confirm(`Ștergi ${selectedGaleriiIds.length} galerii?`)) return
    for (const id of selectedGaleriiIds) {
      await handleMoveToTrashWithCleanup(id)
    }
    setSelectedGaleriiIds([])
  }

  const filteredGalerii = useMemo(() => {
    let list = galerii
    if (activeTab === 'trash') {
      list = list.filter(g => g?.status === 'trash')
    } else if (activeTab === 'galerii') {
      if (statusFilter === 'active') {
        list = list.filter(g => g?.status !== 'trash' && g?.status !== 'archived')
      } else {
        list = list.filter(g => g?.status === 'archived')
      }
    } else {
      return []
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      list = list.filter(g => (g?.nume || '').toLowerCase().includes(term))
    }
    if (activeTab === 'galerii' && statusFilter === 'active' && categoryFilter && categoryFilter !== 'Toate categoriile') {
      list = list.filter(g => g?.categoria === categoryFilter)
    }
    return list
  }, [galerii, searchTerm, activeTab, categoryFilter, statusFilter])

  const { pinnedGalerii, restGalerii } = useMemo(() => {
    if (activeTab !== 'galerii') return { pinnedGalerii: [], restGalerii: filteredGalerii }
    const pinned = filteredGalerii.filter(g => pinnedGaleriiIds.includes(g?.id))
    const rest = filteredGalerii.filter(g => !pinnedGaleriiIds.includes(g?.id))
    return { pinnedGalerii: pinned, restGalerii: rest }
  }, [filteredGalerii, activeTab, pinnedGaleriiIds])

  useEffect(() => {
    if (activeTab !== 'galerii') {
      setSelectedGaleriiIds([])
      return
    }
    const hasFiles = (e) => e.dataTransfer?.types?.includes('Files')
    const onDragEnter = (e) => {
      if (!hasFiles(e)) return
      dragCounterRef.current++
      const files = e.dataTransfer?.items
      if (files && Array.from(files).some((i) => i.kind === 'file')) {
        setDragOverlayVisible(true)
      }
    }
    const onDragLeave = (e) => {
      if (!hasFiles(e)) return
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setDragOverlayVisible(false)
      }
    }
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragCounterRef.current = 0
      setDragOverlayVisible(false)
      const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
      if (files.length > 0) {
        setFormFiles(files)
        setShowAddGalerie(true)
      }
    }
    const onDragOver = (e) => { if (hasFiles(e)) e.preventDefault() }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragover', onDragOver)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragover', onDragOver)
    }
  }, [activeTab])

  const totalPoze = galerii.reduce((sum, g) => sum + (g?.poze || 0), 0)
  const totalStorageBytes = galerii.reduce((sum, g) => sum + Number(g?.storageBytes || 0), 0)
  const planName = userPlanProp ?? user?.plan ?? 'Free'
  const planLimitGB = storageLimitProp ?? PLAN_LIMITS_GB[planName] ?? 15
  const storageUsedGB = Number((totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2))
  const storagePercent = Math.min(100, (storageUsedGB / planLimitGB) * 100)

  const handleFormSuccess = () => {
    setShowAddGalerie(false)
    setFormFiles([])
  }

  const handleFormCancel = () => {
    setShowAddGalerie(false)
    setFormFiles([])
  }

  const isArchivedView = activeTab === 'galerii' && statusFilter === 'archived'
  const showStatusToggle = activeTab === 'galerii'
  const showAddButton = activeTab === 'galerii' && statusFilter === 'active'

  return (
    <>
      <div className="dashboard-controlbar">
        <div className="dashboard-controlbar-left">
          {showStatusToggle && (
            <div className="gallery-status-toggle">
              <button
                type="button"
                className={`gallery-status-btn ${statusFilter === 'active' ? 'active' : ''}`}
                onClick={() => setStatusFilter('active')}
              >
                Active
              </button>
              <button
                type="button"
                className={`gallery-status-btn ${statusFilter === 'archived' ? 'active' : ''}`}
                onClick={() => setStatusFilter('archived')}
              >
                Arhivate
              </button>
            </div>
          )}
          <div className="dashboard-search-wrap">
            <IconSearch />
            <input
              type="search"
              placeholder="Caută galerii..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="dashboard-search-input"
            />
          </div>
          {activeTab === 'galerii' && statusFilter === 'active' && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="dashboard-category-select"
            >
              {CATEGORII_FILTRU.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>
        <div className="dashboard-controlbar-right">
          <div className="dashboard-storage-wrap">
            <span className="dashboard-storage-text">{storageUsedGB} GB folosiți din {planLimitGB} GB</span>
            <div className="dashboard-storage-bar">
              <div className="dashboard-storage-fill" style={{ width: `${storagePercent}%` }} />
            </div>
          </div>
          <div className="dashboard-mini-stats">
            {galerii.length} Galerii • {totalPoze} Poze • Plan: {planName}
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              {activeTab === 'trash' ? 'Coș de gunoi' : statusFilter === 'archived' ? 'Galerii arhivate' : 'Galeriile mele'}
            </h2>
            {showAddButton && (
              <button
                onClick={() => {
                  setShowAddGalerie((v) => !v)
                  if (showAddGalerie) setFormFiles([])
                }}
                className="btn-primary dashboard-add-galerie-btn"
              >
                {showAddGalerie ? 'Anulează' : '+ Adaugă galerie'}
              </button>
            )}
          </div>

          {showAddButton && showAddGalerie && (
            <AdminGalleryForm
              user={user}
              onSuccess={handleFormSuccess}
              onCancel={() => { setShowAddGalerie(false); setFormFiles([]); }}
              initialFiles={formFiles}
            />
          )}

          {loading ? (
            <div className="gallery-list-loading"><p>Se încarcă galeriile...</p></div>
          ) : filteredGalerii.length === 0 ? (
            activeTab === 'galerii' && statusFilter === 'active' && !searchTerm.trim() && categoryFilter === 'Toate categoriile' ? (
              <div className="gallery-empty-state">
                <ImagePlus size={48} className="gallery-empty-icon" />
                <p className="gallery-empty-text">Începe prin a crea prima ta galerie</p>
                <button
                  type="button"
                  className="btn-primary gallery-empty-btn"
                  onClick={() => setShowAddGalerie(true)}
                >
                  Adaugă Galerie
                </button>
              </div>
            ) : (
              <div className="gallery-list-empty">
                <p>
                  {activeTab === 'trash'
                    ? (searchTerm ? `Nicio galerie în coș pentru „${searchTerm}"` : 'Coșul de gunoi este gol.')
                    : statusFilter === 'archived'
                      ? 'Nicio galerie arhivată.'
                      : `Nicio galerie găsită pentru filtrele selectate`}
                </p>
              </div>
            )
          ) : (
            <div className="gallery-list-wrapper">
              {activeTab === 'galerii' && pinnedGalerii.length > 0 && (
                <div className="gallery-list-section">
                  <h3 className="gallery-section-title">Importante</h3>
                  <div className="gallery-list-premium">
                    {pinnedGalerii.map((galerie) => (
                      <GalleryRow
                        key={galerie.id}
                        galerie={galerie}
                        user={user}
                        onDeschide={onDeschideGalerie}
                        onMoveToTrash={handleMoveToTrashWithCleanup}
                        onDeletePermanently={onDeletePermanently}
                        onRestore={onRestore}
                        onPreview={onPreview}
                        isPinned={true}
                        onTogglePin={handleTogglePin}
                        isTrashView={false}
                        isArchivedView={isArchivedView}
                        isSelected={selectedGaleriiIds.includes(galerie.id)}
                        onToggleSelect={handleToggleSelect}
                        onArchive={handleArchive}
                        onUnarchive={handleUnarchive}
                        onOpenSettings={setSettingsGalerie}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(activeTab === 'trash' ? filteredGalerii.length > 0 : restGalerii.length > 0) && (
                <div className="gallery-list-section">
                  {activeTab === 'galerii' && restGalerii.length > 0 && <h3 className="gallery-section-title">Toate galeriile</h3>}
                  <div className="gallery-list-premium">
                    {(activeTab === 'trash' ? filteredGalerii : restGalerii).map((galerie) => (
                      <GalleryRow
                        key={galerie.id}
                        galerie={galerie}
                        user={user}
                        onDeschide={onDeschideGalerie}
                        onMoveToTrash={handleMoveToTrashWithCleanup}
                        onDeletePermanently={onDeletePermanently}
                        onRestore={onRestore}
                        onPreview={onPreview}
                        isPinned={pinnedGaleriiIds.includes(galerie.id)}
                        onTogglePin={handleTogglePin}
                        isTrashView={activeTab === 'trash'}
                        isArchivedView={isArchivedView}
                        isSelected={selectedGaleriiIds.includes(galerie.id)}
                        onToggleSelect={activeTab === 'galerii' ? handleToggleSelect : undefined}
                        onArchive={handleArchive}
                        onUnarchive={handleUnarchive}
                        onOpenSettings={setSettingsGalerie}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <GallerySettingsModal
            galerie={settingsGalerie}
            open={!!settingsGalerie}
            onClose={() => setSettingsGalerie(null)}
          />
        </div>
      </div>

      {activeTab === 'galerii' && statusFilter === 'active' && dragOverlayVisible && (
        <div
          className="gallery-drag-overlay"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
            if (files.length > 0) {
              setFormFiles(files)
              setShowAddGalerie(true)
            }
            dragCounterRef.current = 0
            setDragOverlayVisible(false)
          }}
          onDragLeave={() => { dragCounterRef.current = 0; setDragOverlayVisible(false); }}
        >
          <p className="gallery-drag-overlay-text">Trage pozele aici pentru a crea o galerie nouă</p>
        </div>
      )}

      {activeTab === 'galerii' && statusFilter === 'active' && selectedGaleriiIds.length > 0 && (
        <div className="gallery-bulk-bar">
          <span className="gallery-bulk-count">{selectedGaleriiIds.length} selectate</span>
          <button type="button" className="gallery-bulk-btn gallery-bulk-btn-pin" onClick={handleBulkPin}>
            <Pin size={18} /> Pin
          </button>
          <button type="button" className="gallery-bulk-btn gallery-bulk-btn-delete" onClick={handleBulkMoveToTrash}>
            <Trash2 size={18} /> Șterge
          </button>
          <button type="button" className="gallery-bulk-btn gallery-bulk-btn-cancel" onClick={() => setSelectedGaleriiIds([])}>
            Anulează selecția
          </button>
        </div>
      )}
    </>
  )
}
