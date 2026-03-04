import { useEffect, useMemo, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { UploadCloud, X, Trash2 } from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import {
  buildGalleryFormState,
  buildGalleryPayload,
  STORAGE_DURATION_OPTIONS,
} from '../utils/gallerySettings'

const {
  auth: authService,
  galleries: galleriesService,
  media: mediaService,
} = getAppServices()

const TABS = [
  { key: 'main', label: 'Principal' },
  { key: 'favorites', label: 'Favorite' },
  { key: 'reviews', label: 'Recenzii' },
  { key: 'contacts', label: 'Contacte' },
  { key: 'privacy', label: 'Confidențialitate' },
]

function ToggleField({ label, checked, onChange, hint }) {
  return (
    <div className="gallery-config-toggle-row">
      <div className="gallery-config-toggle-copy">
        <p className="gallery-config-toggle-label">{label}</p>
        {hint ? <p className="gallery-config-toggle-hint">{hint}</p> : null}
      </div>
      <button
        type="button"
        className={`gallery-config-toggle ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="gallery-config-toggle-knob" />
      </button>
    </div>
  )
}

function sanitizeFileName(name) {
  return String(name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function fileLabel(fileCount) {
  if (fileCount <= 0) return 'Niciun fișier adăugat'
  if (fileCount === 1) return '1 fișier pregătit pentru upload'
  return `${fileCount} fișiere pregătite pentru upload`
}

function hasFormChanges(formState, initialSnapshot) {
  if (!initialSnapshot) return true
  const current = JSON.stringify({
    ...formState,
    privacyPassword: '',
  })
  return current !== initialSnapshot
}

function normalizeFocalPoint(value) {
  const fallback = { x: 50, y: 50 }
  if (!value || typeof value !== 'object') return fallback

  const rawX = Number(value.x)
  const rawY = Number(value.y)
  const x = Number.isFinite(rawX) ? Math.max(0, Math.min(100, rawX)) : fallback.x
  const y = Number.isFinite(rawY) ? Math.max(0, Math.min(100, rawY)) : fallback.y
  return { x, y }
}

function focalPointsAreEqual(a, b) {
  const left = normalizeFocalPoint(a)
  const right = normalizeFocalPoint(b)
  return Math.round(left.x * 10) === Math.round(right.x * 10)
    && Math.round(left.y * 10) === Math.round(right.y * 10)
}

export default function GallerySettingsModal({
  galerie,
  user,
  open,
  onClose,
  mode = 'edit',
  onCreated,
  onSaved,
  onDeleted,
  initialFiles = [],
}) {
  const isCreate = mode === 'create'
  const [activeTab, setActiveTab] = useState('main')
  const [formState, setFormState] = useState(() => buildGalleryFormState(galerie || null))
  const [pendingFiles, setPendingFiles] = useState(initialFiles)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('')
  const [coverFocalPoint, setCoverFocalPoint] = useState({ x: 50, y: 50 })
  const fileInputRef = useRef(null)
  const initialSnapshotRef = useRef('')
  const initialFocalPointRef = useRef({ x: 50, y: 50 })
  const initializedModalKeyRef = useRef('')

  useEffect(() => {
    if (!open) {
      initializedModalKeyRef.current = ''
      return
    }

    const galleryId = galerie?.id || 'create'
    const modalKey = `${mode}:${galleryId}`
    if (initializedModalKeyRef.current === modalKey) return
    initializedModalKeyRef.current = modalKey

    setActiveTab('main')
    const initialForm = buildGalleryFormState(galerie || null)
    setFormState(initialForm)
    setPendingFiles(isCreate ? [] : (Array.isArray(initialFiles) ? initialFiles : []))
    const initialFocalPoint = normalizeFocalPoint(galerie?.coverFocalPoint)
    initialFocalPointRef.current = initialFocalPoint
    setCoverFocalPoint(initialFocalPoint)
    initialSnapshotRef.current = JSON.stringify({
      ...initialForm,
      privacyPassword: '',
    })
  }, [open, galerie?.id, mode, initialFiles])

  useEffect(() => {
    if (!open || isCreate || !galerie?.coverKey) {
      setCoverPreviewUrl('')
      return
    }

    let cancelled = false

    const loadCoverPreview = async () => {
      try {
        const previewUrl = await mediaService.getPhotoUrl(galerie.coverKey, 'medium')
        if (!cancelled) setCoverPreviewUrl(previewUrl || '')
      } catch (_) {
        try {
          const fallbackUrl = await mediaService.getPhotoUrl(galerie.coverKey, 'thumb')
          if (!cancelled) setCoverPreviewUrl(fallbackUrl || '')
        } catch (_) {
          if (!cancelled) setCoverPreviewUrl('')
        }
      }
    }

    loadCoverPreview()
    return () => { cancelled = true }
  }, [open, isCreate, galerie?.coverKey])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const hasChanges = useMemo(() => {
    if (isCreate) return true
    return hasFormChanges(formState, initialSnapshotRef.current)
  }, [formState, isCreate])
  const focalPointChanged = useMemo(() => {
    if (isCreate) return false
    return !focalPointsAreEqual(coverFocalPoint, initialFocalPointRef.current)
  }, [coverFocalPoint, isCreate])

  if (!open) return null

  const requestClose = () => {
    if (saving || uploading) return
    onClose?.()
  }

  const setField = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const setSetting = (section, key, value) => {
    setFormState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [section]: {
          ...prev.settings[section],
          [key]: value,
        },
      },
    }))
  }

  const addSelectedFiles = (filesList) => {
    const imageFiles = Array.from(filesList || []).filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
    setPendingFiles((prev) => [...prev, ...imageFiles])
  }

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = (event) => {
    event.preventDefault()
    addSelectedFiles(event.dataTransfer.files)
  }

  const handleSave = async () => {
    if (!user?.uid) return
    if (!String(formState.galleryName || '').trim()) {
      alert('Numele galeriei este obligatoriu.')
      return
    }

    setSaving(true)
    try {
      const payload = await buildGalleryPayload({
        formState,
        mode: isCreate ? 'create' : 'edit',
        existingGallery: galerie,
        ownerUid: user.uid,
        ownerName: user?.name || 'Fotograf',
      })

      if (isCreate) {
        const created = await galleriesService.createGallery(payload)
        const createdGalleryId = created.id

        onCreated?.({
          id: createdGalleryId,
          ...payload,
          poze: 0,
          coverKey: '',
          storageBytes: 0,
        })
      } else if (galerie?.id) {
        await galleriesService.updateGallery(galerie.id, {
          ...payload,
          coverFocalPoint: normalizeFocalPoint(coverFocalPoint),
        })
      }

      onSaved?.()
      requestClose()
    } catch (error) {
      console.error(error)
      alert(error?.message || 'Nu am putut salva setările galeriei.')
    } finally {
      setSaving(false)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDelete = async () => {
    if (!galerie?.id) return
    const confirmed = window.confirm('Sigur vrei să ștergi această galerie? Acțiunea nu poate fi anulată.')
    if (!confirmed) return
    try {
      await onDeleted?.(galerie.id)
      onClose?.()
    } catch (error) {
      console.error(error)
      alert('Nu am putut șterge galeria.')
    }
  }

  const saveDisabled = saving
    || uploading
    || !String(formState.galleryName || '').trim()
    || (!isCreate && !hasChanges && !focalPointChanged)

  const handleCoverFocalPointClick = (event) => {
    if (!coverPreviewUrl) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100))

    setCoverFocalPoint({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    })
  }

  if (isCreate) {
    return (
      <div className="gallery-config-overlay" onClick={requestClose}>
        <div className="gallery-config-modal gallery-config-modal--create" onClick={(event) => event.stopPropagation()}>
          <div className="gallery-config-header gallery-config-header--create">
            <h3>Galerie nouă</h3>
            <button type="button" className="gallery-config-close" onClick={requestClose}>
              <X size={20} />
            </button>
          </div>

          <div className="gallery-config-body gallery-config-body--create">
            <section className="gallery-config-card gallery-config-card--create">
              <label className="gallery-config-label">Nume galerie</label>
              <input
                type="text"
                value={formState.galleryName}
                onChange={(event) => setField('galleryName', event.target.value)}
                className="gallery-config-input"
                placeholder="Ex: Nuntă Ana și Mihai"
              />

              <label className="gallery-config-label">Data eveniment</label>
              <input
                type="date"
                value={formState.shootDate}
                onChange={(event) => setField('shootDate', event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Tab') event.preventDefault()
                }}
                onPaste={(event) => event.preventDefault()}
                inputMode="none"
                className="gallery-config-input gallery-config-date-input"
              />

              <label className="gallery-config-label">Timp de stocare</label>
              <div className="gallery-config-segmented">
                <button
                  type="button"
                  className={formState.storageMode === 'lifetime' ? 'active' : ''}
                  onClick={() => setField('storageMode', 'lifetime')}
                >
                  Durată limitată
                </button>
                <button
                  type="button"
                  className={formState.storageMode === 'indefinite' ? 'active' : ''}
                  onClick={() => setField('storageMode', 'indefinite')}
                >
                  Durată nelimitată
                </button>
              </div>

              {formState.storageMode === 'lifetime' && (
                <>
                  <label className="gallery-config-label">Perioadă</label>
                  <select
                    value={formState.storageDuration}
                    onChange={(event) => setField('storageDuration', event.target.value)}
                    className="gallery-config-input"
                  >
                    {STORAGE_DURATION_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="gallery-config-create-toggle-wrap">
                <ToggleField
                  label="Permite descărcarea fișierelor originale"
                  checked={!!formState.settings.main.allowOriginalDownloads}
                  onChange={(value) => setSetting('main', 'allowOriginalDownloads', value)}
                />
              </div>
            </section>
          </div>

          <div className="gallery-config-footer gallery-config-footer--create">
            <div className="gallery-config-actions gallery-config-actions--create">
              <button type="button" className="btn-secondary" onClick={requestClose} disabled={saving || uploading}>
                Anulează
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saveDisabled}>
                {saving ? 'Se salvează...' : 'Creează galerie'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="gallery-config-overlay" onClick={requestClose}>
      <div className="gallery-config-modal" onClick={(event) => event.stopPropagation()}>
        <div className="gallery-config-header">
          <h3>{isCreate ? 'Galerie nouă' : 'Setări galerie'}</h3>
          <button type="button" className="gallery-config-close" onClick={requestClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gallery-config-tabs" role="tablist" aria-label="Setări galerie">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`gallery-config-tab ${activeTab === tab.key ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="gallery-config-body">
          {activeTab === 'main' && (
            <>
              <section className="gallery-config-card">
                <label className="gallery-config-label">Nume galerie</label>
                <input
                  type="text"
                  value={formState.galleryName}
                  onChange={(event) => setField('galleryName', event.target.value)}
                  className="gallery-config-input"
                  placeholder="Ex: Nuntă Ana și Mihai"
                />

                <label className="gallery-config-label">Data eveniment</label>
                <input
                  type="date"
                  value={formState.shootDate}
                  onChange={(event) => setField('shootDate', event.target.value)}
                  className="gallery-config-input"
                />

                <label className="gallery-config-label">Timp de stocare</label>
                <div className="gallery-config-segmented">
                  <button
                    type="button"
                    className={formState.storageMode === 'lifetime' ? 'active' : ''}
                    onClick={() => setField('storageMode', 'lifetime')}
                  >
                    Durată limitată
                  </button>
                  <button
                    type="button"
                    className={formState.storageMode === 'indefinite' ? 'active' : ''}
                    onClick={() => setField('storageMode', 'indefinite')}
                  >
                    Durată nelimitată
                  </button>
                </div>

                {formState.storageMode === 'lifetime' && (
                  <>
                    <select
                      value={formState.storageDuration}
                      onChange={(event) => setField('storageDuration', event.target.value)}
                      className="gallery-config-input"
                    >
                      {STORAGE_DURATION_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>

                    <label className="gallery-config-sub-label">Sau alege manual data expirării</label>
                    <input
                      type="date"
                      value={formState.storeUntil}
                      onChange={(event) => setField('storeUntil', event.target.value)}
                      className="gallery-config-input"
                    />
                  </>
                )}

              </section>

              <section className="gallery-config-card">
                <ToggleField
                  label="Permite descărcarea fișierelor originale"
                  checked={!!formState.settings.main.allowOriginalDownloads}
                  onChange={(value) => setSetting('main', 'allowOriginalDownloads', value)}
                />
                <ToggleField
                  label="Aplică watermark"
                  hint="Disponibil în etapa următoare."
                  checked={!!formState.settings.main.watermarkEnabled}
                  onChange={(value) => setSetting('main', 'watermarkEnabled', value)}
                />
              </section>

              <section className="gallery-config-card">
                <label className="gallery-config-label">Copertă galerie</label>
                {coverPreviewUrl ? (
                  <>
                    <div
                      className="gallery-config-cover-preview"
                      role="button"
                      tabIndex={0}
                      onClick={handleCoverFocalPointClick}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setCoverFocalPoint({ x: 50, y: 50 })
                        }
                      }}
                      aria-label="Setează focal point pentru copertă"
                    >
                      <img
                        src={coverPreviewUrl}
                        alt="Preview copertă"
                        className="gallery-config-cover-preview-img"
                        style={{ objectPosition: coverFocalPoint.x + '% ' + coverFocalPoint.y + '%' }}
                      />
                      <span
                        className="gallery-config-cover-focal-dot"
                        style={{ left: coverFocalPoint.x + '%', top: coverFocalPoint.y + '%' }}
                      />
                    </div>
                    <p className="gallery-config-sub-label">
                      Click pe imagine pentru a seta punctul de focus al copertei.
                    </p>
                    <p className="gallery-config-cover-focal-values">
                      X: {Math.round(coverFocalPoint.x)}% · Y: {Math.round(coverFocalPoint.y)}%
                    </p>
                  </>
                ) : (
                  <p className="gallery-config-sub-label">
                    Coperta se poate poziționa după ce galeria are cel puțin o fotografie.
                  </p>
                )}
              </section>

              {isCreate && (
                <section className="gallery-config-card">
                  <label className="gallery-config-label">Upload inițial (opțional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="dashboard-file-input-hidden"
                    onChange={(event) => addSelectedFiles(event.target.files)}
                  />

                  <div
                    className="gallery-config-upload-dropzone"
                    onDrop={handleDrop}
                    onDragOver={(event) => event.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                  >
                    <UploadCloud size={18} />
                    <span>Adaugă fotografii sau trage aici</span>
                  </div>

                  <p className="gallery-config-upload-meta">{fileLabel(pendingFiles.length)}</p>
                  {pendingFiles.length > 0 && (
                    <div className="gallery-config-upload-list">
                      {pendingFiles.slice(0, 8).map((file, index) => (
                        <div key={`${file.name}-${index}`} className="gallery-config-upload-item">
                          <span>{file.name}</span>
                          <button type="button" onClick={() => removePendingFile(index)} aria-label="Elimină fișier">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {pendingFiles.length > 8 && (
                        <p className="gallery-config-upload-more">+{pendingFiles.length - 8} fișiere</p>
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {activeTab === 'favorites' && (
            <>
              <section className="gallery-config-card">
                <ToggleField
                  label="Permite selecția de fotografii"
                  checked={!!formState.settings.favorites.allowPhotoSelection}
                  onChange={(value) => setSetting('favorites', 'allowPhotoSelection', value)}
                />

                <label className="gallery-config-label">Nume secțiune favorite</label>
                <input
                  type="text"
                  value={formState.settings.favorites.favoritesName}
                  onChange={(event) => setSetting('favorites', 'favoritesName', event.target.value)}
                  className="gallery-config-input"
                />

                <ToggleField
                  label="Limitează numărul de fotografii selectate"
                  checked={!!formState.settings.favorites.limitSelectedPhotos}
                  onChange={(value) => setSetting('favorites', 'limitSelectedPhotos', value)}
                />

                {formState.settings.favorites.limitSelectedPhotos && (
                  <input
                    type="number"
                    min="1"
                    value={formState.settings.favorites.maxSelectedPhotos || ''}
                    onChange={(event) => setSetting('favorites', 'maxSelectedPhotos', Number(event.target.value || 0))}
                    className="gallery-config-input"
                    placeholder="Ex: 40"
                  />
                )}

                <ToggleField
                  label="Permite comentarii la selecții"
                  checked={!!formState.settings.favorites.allowComments}
                  onChange={(value) => setSetting('favorites', 'allowComments', value)}
                />
              </section>

              <section className="gallery-config-card">
                <p className="gallery-config-label">Date client solicitate</p>
                <ToggleField
                  label="Solicită email"
                  checked={!!formState.settings.favorites.requireEmail}
                  onChange={(value) => setSetting('favorites', 'requireEmail', value)}
                />
                <ToggleField
                  label="Solicită număr de telefon"
                  checked={!!formState.settings.favorites.requirePhoneNumber}
                  onChange={(value) => setSetting('favorites', 'requirePhoneNumber', value)}
                />
                <ToggleField
                  label="Solicită informații adiționale"
                  checked={!!formState.settings.favorites.requireAdditionalInfo}
                  onChange={(value) => setSetting('favorites', 'requireAdditionalInfo', value)}
                />
              </section>
            </>
          )}

          {activeTab === 'reviews' && (
            <section className="gallery-config-card">
              <ToggleField
                label="Permite recenzii"
                checked={!!formState.settings.reviews.allowReviews}
                onChange={(value) => setSetting('reviews', 'allowReviews', value)}
              />

              <label className="gallery-config-label">Mesaj recenzie</label>
              <textarea
                rows="4"
                value={formState.settings.reviews.reviewMessage}
                onChange={(event) => setSetting('reviews', 'reviewMessage', event.target.value)}
                className="gallery-config-textarea"
                placeholder="Spune clientului ce tip de feedback dorești"
              />

              <ToggleField
                label="Solicită recenzie după download"
                checked={!!formState.settings.reviews.askReviewAfterDownload}
                onChange={(value) => setSetting('reviews', 'askReviewAfterDownload', value)}
              />
            </section>
          )}

          {activeTab === 'contacts' && (
            <section className="gallery-config-card">
              <ToggleField
                label="Afișează buton Share"
                checked={!!formState.settings.contacts.showShareButton}
                onChange={(value) => setSetting('contacts', 'showShareButton', value)}
              />
              <ToggleField
                label="Afișează card de business"
                checked={!!formState.settings.contacts.showBusinessCardWidget}
                onChange={(value) => setSetting('contacts', 'showBusinessCardWidget', value)}
              />
              <ToggleField
                label="Afișează numele și website-ul pe cover"
                checked={!!formState.settings.contacts.showNameWebsiteOnCover}
                onChange={(value) => setSetting('contacts', 'showNameWebsiteOnCover', value)}
              />
            </section>
          )}

          {activeTab === 'privacy' && (
            <section className="gallery-config-card">
              <ToggleField
                label="Protejează galeria cu parolă"
                hint="Varianta simplă pentru MVP."
                checked={!!formState.settings.privacy.passwordProtected}
                onChange={(value) => setSetting('privacy', 'passwordProtected', value)}
              />

              {formState.settings.privacy.passwordProtected && (
                <>
                  <label className="gallery-config-label">Parolă</label>
                  <input
                    type="password"
                    value={formState.privacyPassword}
                    onChange={(event) => setField('privacyPassword', event.target.value)}
                    className="gallery-config-input"
                    placeholder={isCreate ? 'Introdu parola galeriei' : 'Lasă gol ca să păstrezi parola actuală'}
                  />
                </>
              )}
            </section>
          )}

          {uploading && (
            <div className="gallery-config-progress">
              <div className="dashboard-progress-bar">
                <div className="dashboard-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p>Se încarcă fișierele: {uploadProgress}%</p>
            </div>
          )}
        </div>

        <div className="gallery-config-footer">
          {!isCreate && onDeleted ? (
            <button type="button" className="gallery-config-danger" onClick={handleDelete}>
              <Trash2 size={14} />
              Șterge galerie
            </button>
          ) : <span />}

          <div className="gallery-config-actions">
            <button type="button" className="btn-secondary" onClick={requestClose} disabled={saving || uploading}>
              Anulează
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saveDisabled}>
              {saving ? 'Se salvează...' : isCreate ? 'Creează galerie' : 'Salvează'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
