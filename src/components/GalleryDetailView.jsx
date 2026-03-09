import { useEffect, useMemo, useState } from 'react'
import Masonry from 'react-masonry-css'
import { FolderPlus, Settings, Trash2 } from 'lucide-react'
import AdminSelections from './AdminSelections'
import GallerySettingsModal from './GallerySettingsModal'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { getGalleryPublicPath } from '../utils/publicLinks'

const { media: mediaService } = getAppServices()

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
  activeFolderId = 'all',
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
  onDeletePoza,
  onDeleteGallery
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

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
  const selectedFolder = useMemo(
    () => galleryFolders.find((folder) => folder.id === activeFolderId) || null,
    [activeFolderId, galleryFolders]
  )
  const subtitle = activeFolderId === 'all'
    ? `${galerie.categoria || 'Galerie'} • ${totalPhotosCount} poze`
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

      {uploading && (
        <>
          <div className="dashboard-progress-bar">
            <div className="dashboard-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <div style={{ marginTop: 8, color: '#86868b', fontSize: 14 }}>
            {uploadedCount} / {totalCount} poze încărcate • {uploadSpeedMbPerSecond.toFixed(2)} MB/s
          </div>
        </>
      )}

      <div className="dashboard-folders-section">
        <div className="dashboard-folders-list">
          <button
            type="button"
            className={`dashboard-folder-chip ${activeFolderId === 'all' ? 'is-active' : ''}`}
            onClick={() => onSelectFolder?.('all')}
          >
            <span>Toate</span>
            <span className="dashboard-folder-chip-count">{totalPhotosCount}</span>
          </button>

          {galleryFolders.map((folder) => (
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

          {activeFolderId !== 'all' && (
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
              {activeFolderId === 'all' ? 'Nicio poză încă' : 'Acest folder nu are poze încă'}
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
        mode="edit"
        open={settingsOpen}
        onDeleted={async (galleryId) => {
          await onDeleteGallery?.(galleryId)
          setSettingsOpen(false)
          onBack?.()
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
