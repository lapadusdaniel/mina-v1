import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, Eye, ListChecks, RotateCcw, X } from 'lucide-react'
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
  const [selectionReopening, setSelectionReopening] = useState(null)
  const [selectionItems, setSelectionItems] = useState([])
  const [selectionsOpen, setSelectionsOpen] = useState(false)

  useEffect(() => {
    if (!galerie?.id) {
      setSelectionItems([])
      return
    }
    let cancelled = false

    const loadSelections = async () => {
      try {
        const selections = await galleriesService.listGallerySelections(galerie.id)
        if (cancelled) return

        if (Array.isArray(selections) && selections.length > 0) {
          setSelectionItems(
            selections
              .filter((item) => Array.isArray(item?.keys) && item.keys.length > 0)
              .map((item) => ({
                clientId: item.id,
                clientName: item.clientName,
                clientEmail: item.clientEmail || '',
                clientPhone: item.clientPhone || '',
                clientAdditionalInfo: item.clientAdditionalInfo || '',
                clientComment: item.clientComment || '',
                keys: item.keys,
                selectionTitle: item.selectionTitle || galerie?.numeSelectieClient || 'Selecție',
                status: item.status === 'finalized' ? 'finalized' : 'draft',
                finalizedAt: item.finalizedAt || null,
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
              clientId: clientName,
              clientName,
              clientEmail: '',
              clientPhone: '',
              clientAdditionalInfo: '',
              clientComment: '',
              keys,
              selectionTitle: galerie?.numeSelectieClient || 'Selecție',
              status: 'draft',
              finalizedAt: null,
            }))
          setSelectionItems(legacyItems)
        }
      }
    }

    loadSelections()
    return () => { cancelled = true }
  }, [galerie?.id, galerie?.selectii, galerie?.numeSelectieClient])

  const selectionsByClient = useMemo(
    () => new Map(selectionItems.map((item) => [item.clientName, item.keys])),
    [selectionItems]
  )
  const totalSelectedPhotos = useMemo(
    () => selectionItems.reduce((total, item) => total + (item.keys?.length || 0), 0),
    [selectionItems]
  )

  useEffect(() => {
    if (!selectionsOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectionsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectionsOpen])

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

  const handleReopenSelection = async (clientId, clientName) => {
    if (!galerie?.id || !clientId) return
    if (!window.confirm(`Redeschizi selecția pentru ${clientName}? Clientul va putea modifica din nou fotografiile alese.`)) return

    setSelectionReopening(clientId)
    try {
      await galleriesService.reopenClientSelection(galerie.id, clientId)
      setSelectionItems((current) => current.map((item) => (
        item.clientId === clientId
          ? { ...item, status: 'draft', finalizedAt: null }
          : item
      )))
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Selecția nu a putut fi redeschisă.')
    } finally {
      setSelectionReopening(null)
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

  if (selectionItems.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="dashboard-selections-trigger"
        onClick={() => setSelectionsOpen(true)}
        title="Vezi selecțiile clienților"
      >
        <ListChecks size={15} />
        <span>Selecții</span>
        <span className="dashboard-selections-trigger-count">{selectionItems.length}</span>
      </button>

      {selectionsOpen && createPortal((
        <div className="dashboard-selections-overlay" onClick={() => setSelectionsOpen(false)}>
          <aside
            className="dashboard-selections-drawer"
            aria-label="Selecții clienți"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="dashboard-selections-drawer-header">
              <div>
                <p className="dashboard-selections-eyebrow">Galeria curentă</p>
                <h3>Selecții clienți</h3>
                <p>
                  {selectionItems.length} {selectionItems.length === 1 ? 'client' : 'clienți'} · {totalSelectedPhotos} {totalSelectedPhotos === 1 ? 'fotografie' : 'fotografii'} selectate
                </p>
              </div>
              <button type="button" onClick={() => setSelectionsOpen(false)} aria-label="Închide selecțiile">
                <X size={18} />
              </button>
            </header>

            <div className="dashboard-selections-list">
              {selectionItems.map(({ clientId, clientName, clientEmail, clientPhone, clientAdditionalInfo, clientComment, keys, selectionTitle, status }, index) => (
                <article className="dashboard-selection-card" key={`${clientName}-${index}`}>
                  <div className="dashboard-selection-card-main">
                    <div className="dashboard-selection-card-identity">
                      <span className="dashboard-selection-avatar" aria-hidden="true">
                        {String(clientName || '?').trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <div>
                        <h4>{clientName}</h4>
                        <p>{selectionTitle || 'Selecție fotografii'}</p>
                        <span className={`dashboard-selection-status dashboard-selection-status--${status}`}>
                          {status === 'finalized' ? <><CheckCircle2 size={12} /> Finalizată</> : 'În lucru'}
                        </span>
                      </div>
                    </div>
                    <span className="dashboard-selection-photo-count">{keys?.length ?? 0} poze</span>
                  </div>

                  {(clientEmail || clientPhone || clientAdditionalInfo || clientComment) && (
                    <div className="dashboard-selection-card-details">
                      {clientEmail && <span><strong>Email</strong>{clientEmail}</span>}
                      {clientPhone && <span><strong>Telefon</strong>{clientPhone}</span>}
                      {clientAdditionalInfo && <span><strong>Detalii</strong>{clientAdditionalInfo}</span>}
                      {clientComment && <span><strong>Comentariu</strong>{clientComment}</span>}
                    </div>
                  )}

                  <div className="dashboard-selections-actions">
                    <button
                      type="button"
                      className="dashboard-selections-btn dashboard-selections-btn-preview"
                      onClick={() => handlePreviewSelection(clientName)}
                    >
                      <Eye size={14} /> Vezi fotografiile
                    </button>
                    <button
                      type="button"
                      className="dashboard-selections-btn"
                      onClick={() => handleCopyLightroomString(clientName)}
                      title="Copiază șir pentru Lightroom"
                    >
                      <Copy size={13} /> Copiază pentru Lightroom
                    </button>
                    <button
                      type="button"
                      className="dashboard-selections-btn dashboard-selections-btn-download"
                      onClick={() => handleDownloadOriginalSelection(clientName)}
                      disabled={selectionDownloading === clientName}
                    >
                      {selectionDownloading === clientName ? 'Se descarcă…' : '↓ Descarcă originalele'}
                    </button>
                    {status === 'finalized' && (
                      <button
                        type="button"
                        className="dashboard-selections-btn dashboard-selections-btn-reopen"
                        onClick={() => handleReopenSelection(clientId, clientName)}
                        disabled={selectionReopening === clientId}
                      >
                        <RotateCcw size={13} />
                        {selectionReopening === clientId ? 'Se redeschide…' : 'Redeschide selecția'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      ), document.body)}

      {selectionPreviewClient && createPortal((
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
      ), document.body)}
    </>
  )
}
