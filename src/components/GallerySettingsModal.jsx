import { useState, useEffect } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { toDateInputValue } from '../utils/galleryUtils'

const galleriesService = getAppServices().galleries

/**
 * Modal to edit gallery settings (dataExpirare).
 * Used in GalleryDetailView and AdminGalleryTable.
 */
export default function GallerySettingsModal({ galerie, open, onClose }) {
  const [dataExpirare, setDataExpirare] = useState('')
  const [savingExpiry, setSavingExpiry] = useState(false)

  useEffect(() => {
    if (open && galerie) {
      setDataExpirare(toDateInputValue(galerie?.dataExpirare))
    }
  }, [open, galerie])

  if (!open) return null

  const handleSave = async () => {
    if (!galerie?.id) return
    setSavingExpiry(true)
    try {
      await galleriesService.setGalleryExpiry(
        galerie.id,
        dataExpirare ? new Date(dataExpirare).toISOString() : null
      )
      onClose()
    } catch (e) {
      console.error(e)
      alert('Eroare la salvare.')
    } finally {
      setSavingExpiry(false)
    }
  }

  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="dashboard-modal-title">Setări galerie</h3>
        <div className="dashboard-modal-field">
          <label>Data expirare</label>
          <input
            type="date"
            value={dataExpirare}
            onChange={(e) => setDataExpirare(e.target.value)}
            className="dashboard-modal-input"
          />
        </div>
        <div className="dashboard-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Anulează
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={savingExpiry}
            onClick={handleSave}
          >
            {savingExpiry ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}
