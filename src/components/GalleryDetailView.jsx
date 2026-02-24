import { useState } from 'react'
import Masonry from 'react-masonry-css'
import { Settings } from 'lucide-react'
import AdminSelections from './AdminSelections'
import GallerySettingsModal from './GallerySettingsModal'

/**
 * Gallery detail view: header, AdminSelections, photo grid.
 */
export default function GalleryDetailView({
  galerie,
  pozeGalerie,
  loadingPoze,
  user,
  uploading,
  uploadProgress,
  fileInputRef,
  onBack,
  onPreview,
  onUploadPoze,
  onDeletePoza
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const masonryBreakpoints = {
    default: 4,
    1200: 3,
    800: 2,
    500: 1
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
            <p className="dashboard-gallery-subtitle">
              {galerie.categoria} • {pozeGalerie.length} poze
            </p>
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
              else window.open(`/gallery/${galerie.id}`, '_blank')
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
        <div className="dashboard-progress-bar">
          <div className="dashboard-progress-fill" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <AdminSelections galerie={galerie} userId={user?.uid} />

      <div className="dashboard-gallery-content">
        {loadingPoze ? (
          <div className="dashboard-loading-state">
            <p>Se încarcă pozele...</p>
          </div>
        ) : pozeGalerie.length === 0 ? (
          <div className="dashboard-empty-state">
            <p className="dashboard-empty-icon">📸</p>
            <p className="dashboard-empty-text">Nicio poză încă</p>
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
              <div key={poza.key} className="dashboard-masonry-item">
                <img src={poza.url} alt="Poză galerie" className="dashboard-masonry-img" />
                <button
                  onClick={() => onDeletePoza(poza.key)}
                  className="dashboard-delete-poza-btn"
                >
                  ×
                </button>
              </div>
            ))}
          </Masonry>
        )}
      </div>

      <GallerySettingsModal
        galerie={galerie}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
