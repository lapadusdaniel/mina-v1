import { useEffect, useMemo, useState } from 'react'
import { Eye, Copy } from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'

const { media: mediaService, galleries: galleriesService } = getAppServices()

/**
 * AdminSelections – Client selections table for the Dashboard gallery detail view.
 * Handles: Preview thumbnails, Copy Lightroom search string, Download original selection.
 */
export default function AdminSelections({ galerie, userId }) {
  const [selectionPreviewClient, setSelectionPreviewClient] = useState(null)
  const [selectionPreviewUrls, setSelectionPreviewUrls] = useState([])
  const [selectionDownloading, setSelectionDownloading] = useState(null)
  const [selectionItems, setSelectionItems] = useState([])
  const [selectionLoading, setSelectionLoading] = useState(false)

  useEffect(() => {
    if (!galerie?.id) {
      setSelectionItems([])
      return
    }
    let cancelled = false

    const loadSelections = async () => {
      setSelectionLoading(true)
      try {
        const selections = await galleriesService.listGallerySelections(galerie.id)
        if (cancelled) return

        if (Array.isArray(selections) && selections.length > 0) {
          setSelectionItems(
            selections
              .filter((item) => Array.isArray(item?.keys) && item.keys.length > 0)
              .map((item) => ({
                clientName: item.clientName,
                keys: item.keys,
                selectionTitle: item.selectionTitle || galerie?.numeSelectieClient || 'Selecție',
              }))
          )
          return
        }

        setSelectionItems([])
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          // Emergency fallback if Firestore read fails.
          const legacyMap = galerie?.selectii || {}
          const legacyItems = Object.entries(legacyMap)
            .filter(([, keys]) => Array.isArray(keys) && keys.length > 0)
            .map(([clientName, keys]) => ({
              clientName,
              keys,
              selectionTitle: galerie?.numeSelectieClient || 'Selecție',
            }))
          setSelectionItems(legacyItems)
        }
      } finally {
        if (!cancelled) setSelectionLoading(false)
      }
    }

    loadSelections()
    return () => { cancelled = true }
  }, [galerie?.id, galerie?.selectii, galerie?.numeSelectieClient])

  const selectionsByClient = useMemo(
    () => new Map(selectionItems.map((item) => [item.clientName, item.keys])),
    [selectionItems]
  )

  const extractFilenamesForLightroom = (keys) => {
    if (!keys || !Array.isArray(keys)) return ''
    return keys
      .map(k => {
        const base = (k || '').split('/').pop() || ''
        return base.replace(/\.[^.]+$/, '')
      })
      .filter(Boolean)
      .join(' ')
  }

  const handleCopyLightroomString = (clientName) => {
    const keys = selectionsByClient.get(clientName) || []
    const str = extractFilenamesForLightroom(keys)
    if (str && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(str)
      alert('Șirul pentru Lightroom a fost copiat! Lipește-l în Library Filter → Text → Filename → Contains.')
    } else if (!str) {
      alert('Nicio poză în selecție.')
    }
  }

  const handleDownloadOriginalSelection = async (clientName) => {
    const keys = selectionsByClient.get(clientName) || []
    if (!keys.length || !galerie || !userId) return
    if (!window.confirm(`Descărci ${keys.length} imagini în rezoluție mare?`)) return

    setSelectionDownloading(clientName)
    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const url = await mediaService.getOriginalPhotoUrl(key)
        const link = document.createElement('a')
        link.href = url
        link.download = key.split('/').pop() || `image-${i + 1}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        await new Promise(r => setTimeout(r, 300))
      }
    } catch (err) {
      console.error(err)
      alert('Eroare la descărcare.')
    } finally {
      setSelectionDownloading(null)
    }
  }

  const closeSelectionPreview = () => {
    selectionPreviewUrls.forEach(({ url }) => { try { URL.revokeObjectURL(url); } catch (_) {} })
    setSelectionPreviewClient(null)
    setSelectionPreviewUrls([])
  }

  const handlePreviewSelection = async (clientName) => {
    const keys = selectionsByClient.get(clientName) || []
    if (!keys.length || !galerie || !userId) return

    setSelectionPreviewClient(clientName)
    setSelectionPreviewUrls([])
    try {
      const urls = await Promise.all(
        keys.slice(0, 24).map(async (key) => {
          const url = await mediaService.getPhotoUrl(key, 'thumb')
          return { key, url }
        })
      )
      setSelectionPreviewUrls(urls)
    } catch (err) {
      console.error(err)
      setSelectionPreviewUrls([])
    }
  }

  if (!selectionLoading && selectionItems.length === 0) return null

  return (
    <>
      <div className="dashboard-selections-section dashboard-selections-section-top">
        <h3 className="dashboard-selections-title">Selecții clienți</h3>
        <div className="dashboard-selections-table-wrap">
          <table className="dashboard-selections-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Titlu selecție</th>
                <th>Poze</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {selectionItems.map(({ clientName, keys, selectionTitle }) => (
                <tr key={clientName}>
                  <td>{clientName}</td>
                  <td>{selectionTitle || 'Selecție'}</td>
                  <td>{keys?.length ?? 0}</td>
                  <td>
                    <div className="dashboard-selections-actions">
                      <button
                        type="button"
                        className="dashboard-selections-btn dashboard-selections-btn-preview"
                        onClick={() => handlePreviewSelection(clientName)}
                        title="Preview"
                      >
                        <Eye size={14} /> Preview
                      </button>
                      <button
                        type="button"
                        className="dashboard-selections-btn"
                        onClick={() => handleCopyLightroomString(clientName)}
                        title="Copiază șir pentru Lightroom"
                      >
                        <Copy size={12} /> Lightroom
                      </button>
                      <button
                        type="button"
                        className="dashboard-selections-btn dashboard-selections-btn-download"
                        onClick={() => handleDownloadOriginalSelection(clientName)}
                        disabled={selectionDownloading === clientName}
                        title="Descarcă original în rezoluție mare"
                      >
                        {selectionDownloading === clientName ? '...' : '↓ Original'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectionPreviewClient && (
        <div
          className="dashboard-selection-preview-overlay"
          onClick={closeSelectionPreview}
          style={{ zIndex: 10000 }}
        >
          <div className="dashboard-selection-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="dashboard-selection-preview-header">
              <h4>{selectionPreviewClient} – {selectionPreviewUrls.length} poze</h4>
              <button type="button" onClick={closeSelectionPreview}>×</button>
            </div>
            <div className="dashboard-selection-preview-grid">
              {selectionPreviewUrls.map(({ key, url }) => (
                <img key={key} src={url} alt="" />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
