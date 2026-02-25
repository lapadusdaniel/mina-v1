import { useState, useEffect, useRef } from 'react'
import imageCompression from 'browser-image-compression'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { addMonths, toDateInputValue } from '../utils/galleryUtils'
import { CATEGORII } from '../utils/galleryUtils'

const { auth: authService, galleries: galleriesService, media: mediaService } = getAppServices()

/**
 * Form for creating a new gallery. New galleries get status: 'active'.
 */
export default function AdminGalleryForm({ user, onSuccess, onCancel, disabled, initialFiles = [] }) {
  const [numeGalerie, setNumeGalerie] = useState('')
  const [categorieGalerie, setCategorieGalerie] = useState('Nunți')
  const [dataEveniment, setDataEveniment] = useState('')
  const [dataExpirare, setDataExpirare] = useState('')
  const [formFiles, setFormFiles] = useState(initialFiles)
  const [formFileUrls, setFormFileUrls] = useState([])
  const [formUploadProgress, setFormUploadProgress] = useState(0)
  const [formUploading, setFormUploading] = useState(false)
  const formFileInputRef = useRef(null)

  useEffect(() => {
    if (!formFiles.length) {
      setFormFileUrls([])
      return
    }
    const urls = formFiles.map(f => URL.createObjectURL(f))
    setFormFileUrls(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [formFiles])


  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!numeGalerie || !user?.uid) {
      alert('Adaugă un nume pentru galerie!')
      return
    }

    const generatedSlug = numeGalerie.toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')

    try {
      const docData = {
        nume: numeGalerie,
        slug: generatedSlug,
        categoria: categorieGalerie,
        poze: 0,
        userId: user.uid,
        userName: user.name || 'Fotograf',
        data: new Date().toISOString(),
        createdAt: new Date(),
        status: 'active',
        statusActiv: true
      }
      if (dataEveniment) docData.dataEveniment = new Date(dataEveniment).toISOString()
      if (dataExpirare) docData.dataExpirare = new Date(dataExpirare).toISOString()

      const created = await galleriesService.createGallery(docData)
      const newGalerieId = created.id

      if (formFiles.length > 0) {
        setFormUploading(true)
        setFormUploadProgress(0)
        const totalSteps = formFiles.length * 3
        let completedSteps = 0

        const reportProgress = (stepIndex, percent) => {
          const overall = Math.round(((stepIndex + percent / 100) / totalSteps) * 100)
          setFormUploadProgress(Math.min(100, overall))
        }

        try {
          const idToken = await authService.getCurrentIdToken()
          let uploadedBytes = 0
          let firstOriginalKey = ''
          for (let i = 0; i < formFiles.length; i++) {
            const file = formFiles[i]
            const baseName = `${Date.now()}-${i}-${(file.name || 'image').replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const baseNameNoExt = baseName.replace(/\.[^.]+$/, '')
            const origPath = `galerii/${newGalerieId}/originals/${baseName}`
            const mediumPath = `galerii/${newGalerieId}/medium/${baseNameNoExt}.webp`
            const thumbPath = `galerii/${newGalerieId}/thumbnails/${baseNameNoExt}.webp`
            uploadedBytes += Number(file.size || 0)
            if (!firstOriginalKey) firstOriginalKey = origPath

            const [mediumFile, thumbFile] = await Promise.all([
              imageCompression(file, {
                maxWidthOrHeight: 3200,
                initialQuality: 0.92,
                useWebWorker: true,
                fileType: 'image/webp',
              }),
              imageCompression(file, {
                maxWidthOrHeight: 1200,
                initialQuality: 0.9,
                useWebWorker: true,
                fileType: 'image/webp',
              }),
            ])

            await Promise.all([
              mediaService.uploadPhoto(file, newGalerieId, user.uid, (p) => reportProgress(i * 3, p), origPath, idToken),
              mediaService.uploadPhoto(mediumFile, newGalerieId, user.uid, (p) => reportProgress(i * 3 + 1, p), mediumPath, idToken),
              mediaService.uploadPhoto(thumbFile, newGalerieId, user.uid, (p) => reportProgress(i * 3 + 2, p), thumbPath, idToken),
            ])
            completedSteps += 3
            setFormUploadProgress(Math.round((completedSteps / totalSteps) * 100))
          }
          await galleriesService.updateGallery(newGalerieId, {
            poze: formFiles.length,
            coverKey: firstOriginalKey || '',
            storageBytes: uploadedBytes,
          })
          await galleriesService.adjustUserStorageUsed(user.uid, uploadedBytes)
        } catch (uploadErr) {
          console.error('Error uploading:', uploadErr)
          alert('Galerie creată, dar a apărut o eroare la încărcarea fotografiilor.')
        } finally {
          setFormUploading(false)
          setFormUploadProgress(0)
        }
      }

      setNumeGalerie('')
      setDataEveniment('')
      setDataExpirare('')
      setFormFiles([])
      if (formFileInputRef.current) formFileInputRef.current.value = ''
      onSuccess?.()
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la adăugare galerie!')
    }
  }

  const handleFormFilesChange = (e) => {
    setFormFiles(Array.from(e.target.files || []))
  }

  const handleFormDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'))
    setFormFiles(prev => [...prev, ...files])
  }

  const handleFormDragOver = (e) => e.preventDefault()

  const removeFormFile = (index) => {
    setFormFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit} className="gallery-add-form">
      <div className="gallery-add-grid">
        <div>
          <label>Nume galerie</label>
          <input
            type="text"
            value={numeGalerie}
            onChange={(e) => setNumeGalerie(e.target.value)}
            placeholder="Ex: Nuntă Ana & Mihai"
            className="gallery-add-input"
          />
        </div>
        <div>
          <label>Categorie</label>
          <select
            value={categorieGalerie}
            onChange={(e) => setCategorieGalerie(e.target.value)}
            className="gallery-add-input gallery-add-select"
          >
            {CATEGORII.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="gallery-add-row">
        <div>
          <label>Data Evenimentului</label>
          <input
            type="date"
            value={dataEveniment}
            onChange={(e) => setDataEveniment(e.target.value)}
            className="gallery-add-input"
          />
        </div>
      </div>
      <div className="gallery-add-expiry">
        <label>Expirare</label>
        <div className="gallery-expiry-presets">
          <button type="button" onClick={() => setDataExpirare(toDateInputValue(addMonths(new Date(), 1)))}>1 Lună</button>
          <button type="button" onClick={() => setDataExpirare(toDateInputValue(addMonths(new Date(), 3)))}>3 Luni</button>
          <button type="button" onClick={() => setDataExpirare(toDateInputValue(addMonths(new Date(), 6)))}>6 Luni</button>
          <button type="button" onClick={() => setDataExpirare(toDateInputValue(addMonths(new Date(), 12)))}>1 An</button>
        </div>
        <div className="gallery-expiry-custom">
          <label>Expiră la</label>
          <input
            type="date"
            value={dataExpirare}
            onChange={(e) => setDataExpirare(e.target.value)}
            className="gallery-add-input"
          />
        </div>
      </div>
      <div className="gallery-add-upload">
        <label>Fotografii</label>
        <input
          ref={formFileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFormFilesChange}
          className="dashboard-file-input-hidden"
        />
        <div
          className="gallery-add-dropzone"
          onDrop={handleFormDrop}
          onDragOver={handleFormDragOver}
          onClick={() => formFileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); formFileInputRef.current?.click(); } }}
        >
          <span className="gallery-add-dropzone-icon">+</span>
          <span className="gallery-add-dropzone-text">Adaugă Fotografii</span>
          <span className="gallery-add-dropzone-hint">sau trage fișierele aici</span>
        </div>
        {formFiles.length > 0 && (
          <div className="gallery-add-preview">
            <p className="gallery-add-preview-count">{formFiles.length} fotografii selectate</p>
            <div className="gallery-add-thumbnails">
              {formFiles.slice(0, 8).map((file, i) => formFileUrls[i] && (
                <div key={i} className="gallery-add-thumb">
                  <img src={formFileUrls[i]} alt="" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeFormFile(i); }} className="gallery-add-thumb-remove" aria-label="Elimină">×</button>
                </div>
              ))}
              {formFiles.length > 8 && (
                <span className="gallery-add-thumb-more">+{formFiles.length - 8}</span>
              )}
            </div>
          </div>
        )}
      </div>
      {formUploading && (
        <div className="gallery-add-progress-wrap">
          <div className="dashboard-progress-bar">
            <div className="dashboard-progress-fill" style={{ width: `${formUploadProgress}%` }} />
          </div>
          <p className="gallery-add-progress-text">Se încarcă… {formUploadProgress}%</p>
        </div>
      )}
      <div className="gallery-add-actions">
        <button type="submit" className="btn-primary dashboard-save-btn gallery-add-submit-btn" disabled={formUploading || disabled}>
          {formUploading ? 'Se încarcă…' : formFiles.length > 0 ? 'Salvează și Încarcă' : 'Salvează'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Anulează
        </button>
      </div>
    </form>
  )
}
