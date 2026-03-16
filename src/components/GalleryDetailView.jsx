import { useEffect, useMemo, useRef, useState } from 'react'
import Masonry from 'react-masonry-css'
import { FolderPlus, Pencil, Settings, Trash2 } from 'lucide-react'
import AdminSelections from './AdminSelections'
import GallerySettingsModal from './GallerySettingsModal'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { getGalleryPublicPath } from '../utils/publicLinks'

const { media: mediaService } = getAppServices()
const DEFAULT_FOLDER_ID = 'default'
const DEFAULT_FOLDER_NAME = 'Galeria mea'
const uploadProgressOverlayCss = `
  .gallery-upload-progress-overlay {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    padding: 20px 32px;
    min-width: 360px;
    z-index: 1000;
    box-sizing: border-box;
  }

  .gallery-upload-progress-overlay__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .gallery-upload-progress-overlay__count {
    color: #1d1d1f;
    font-size: 16px;
    font-weight: 700;
  }

  .gallery-upload-progress-overlay__speed {
    color: #86868b;
    font-size: 14px;
    font-weight: 500;
  }

  .gallery-upload-progress-overlay__bar {
    display: block;
    width: 100%;
    height: 6px;
    border: none;
    border-radius: 3px;
    overflow: hidden;
    background: #f0f0f0;
    appearance: none;
    -webkit-appearance: none;
  }

  .gallery-upload-progress-overlay__bar::-webkit-progress-bar {
    background: #f0f0f0;
    border-radius: 3px;
  }

  .gallery-upload-progress-overlay__bar::-webkit-progress-value {
    background: #1d1d1f;
    border-radius: 3px;
  }

  .gallery-upload-progress-overlay__bar::-moz-progress-bar {
    background: #1d1d1f;
    border-radius: 3px;
  }

  .gallery-upload-progress-overlay__percent {
    margin-top: 10px;
    color: #86868b;
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 440px) {
    .gallery-upload-progress-overlay {
      right: 16px;
      bottom: 16px;
      left: 16px;
      transform: none;
      min-width: 0;
      padding: 18px 20px;
    }
  }
`

function GalleryPhotoTile({ photo, onDeletePoza, isSelected, onToggleSelect, selectionMode }) {
  const [thumbUrl, setThumbUrl] = useState(photo?.url || null)
  const longPressRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let createdUrl = ''

    if (photo?.url) {
      setThumbUrl(photo.url)
      return () => {}
    }

    setThumbUrl(null)
    if (!photo?.key) return () => {}

    mediaService.getPhotoUrl(photo.key, 'thumb')
      .then((url) => {
        if (cancelled) {
          if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
          return
        }
        createdUrl = url
        setThumbUrl(url)
      })
      .catch(() => {
      })

    return () => {
      cancelled = true
      if (createdUrl && createdUrl.startsWith('blob:')) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [photo?.key, photo?.url])

  const handleMouseDown = () => {
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      onToggleSelect?.(photo.key)
    }, 500)
  }

  const handleMouseUp = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const handleClick = (e) => {
    if (selectionMode) {
      e.preventDefault()
      e.stopPropagation()
      onToggleSelect?.(photo.key)
    }
  }

  return (
    <div
      className={`dashboard-masonry-item${isSelected ? ' is-selected' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onClick={handleClick}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt="Poză galerie" className="dashboard-masonry-img" loading="lazy" />
      ) : (
        <div className="dashboard-masonry-placeholder" />
      )}
      <button
        className={`gallery-photo-checkbox${isSelected ? ' gallery-photo-checkbox--checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(photo.key) }}
        aria-label="Selectează poza"
        tabIndex={-1}
      >
        {isSelected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (!selectionMode) onDeletePoza(photo.key) }}
        className="dashboard-delete-poza-btn"
      >
        ×
      </button>
    </div>
  )
}

/**
 * Gallery detail view: header, folders, AdminSelections, photo grid.
 */
