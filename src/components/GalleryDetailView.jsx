import { useEffect, useMemo, useState } from 'react'
import Masonry from 'react-masonry-css'
import { FolderPlus, Settings, Trash2 } from 'lucide-react'
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

function GalleryPhotoTile({ photo, onDeletePoza }) {
  const [thumbUrl, setThumbUrl] = useState(photo?.url || null)

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

  return (
    <div className="dashboard-masonry-item">
      {thumbUrl ? (
        <img src={thumbUrl} alt="Poză galerie" className="dashboard-masonry-img" loading="lazy" />
      ) : (
        <div className="dashboard-masonry-placeholder" />
      )}
      <button
        onClick={() => onDeletePoza(photo.key)}
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
  onDeleteFolder,
  onUploadPoze,
  onCancelUpload,
  onDeletePoza,
  onDeleteGallery
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
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
  const showDefaultTab = !hasExplicitFolders || defaultPhotosCount > 0
  const selectedFolder = useMemo(
    () => galleryFolders.find((folder) => folder.id === activeFolderId) || (
      activeFolderId === DEFAULT_FOLDER_ID && showDefaultTab
        ? { id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME, photoCount: defaultPhotosCount }
        : null
    ),
    [activeFolderId, defaultPhotosCount, galleryFolders, showDefaultTab]
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
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="dashboard-settings-btn"
            title="Setări galerie"
          >
            <Settings size={18} />
            <span>Setări</span>
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
      </div>

      <div className="dashboard-folders-section">
        <div className="dashboard-folders-list">
          {showDefaultTab && (
            <button
              type="button"
              className={`dashboard-folder-chip ${activeFolderId === DEFAULT_FOLDER_ID ? 'is-active' : ''}`}
              onClick={() => onSelectFolder?.(DEFAULT_FOLDER_ID)}
            >
              <span>{DEFAULT_FOLDER_NAME}</span>
              <span className="dashboard-folder-chip-count">{defaultPhotosCount}</span>
            </button>
          )}

          {hasExplicitFolders && galleryFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`dashboard-folder-chip ${activeFolderId === folder.id ? 'is-active' : ''}`}
                onClick={() => onSelectFolder?.(folder.id)}
                title={folder.name}
              >
                <span>{folder.name}</span>
                <span className="dashboard-folder-chip-count">{Number(folder.photoCount || 0)}</span>
              </button>
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

          {hasExplicitFolders && activeFolderId !== DEFAULT_FOLDER_ID && (
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
          <Masonry
            breakpointCols={masonryBreakpoints}
            className="masonry-grid"
            columnClassName="masonry-grid_column"
          >
            {pozeGalerie.map((poza) => (
              <GalleryPhotoTile key={poza.key} photo={poza} onDeletePoza={onDeletePoza} />
            ))}
          </Masonry>
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