export default function GalleryDetailView({
  galerie,
  pozeGalerie,
  allPozeGalerie = [],
  loadingPoze,
  loadingFolders = false,
  galleryFolders = [],
  activeFolderId = DEFAULT_FOLDER_ID,
  user,
  uploading = false,
  uploadProgress = 0,
  uploadedCount = 0,
  totalCount = 0,
  uploadedBytes = 0,
  uploadStartedAt = null,
  fileInputRef,
  onBack,
  onPreview,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onUploadPoze,
  onCancelUpload,
  onDeletePoza,
  onBatchDeletePoza,
  onDeleteGallery
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const skipBlurSaveRef = useRef(false)

  const selectionMode = selectedKeys.size > 0

  const toggleSelect = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => {
    setSelectedKeys(new Set(pozeGalerie.map((p) => p.key)))
  }

  const clearSelection = () => {
    setSelectedKeys(new Set())
  }

  const handleBatchDelete = async () => {
    if (batchDeleting || selectedKeys.size === 0) return
    setBatchDeleting(true)
    try {
      await onBatchDeletePoza?.(Array.from(selectedKeys))
      clearSelection()
    } finally {
      setBatchDeleting(false)
    }
  }

  useEffect(() => {
    if (!selectionMode) return
    const handler = (e) => { if (e.key === 'Escape') clearSelection() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectionMode])
  const getEffectiveFolderId = (folderId) => String(folderId || '').trim() || DEFAULT_FOLDER_ID

  const masonryBreakpoints = {
    default: 4,
    1200: 3,
    800: 2,
    500: 1
  }

  useEffect(() => {
    if (!uploading || !uploadStartedAt) return undefined

    setNow(Date.now())
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => window.clearInterval(intervalId)
  }, [uploadStartedAt, uploading])

  const totalPhotosCount = Array.isArray(allPozeGalerie) ? allPozeGalerie.length : pozeGalerie.length
  const hasExplicitFolders = galleryFolders.length > 0
  const defaultPhotosCount = hasExplicitFolders
    ? allPozeGalerie.filter((photo) => getEffectiveFolderId(photo?.folderId) === DEFAULT_FOLDER_ID).length
    : totalPhotosCount
  // Keep "Galeria mea" visible during an active upload: newly-uploaded photos
  // aren't in allPozeGalerie yet, so defaultPhotosCount may be 0 even when
  // the upload is targeting the default folder.
  const showDefaultTab = !hasExplicitFolders || defaultPhotosCount > 0 || uploading
  const defaultFolder = useMemo(
    () => ({ id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME, photoCount: defaultPhotosCount }),
    [defaultPhotosCount]
  )
  const selectedFolder = useMemo(
    () => galleryFolders.find((folder) => folder.id === activeFolderId) || (
      activeFolderId === DEFAULT_FOLDER_ID && showDefaultTab
        ? defaultFolder
        : null
    ),
    [activeFolderId, defaultFolder, galleryFolders, showDefaultTab]
  )
  const subtitle = activeFolderId === DEFAULT_FOLDER_ID
    ? (hasExplicitFolders
      ? `${DEFAULT_FOLDER_NAME} • ${pozeGalerie.length} din ${totalPhotosCount} poze`
      : `${DEFAULT_FOLDER_NAME} • ${totalPhotosCount} poze`)
    : `${selectedFolder?.name || 'Folder'} • ${pozeGalerie.length} din ${totalPhotosCount} poze`
  const elapsedSeconds = uploadStartedAt
    ? Math.max((now - uploadStartedAt) / 1000, 0.001)
    : 0
  const uploadSpeedMbPerSecond = elapsedSeconds > 0
    ? uploadedBytes / (1024 * 1024) / elapsedSeconds
    : 0

  useEffect(() => {
    if (!editingFolderId) return
    if (editingFolderId === DEFAULT_FOLDER_ID) {
      if (!showDefaultTab) {
        setEditingFolderId(null)
        setEditingFolderName('')
        setRenamingFolderId(null)
      }
      return
    }
    if (!galleryFolders.some((folder) => folder.id === editingFolderId)) {
      setEditingFolderId(null)
      setEditingFolderName('')
      setRenamingFolderId(null)
    }
  }, [editingFolderId, galleryFolders, showDefaultTab])

  const startFolderRename = (folder) => {
    setEditingFolderId(folder.id)
    setEditingFolderName(folder.name || '')
  }

  const cancelFolderRename = () => {
    setEditingFolderId(null)
    setEditingFolderName('')
    setRenamingFolderId(null)
  }

  const saveFolderRename = async (folder) => {
    const nextName = String(editingFolderName || '').trim()
    if (!folder?.id) return
    if (!nextName) {
      cancelFolderRename()
      return
    }
    if (nextName === String(folder.name || '').trim()) {
      cancelFolderRename()
      return
    }

    setRenamingFolderId(folder.id)
    try {
      await onRenameFolder?.(folder.id, nextName)
      cancelFolderRename()
    } catch (_) {
    } finally {
      setRenamingFolderId(null)
    }
  }

  return (
    <div className="dashboard-root">
      <div className="dashboard-gallery-header">
        <div className="dashboard-header-left">
          <button onClick={onBack} className="dashboard-back-btn">
            ← Înapoi
          </button>
          <div>
            <h2 className="dashboard-gallery-title">{galerie.nume}</h2>
            <p className="dashboard-gallery-subtitle">{subtitle}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={onUploadPoze}
            className="dashboard-file-input-hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary dashboard-add-poze-btn"
          >
            {uploading ? `${uploadProgress}%` : '+ Adaugă poze'}
          </button>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="dashboard-settings-btn"
            title="Setări galerie"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => {
              if (onPreview) onPreview(galerie)
              else {
                const previewPath = getGalleryPublicPath(galerie)
                if (previewPath) window.open(previewPath, '_blank')
              }
            }}
            className="dashboard-preview-btn"
          >
            Preview Client
          </button>
        </div>
      </div>

      <div className="dashboard-folders-section">
        <div className="dashboard-folders-list">
          {showDefaultTab && (
            <div
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {editingFolderId === DEFAULT_FOLDER_ID ? (
                <input
                  type="text"
                  value={editingFolderName}
                  autoFocus
                  disabled={renamingFolderId === DEFAULT_FOLDER_ID}
                  onChange={(event) => setEditingFolderName(event.target.value)}
                  onBlur={() => {
                    if (skipBlurSaveRef.current) {
                      skipBlurSaveRef.current = false
                      return
                    }
                    saveFolderRename(defaultFolder)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveFolderRename(defaultFolder)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      skipBlurSaveRef.current = true
                      cancelFolderRename()
                    }
                  }}
                  className="dashboard-folder-chip is-active"
                  style={{ minWidth: 120 }}
                />
              ) : (
                <button
                  type="button"
                  className={`dashboard-folder-chip ${activeFolderId === DEFAULT_FOLDER_ID ? 'is-active' : ''}`}
                  onClick={() => onSelectFolder?.(DEFAULT_FOLDER_ID)}
                >
                  <span>{DEFAULT_FOLDER_NAME}</span>
                  <span className="dashboard-folder-chip-count">{defaultPhotosCount}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => startFolderRename(defaultFolder)}
                disabled={renamingFolderId === DEFAULT_FOLDER_ID}
                aria-label={`Redenumește folderul ${DEFAULT_FOLDER_NAME}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#86868b',
                  padding: 4,
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Pencil size={12} />
              </button>
            </div>
          )}

          {hasExplicitFolders && galleryFolders.map((folder) => (
            <div
              key={folder.id}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {editingFolderId === folder.id ? (
                <input
                  type="text"
                  value={editingFolderName}
                  autoFocus
                  disabled={renamingFolderId === folder.id}
                  onChange={(event) => setEditingFolderName(event.target.value)}
                  onBlur={() => {
                    if (skipBlurSaveRef.current) {
                      skipBlurSaveRef.current = false
                      return
                    }
                    saveFolderRename(folder)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveFolderRename(folder)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      skipBlurSaveRef.current = true
                      cancelFolderRename()
                    }
                  }}
                  className="dashboard-folder-chip is-active"
                  style={{ minWidth: 120 }}
                />
              ) : (
                <button
                  type="button"
                  className={`dashboard-folder-chip ${activeFolderId === folder.id ? 'is-active' : ''}`}
                  onClick={() => onSelectFolder?.(folder.id)}
                  title={folder.name}
                >
                  <span>{folder.name}</span>
                  <span className="dashboard-folder-chip-count">{Number(folder.photoCount || 0)}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => startFolderRename(folder)}
                disabled={renamingFolderId === folder.id}
                aria-label={`Redenumește folderul ${folder.name}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#86868b',
                  padding: 4,
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Pencil size={12} />
              </button>
            </div>
          ))}

          {loadingFolders && (
            <span className="dashboard-folder-loading">Se încarcă foldere...</span>
          )}
        </div>

        <div className="dashboard-folders-actions">
          <button
            type="button"
            className="dashboard-folder-add-btn"
            onClick={() => onCreateFolder?.()}
          >
            <FolderPlus size={16} />
            <span>Folder nou</span>
          </button>

          {hasExplicitFolders && (
            <button
              type="button"
              className="dashboard-folder-delete-btn"
              onClick={() => onDeleteFolder?.(activeFolderId)}
            >
              <Trash2 size={16} />
              <span>Șterge folderul</span>
            </button>
          )}
        </div>
      </div>

      <AdminSelections galerie={galerie} userId={user?.uid} />

      <div className="dashboard-gallery-content">
        {loadingPoze ? (
          <div className="dashboard-loading-state">
            <p>Se încarcă pozele...</p>
          </div>
        ) : pozeGalerie.length === 0 ? (
          <div className="dashboard-empty-state">
            <p className="dashboard-empty-icon">📸</p>
            <p className="dashboard-empty-text">
              {activeFolderId === DEFAULT_FOLDER_ID ? 'Galeria mea nu are poze încă' : 'Acest folder nu are poze încă'}
            </p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
              + Adaugă prima poză
            </button>
          </div>
        ) : (
          <>
            <Masonry
              breakpointCols={masonryBreakpoints}
              className="masonry-grid"
              columnClassName="masonry-grid_column"
            >
              {pozeGalerie.map((poza) => (
                <GalleryPhotoTile
                  key={poza.key}
                  photo={poza}
                  onDeletePoza={onDeletePoza}
                  isSelected={selectedKeys.has(poza.key)}
                  onToggleSelect={toggleSelect}
                  selectionMode={selectionMode}
                />
              ))}
            </Masonry>

            {selectionMode && (
              <div className="gallery-selection-toolbar">
                <span className="gallery-selection-toolbar__count">
                  {selectedKeys.size} {selectedKeys.size === 1 ? 'fotografie selectată' : 'fotografii selectate'}
                </span>
                <button className="gallery-selection-toolbar__btn" onClick={selectAll}>
                  Selectează tot
                </button>
                <button className="gallery-selection-toolbar__btn" onClick={clearSelection}>
                  Anulează selecția
                </button>
                <button
                  className="gallery-selection-toolbar__btn gallery-selection-toolbar__btn--delete"
                  onClick={handleBatchDelete}
                  disabled={batchDeleting}
                >
                  {batchDeleting ? 'Se șterge...' : `Șterge ${selectedKeys.size} ${selectedKeys.size === 1 ? 'poză' : 'poze'}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <GallerySettingsModal
        user={user}
        galerie={galerie}
        pozeGalerie={allPozeGalerie}
        mode="edit"
        open={settingsOpen}
        onDeleted={async (galleryId) => {
          await onDeleteGallery?.(galleryId)
          setSettingsOpen(false)
          onBack?.()
        }}
        onClose={() => setSettingsOpen(false)}
      />

      {uploading && (
        <>
          <style>{uploadProgressOverlayCss}</style>
          <div className="gallery-upload-progress-overlay" role="status" aria-live="polite">
            <div className="gallery-upload-progress-overlay__row">
              <span className="gallery-upload-progress-overlay__speed">
                {uploadSpeedMbPerSecond.toFixed(1)} MB/s
              </span>
              <span className="gallery-upload-progress-overlay__count">
                {uploadedCount} / {totalCount} poze
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <progress
                className="gallery-upload-progress-overlay__bar"
                max="100"
                value={uploadProgress}
              />
              {uploading && (
                <button
                  type="button"
                  onClick={() => onCancelUpload?.()}
                  style={{ background: 'transparent', color: '#86868b', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, letterSpacing: '0.02em' }}
                >
                  ✕ Oprește
                </button>
              )}
            </div>
            <div className="gallery-upload-progress-overlay__percent">
              {uploadProgress}%
            </div>
          </div>
        </>
      )}
    </div>
  )
}
