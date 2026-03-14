import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { increment } from 'firebase/firestore'
import './Dashboard.css'
import { useUserSubscription } from '../hooks/useUserSubscription'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { 
  Check,
  Contact, 
  Instagram, 
  Mail, 
  MessageCircle, 
  CreditCard, 
  Trash2, 
  Layout, 
  BarChart3, 
  FileText, 
  Settings as SettingsIcon 
} from 'lucide-react'
import AdminGalleryTable from './AdminGalleryTable'
import GalleryDetailView from './GalleryDetailView'
import Settings from '../pages/Settings'
import SubscriptionSection from './SubscriptionSection'
import SiteEditor from './SiteEditor'
import LaunchChecklist from './LaunchChecklist'
import { getGalleryPublicUrl } from '../utils/publicLinks'

const {
  auth: authService,
  galleries: galleriesService,
  media: mediaService,
  sites: sitesService,
} = getAppServices()

const SIDEBAR_TABS = [
  { key: 'galerii', label: 'Galerii', icon: Layout },
  { key: 'card', label: 'Card', icon: Contact },
  { key: 'trash', label: 'Coș de gunoi', icon: Trash2 },
  { key: 'site', label: 'Site-ul meu (Beta)', icon: Layout },
  { key: 'abonament', label: 'Abonament', icon: CreditCard },
  { key: 'setari', label: 'Setări', icon: SettingsIcon }
]
const TRASH_RETENTION_DAYS = 30
const ACTIVE_GALLERY_STORAGE_KEY = 'mina_active_gallery_id'
const MEDIUM_MAX_DIMENSION = 2048
const MEDIUM_QUALITY = 0.90
const THUMB_MAX_DIMENSION = 800
const THUMB_QUALITY = 0.92
const CARD_LOGO_PATH = (userId) => `branding/${userId}/logo.png`
const DEFAULT_FOLDER_ID = 'default'

function Dashboard({ user, onLogout, initialTab, theme, setTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = location.pathname === '/settings' ? 'setari' : (searchParams.get('tab') || initialTab || 'galerii')
  const [galerii, setGalerii] = useState([])
  const [loading, setLoading] = useState(true)
  const [galerieActiva, setGalerieActiva] = useState(null)
  const [pozeGalerie, setPozeGalerie] = useState([])
  const [loadingPoze, setLoadingPoze] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadTotalCount, setUploadTotalCount] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [uploadStartedAt, setUploadStartedAt] = useState(null)
  const [galleryFolders, setGalleryFolders] = useState([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [activeFolderId, setActiveFolderId] = useState(DEFAULT_FOLDER_ID)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)

  const { userPlan, storageLimit, checkAccess } = useUserSubscription(user?.uid)

  // Show success modal when returning from Stripe with ?payment=success
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('payment') === 'success') {
      setShowPaymentSuccess(true)
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, location.pathname, navigate])

  // Profile / Branding State
  const [profileData, setProfileData] = useState({
    logoUrl: '',
    numeBrand: '',
    slogan: '',
    accentColor: '#1d1d1f',
    whatsapp: '',
    instagram: '',
    email: '',
    website: '',
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [cardLogoPreview, setCardLogoPreview] = useState(null)
  const [cardLogoUploading, setCardLogoUploading] = useState(false)

  const cardLogoInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const metadataBackfillQueueRef = useRef(new Set())
  const lastSyncedStorageBytesRef = useRef(null)
  const suppressAutoReopenRef = useRef(false)
  const cancelUploadRef = useRef(false)
  const uploadSessionRef = useRef(0)

  const persistActiveGalleryId = useCallback((galleryId) => {
    try {
      if (galleryId) localStorage.setItem(ACTIVE_GALLERY_STORAGE_KEY, galleryId)
      else localStorage.removeItem(ACTIVE_GALLERY_STORAGE_KEY)
    } catch (_) {
    }
  }, [])

  const attachFolderCounts = useCallback((folders = [], photos = []) => {
    const counts = new Map()
    photos.forEach((photo) => {
      if (!photo?.folderId) return
      counts.set(photo.folderId, (counts.get(photo.folderId) || 0) + 1)
    })
    return folders.map((folder) => ({
      ...folder,
      _storedPhotoCount: Number(folder.photoCount || 0),
      photoCount: counts.get(folder.id) || 0,
    }))
  }, [])

  const syncFolderCounts = useCallback((galleryId, folders = [], photos = []) => {
    if (!galleryId || !folders.length) return
    const nextFolders = attachFolderCounts(folders, photos)
    setGalleryFolders(nextFolders)
  }, [attachFolderCounts])

  const normalizePhotoFolderId = useCallback(
    (folderId) => String(folderId || '').trim() || DEFAULT_FOLDER_ID,
    []
  )

  // Auto-cleanup: șterge galeriile din coș mai vechi de TRASH_RETENTION_DAYS (R2 + Firestore)
  useEffect(() => {
    if (!user?.uid) return
    const run = async () => {
      try {
        const retentionCutoff = new Date()
        retentionCutoff.setDate(retentionCutoff.getDate() - TRASH_RETENTION_DAYS)
        const ownerGalleries = await galleriesService.listOwnerGalleries(user.uid)
        const oldTrash = ownerGalleries.filter((g) => {
          if (g.status !== 'trash') return false
          const deletedAt = g.deletedAt?.toDate?.() || (g.deletedAt ? new Date(g.deletedAt) : null)
          if (!deletedAt || Number.isNaN(deletedAt.getTime())) return false
          return deletedAt < retentionCutoff
        })
        if (!oldTrash.length) return
        const idToken = await authService.getCurrentIdToken()
        for (const g of oldTrash) {
          try {
            await mediaService.deleteGalleryAssets(g.id, idToken, g.userId || user.uid)
            await galleriesService.deleteGallery(g.id)
            const removedBytes = Math.max(0, Number(g?.storageBytes || 0))
            if (removedBytes > 0) {
              await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
            }
          } catch (e) {
            console.warn('Trash cleanup failed for gallery', g.id, e)
          }
        }
      } catch (e) {
        console.warn('Trash cleanup query failed', e)
      }
    }
    run()
  }, [user?.uid])

  // Keep a pre-calculated per-user storage counter in Firestore for fast quota checks in Worker.
  useEffect(() => {
    if (!user?.uid) return
    const totalBytes = galerii.reduce((sum, g) => sum + Math.max(0, Number(g?.storageBytes || 0)), 0)
    if (lastSyncedStorageBytesRef.current === totalBytes) return
    lastSyncedStorageBytesRef.current = totalBytes

    galleriesService.setUserStorageUsed(user.uid, totalBytes).catch(() => {
      lastSyncedStorageBytesRef.current = null
    })
  }, [galerii, user?.uid])

  // Real-time listener pentru galerii
  useEffect(() => {
    if (!user?.uid) return
    const unsubscribe = galleriesService.watchOwnerGalleries(user.uid, (data) => {
      data.sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.data ? new Date(a.data) : null) || new Date(0)
        const dbVal = b.createdAt?.toDate?.() || (b.data ? new Date(b.data) : null) || new Date(0)
        return dbVal.getTime() - da.getTime()
      })
      setGalerii(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [user?.uid])


  // Backfill metadata o singură dată pentru galerii vechi (fără N+1 în tabelul de listă).
  useEffect(() => {
    if (!user?.uid || !galerii.length) return

    let cancelled = false

    const missingMetadata = galerii.filter((gallery) => {
      if (!gallery?.id) return false
      if (gallery.status === 'trash') return false
      const missingCover = !gallery.coverKey
      const missingStorage = typeof gallery.storageBytes !== 'number'
      const missingCount = typeof gallery.poze !== 'number'
      if (!missingCover && !missingStorage && !missingCount) return false
      return !metadataBackfillQueueRef.current.has(gallery.id)
    })

    if (!missingMetadata.length) return

    const runBackfill = async () => {
      for (const gallery of missingMetadata.slice(0, 4)) {
        if (cancelled) return

        metadataBackfillQueueRef.current.add(gallery.id)
        let success = false

        try {
          const raw = await mediaService.listGalleryPhotos(gallery.id, user.uid)
          if (cancelled) return

          const items = Array.isArray(raw)
            ? raw
            : (raw?.Contents ?? raw?.objects ?? raw?.items ?? [])

          const normalized = items
            .map((item) => ({
              key: item?.Key ?? item?.key ?? item?.name ?? '',
              size: Number(item?.size ?? item?.Size ?? 0),
            }))
            .filter((item) => item.key)

          const patch = {}

          if (!gallery.coverKey) patch.coverKey = normalized[0]?.key || ''
          if (typeof gallery.storageBytes !== 'number') {
            patch.storageBytes = normalized.reduce((sum, item) => sum + Number(item.size || 0), 0)
          }
          if (typeof gallery.poze !== 'number' || gallery.poze !== normalized.length) {
            patch.poze = normalized.length
          }

          if (Object.keys(patch).length > 0) {
            await galleriesService.updateGallery(gallery.id, patch)
          }

          success = true
        } catch (_) {
        } finally {
          if (!success) {
            metadataBackfillQueueRef.current.delete(gallery.id)
          }
        }
      }
    }

    runBackfill()

    return () => {
      cancelled = true
    }
  }, [galerii, user?.uid])

  // Update galerie activă dacă se schimbă datele în Firebase
  useEffect(() => {
    if (galerieActiva && galerii.length) {
      const updated = galerii.find((g) => g.id === galerieActiva.id)
      if (updated) setGalerieActiva(updated)
    }
  }, [galerii])


  useEffect(() => {
    const hasDefaultPhotos = pozeGalerie.some(
      (photo) => normalizePhotoFolderId(photo?.folderId) === DEFAULT_FOLDER_ID
    )

    if (!galleryFolders.length) {
      if (activeFolderId !== DEFAULT_FOLDER_ID) {
        setActiveFolderId(DEFAULT_FOLDER_ID)
      }
      return
    }

    if (activeFolderId === DEFAULT_FOLDER_ID && !hasDefaultPhotos) {
      setActiveFolderId(galleryFolders[0]?.id || DEFAULT_FOLDER_ID)
      return
    }

    if (!galleryFolders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(hasDefaultPhotos ? DEFAULT_FOLDER_ID : (galleryFolders[0]?.id || DEFAULT_FOLDER_ID))
    }
  }, [activeFolderId, galleryFolders, normalizePhotoFolderId, pozeGalerie])
  const closeActiveGallery = useCallback(() => {
    suppressAutoReopenRef.current = true
    setGalerieActiva(null)
    setPozeGalerie([])
    setGalleryFolders([])
    setActiveFolderId(DEFAULT_FOLDER_ID)
    persistActiveGalleryId(null)
  }, [persistActiveGalleryId])

  // Logica încărcare poze în galerie
  const handleDeschideGalerie = useCallback(async (galerie) => {
    if (!galerie?.id) return
    suppressAutoReopenRef.current = false
    setGalerieActiva(galerie)
    setLoadingPoze(true)
    setLoadingFolders(true)
    setActiveFolderId(DEFAULT_FOLDER_ID)
    setPozeGalerie([])
    setGalleryFolders([])
    persistActiveGalleryId(galerie.id)
    try {
      const [poze, folders, photoMetadata] = await Promise.all([
        mediaService.listGalleryPhotos(galerie.id, user.uid),
        galleriesService.getFolders(galerie.id).catch(() => []),
        galleriesService.listPhotoMetadata(galerie.id).catch(() => []),
      ])

      const validFolderIds = new Set((folders || []).map((folder) => folder.id))
      const photoMetaByKey = new Map(
        (photoMetadata || [])
          .filter((meta) => meta?.key)
          .map((meta) => [meta.key, validFolderIds.has(meta.folderId) ? meta.folderId : null])
      )

      const normalizedPhotos = poze
        .map((poza) => {
          const key = poza.key || poza.name || poza.Key
          if (!key) return null
          return {
            key,
            url: null,
            size: poza.size ?? poza.Size,
            lastModified: poza.lastModified ?? poza.uploaded ?? poza.LastModified,
            folderId: photoMetaByKey.get(key) || null,
          }
        })
        .filter(Boolean)
      setPozeGalerie(normalizedPhotos)

      syncFolderCounts(galerie.id, folders || [], photoMetadata || [])
      const hasDefaultPhotos = normalizedPhotos.some(
        (photo) => normalizePhotoFolderId(photo?.folderId) === DEFAULT_FOLDER_ID
      )
      setActiveFolderId(hasDefaultPhotos ? DEFAULT_FOLDER_ID : ((folders || [])[0]?.id || DEFAULT_FOLDER_ID))

      // Backfill metadata once for older galleries to avoid future N+1 listing in table rows.
      const needsBackfill = !galerie?.coverKey || typeof galerie?.storageBytes !== 'number'
      if (needsBackfill) {
        const coverKey = normalizedPhotos[0]?.key || ''
        const storageBytes = normalizedPhotos.reduce((sum, p) => sum + Number(p?.size || 0), 0)
        galleriesService.updateGallery(galerie.id, {
          coverKey,
          storageBytes,
          poze: normalizedPhotos.length,
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error loading poze:', error)
      alert('Eroare la încărcarea pozelor!')
    } finally {
      setLoadingPoze(false)
      setLoadingFolders(false)
    }
  }, [persistActiveGalleryId, syncFolderCounts, user.uid])

  const handleGalleryCreated = useCallback((galerieCreata) => {
    if (!galerieCreata?.id) return

    setGalerii((prev) => {
      const next = [galerieCreata, ...prev.filter((galerie) => galerie.id !== galerieCreata.id)]
      return next.sort((a, b) => {
        const dateA = a?.createdAt?.toDate?.() || (a?.data ? new Date(a.data) : null) || new Date(0)
        const dateB = b?.createdAt?.toDate?.() || (b?.data ? new Date(b.data) : null) || new Date(0)
        return dateB.getTime() - dateA.getTime()
      })
    })

    handleDeschideGalerie(galerieCreata)
  }, [handleDeschideGalerie])

  // Redeschide ultima galerie după refresh, fără să blocheze navigarea prin URL.
  useEffect(() => {
    if (activeTab !== 'galerii') return
    if (galerieActiva?.id) return
    if (!galerii.length) return
    if (suppressAutoReopenRef.current) return

    let savedGalleryId = null
    try {
      savedGalleryId = localStorage.getItem(ACTIVE_GALLERY_STORAGE_KEY)
    } catch (_) {
    }
    if (!savedGalleryId) return

    const target = galerii.find((g) => g.id === savedGalleryId && g.status === 'active')
    if (!target) {
      persistActiveGalleryId(null)
      return
    }

    handleDeschideGalerie(target)
  }, [
    activeTab,
    galerieActiva?.id,
    galerii,
    handleDeschideGalerie,
    persistActiveGalleryId,
  ])

  // Logica Upload (Original + Medium + Thumb)
  const handleUploadPoze = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length || !galerieActiva) return
    cancelUploadRef.current = false
    const sessionId = ++uploadSessionRef.current
    setUploading(true)
    setUploadProgress(0)
    setUploadedCount(0)
    setUploadTotalCount(files.length)
    setUploadedBytes(0)
    setUploadStartedAt(Date.now())

    const progressPerFile = Array(files.length).fill(0)
    const uploadPartsPerFile = Array.from({ length: files.length }, () => [0, 0, 0])
    const uploadedBytesPerFile = Array.from({ length: files.length }, () => [0, 0, 0])
    let totalTransferredBytes = 0

    const syncUploadProgress = () => {
      const totalProgress = progressPerFile.reduce((sum, value) => sum + value, 0)
      setUploadProgress(Math.round(totalProgress / files.length))
    }

    const reportProgress = (fileIndex, variantIndex, percent, variantSize = 0) => {
      const safePercent = Math.max(0, Math.min(100, Number(percent) || 0))
      const safeVariantSize = Math.max(0, Number(variantSize) || 0)

      uploadPartsPerFile[fileIndex][variantIndex] = safePercent
      progressPerFile[fileIndex] = uploadPartsPerFile[fileIndex]
        .reduce((sum, value) => sum + value, 0) / 3
      syncUploadProgress()

      const nextTransferredBytes = safeVariantSize * (safePercent / 100)
      const previousTransferredBytes = uploadedBytesPerFile[fileIndex][variantIndex]
      uploadedBytesPerFile[fileIndex][variantIndex] = nextTransferredBytes
      totalTransferredBytes += nextTransferredBytes - previousTransferredBytes
      setUploadedBytes(Math.round(totalTransferredBytes))
    }

    const markFileUploaded = (fileIndex, variantSizes) => {
      variantSizes.forEach((variantSize, variantIndex) => {
        uploadPartsPerFile[fileIndex][variantIndex] = 100
        progressPerFile[fileIndex] = 100

        const safeVariantSize = Math.max(0, Number(variantSize) || 0)
        const previousTransferredBytes = uploadedBytesPerFile[fileIndex][variantIndex]
        uploadedBytesPerFile[fileIndex][variantIndex] = safeVariantSize
        totalTransferredBytes += safeVariantSize - previousTransferredBytes
      })

      syncUploadProgress()
      setUploadedBytes(Math.round(totalTransferredBytes))
      // Guard: only increment if this closure's session is still the active one.
      // This prevents stale markFileUploaded calls from a cancelled/superseded
      // upload from inflating the counter (e.g. "160/100" display bug).
      if (uploadSessionRef.current === sessionId) {
        setUploadedCount((count) => Math.min(count + 1, files.length))
      }
    }
    try {
      const idToken = await authService.getCurrentIdToken()
      const explicitFolderIds = new Set(galleryFolders.map((folder) => folder.id))
      const hasExplicitFolders = explicitFolderIds.size > 0
      const uploadFolderId = hasExplicitFolders
        ? ((activeFolderId === DEFAULT_FOLDER_ID || explicitFolderIds.has(activeFolderId))
          ? activeFolderId
          : (galleryFolders[0]?.id || DEFAULT_FOLDER_ID))
        : DEFAULT_FOLDER_ID
      let uploadedStorageBytes = 0
      let firstUploadedOriginal = ''
      const BATCH_SIZE = 5
      const uploadPlans = files.map((file, fileIndex) => {
        const baseName = `${Date.now()}-${fileIndex}-${(file.name || 'image').replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const baseNameNoExt = baseName.replace(/\.[^.]+$/, '')
        return {
          file,
          fileIndex,
          origPath: `galerii/${galerieActiva.id}/originals/${baseName}`,
          mediumPath: `galerii/${galerieActiva.id}/medium/${baseNameNoExt}.webp`,
          thumbPath: `galerii/${galerieActiva.id}/thumbnails/${baseNameNoExt}.webp`,
        }
      })
      const presignedUrlByKey = new Map()
      const workerBaseUrl = String(import.meta.env.VITE_R2_WORKER_URL || '').trim().replace(/\/+$/, '')

      if (workerBaseUrl) {
        const presignFiles = uploadPlans.flatMap(({ file, origPath, mediumPath, thumbPath }) => ([
          { key: origPath, contentType: file.type || 'image/jpeg' },
          { key: mediumPath, contentType: 'image/webp' },
          { key: thumbPath, contentType: 'image/webp' },
        ]))

        try {
          for (let presignStart = 0; presignStart < presignFiles.length; presignStart += 100) {
            if (cancelUploadRef.current) break

            const chunk = presignFiles.slice(presignStart, presignStart + 100)
            const response = await fetch(`${workerBaseUrl}/presign`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                galleryId: galerieActiva.id,
                files: chunk,
              }),
            })

            if (!response.ok) {
              throw new Error(`Presign failed (${response.status})`)
            }

            const payload = await response.json().catch(() => ({}))
            const urls = Array.isArray(payload?.urls) ? payload.urls : []
            urls.forEach(({ key, url }) => {
              if (key && url) presignedUrlByKey.set(key, url)
            })
          }
        } catch (error) {
          console.warn('Presigned upload unavailable, falling back to Worker PUT.', error)
        }
      }

      for (let batchStart = 0; batchStart < uploadPlans.length; batchStart += BATCH_SIZE) {
        const batch = uploadPlans.slice(batchStart, batchStart + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async ({ file, fileIndex, origPath, mediumPath, thumbPath }) => {

            const mediumFile = await imageCompression(file, {
              maxWidthOrHeight: MEDIUM_MAX_DIMENSION,
              fileType: 'image/webp',
              initialQuality: MEDIUM_QUALITY,
              useWebWorker: true,
            })
            const thumbFile = await imageCompression(mediumFile || file, {
              maxWidthOrHeight: THUMB_MAX_DIMENSION,
              fileType: 'image/webp',
              initialQuality: THUMB_QUALITY,
              useWebWorker: true,
            })
            const variantSizes = [
              Number(file.size || 0),
              Number(mediumFile?.size || 0),
              Number(thumbFile?.size || 0),
            ]

            const uploadVariant = async (variantFile, targetPath, variantIndex) => {
              const presignedUrl = presignedUrlByKey.get(targetPath)
              if (presignedUrl) {
                const response = await fetch(presignedUrl, {
                  method: 'PUT',
                  body: variantFile,
                })
                if (!response.ok) {
                  throw new Error(`Presigned upload failed (${response.status})`)
                }
                reportProgress(fileIndex, variantIndex, 100, variantSizes[variantIndex])
                return targetPath
              }

              return mediaService.uploadPhoto(
                variantFile,
                galerieActiva.id,
                user.uid,
                (p) => reportProgress(fileIndex, variantIndex, p, variantSizes[variantIndex]),
                targetPath,
                idToken,
              )
            }

            await Promise.all([
              uploadVariant(file, origPath, 0),
              uploadVariant(mediumFile, mediumPath, 1),
              uploadVariant(thumbFile, thumbPath, 2),
            ])
            markFileUploaded(fileIndex, variantSizes)

            await galleriesService.upsertPhotoMetadata(galerieActiva.id, origPath, {
              folderId: uploadFolderId,
              size: Number(file.size || 0),
              lastModified: file.lastModified ? new Date(file.lastModified) : null,
              createdAt: new Date(),
            })
            await galleriesService.updateGallery(galerieActiva.id, { poze: increment(1) })

            return {
              uploadedSize: Number(file.size || 0) + Number(mediumFile.size || 0) + Number(thumbFile.size || 0),
              originalPath: origPath,
            }
          })
        )

        batchResults.forEach(({ uploadedSize, originalPath }) => {
          uploadedStorageBytes += uploadedSize
          if (!firstUploadedOriginal) firstUploadedOriginal = originalPath
        })

        if (cancelUploadRef.current) break
      }

      if (explicitFolderIds.has(uploadFolderId)) {
        await galleriesService.incrementFolderPhotoCount(galerieActiva.id, uploadFolderId, files.length).catch(() => {})
      }

      const currentBytes = Number(galerieActiva?.storageBytes || 0)
      await galleriesService.updateGallery(galerieActiva.id, {
        storageBytes: currentBytes + uploadedStorageBytes,
        coverKey: galerieActiva?.coverKey || firstUploadedOriginal || '',
      })
      await galleriesService.adjustUserStorageUsed(user.uid, uploadedStorageBytes)
      await handleDeschideGalerie(galerieActiva)
      if (uploadFolderId) {
        setActiveFolderId(uploadFolderId)
      }
    } catch (error) {
      console.error('Error uploading:', error)
      alert('Eroare la upload!')
    } finally {
      // Only the most-recent upload session resets the overlay state.
      // This prevents a stale finally block from hiding the overlay
      // when a new upload has already started (e.g. rapid re-trigger).
      if (uploadSessionRef.current === sessionId) {
        setUploading(false)
        setUploadProgress(0)
        setUploadedCount(0)
        setUploadTotalCount(0)
        setUploadedBytes(0)
        setUploadStartedAt(null)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCancelUpload = () => {
    cancelUploadRef.current = true
  }

  const handleDeletePoza = async (pozaKey) => {
    if (!window.confirm('Ștergi această poză?')) return
    try {
      const removedPhoto = pozeGalerie.find((p) => p.key === pozaKey)
      const idToken = await authService.getCurrentIdToken()
      await mediaService.deletePhoto(pozaKey, idToken)

      if (galerieActiva?.id) {
        await galleriesService.deletePhotoMetadata(galerieActiva.id, pozaKey)
        if (galleryFolders.some((folder) => folder.id === removedPhoto?.folderId)) {
          await galleriesService.incrementFolderPhotoCount(galerieActiva.id, removedPhoto.folderId, -1).catch(() => {})
        }
      }

      const nextPhotos = pozeGalerie.filter((p) => p.key !== pozaKey)
      setPozeGalerie(nextPhotos)

      if (galerieActiva?.id) {
        await syncFolderCounts(galerieActiva.id, galleryFolders, nextPhotos)

        const nextCoverKey = galerieActiva?.coverKey === pozaKey ? (nextPhotos[0]?.key || '') : (galerieActiva?.coverKey || '')
        const currentPhotoCount = Number(galerieActiva?.poze ?? pozeGalerie.length ?? 0)
        const currentBytes = Number(galerieActiva?.storageBytes || 0)
        const removedBytes = Number(removedPhoto?.size || 0)
        await galleriesService.updateGallery(galerieActiva.id, {
          poze: Math.max(0, currentPhotoCount - 1),
          storageBytes: Math.max(0, currentBytes - removedBytes),
          coverKey: nextCoverKey,
        })
        if (removedBytes > 0) {
          await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la ștergere!')
    }
  }


  const handleCreateFolder = async () => {
    if (!galerieActiva?.id) return
    const rawName = window.prompt('Nume folder nou:')
    const name = String(rawName || '').trim()
    if (!name) return

    try {
      const createdFolder = await galleriesService.createFolder(galerieActiva.id, { name })
      setGalleryFolders((prev) => [...prev, { ...createdFolder, photoCount: 0 }])
      setActiveFolderId(createdFolder.id)
    } catch (error) {
      console.error('Error creating folder:', error)
      alert('Nu am putut crea folderul. Încearcă din nou.')
    }
  }

  const handleRenameFolder = async (folderId, nextName) => {
    if (!galerieActiva?.id || !folderId) return
    const name = String(nextName || '').trim()
    if (!name) {
      throw new Error('Numele folderului este obligatoriu.')
    }

    try {
      if (folderId === DEFAULT_FOLDER_ID) {
        const createdFolder = await galleriesService.createFolder(galerieActiva.id, { name })
        if (!createdFolder?.id) {
          throw new Error('Folderul nu a putut fi creat.')
        }

        const defaultPhotos = pozeGalerie.filter(
          (photo) => normalizePhotoFolderId(photo?.folderId) === DEFAULT_FOLDER_ID
        )
        const photoMetadata = defaultPhotos.length
          ? await galleriesService.listPhotoMetadata(galerieActiva.id).catch(() => [])
          : []
        const photoMetadataByKey = new Map(
          (photoMetadata || [])
            .filter((photo) => photo?.key)
            .map((photo) => [photo.key, photo])
        )

        if (defaultPhotos.length) {
          await Promise.all(defaultPhotos.map((photo) => {
            const existingPhoto = photoMetadataByKey.get(photo.key)
            return galleriesService.upsertPhotoMetadata(galerieActiva.id, photo.key, {
              folderId: createdFolder.id,
              size: Number((existingPhoto?.size ?? photo?.size) || 0),
              lastModified: existingPhoto?.lastModified || photo?.lastModified || null,
              createdAt: existingPhoto?.createdAt || new Date(),
            })
          }))
        }

        const nextPhotos = pozeGalerie.map((photo) => (
          normalizePhotoFolderId(photo?.folderId) === DEFAULT_FOLDER_ID
            ? { ...photo, folderId: createdFolder.id }
            : photo
        ))
        const nextFolders = attachFolderCounts(
          [{ ...createdFolder, name }, ...galleryFolders],
          nextPhotos
        )

        setPozeGalerie(nextPhotos)
        setGalleryFolders(nextFolders)
        setActiveFolderId(createdFolder.id)
        return
      }

      await galleriesService.updateFolder(galerieActiva.id, folderId, { name })
      setGalleryFolders((prev) => prev.map((folder) => (
        folder.id === folderId
          ? { ...folder, name }
          : folder
      )))
    } catch (error) {
      console.error('Error renaming folder:', error)
      alert('Nu am putut redenumi folderul. Încearcă din nou.')
      throw error
    }
  }

  const handleDeleteFolder = async (folderId) => {
    if (!galerieActiva?.id || !folderId || folderId === DEFAULT_FOLDER_ID) return
    const folder = galleryFolders.find((f) => f.id === folderId)
    const folderName = folder?.name || 'Acest folder'
    const photosInFolder = pozeGalerie.filter((photo) => photo.folderId === folderId)

    if (!window.confirm(`${folderName}: ștergi folderul și ${photosInFolder.length} poze din el?`)) return

    try {
      const idToken = await authService.getCurrentIdToken()
      const deletedKeys = new Set()
      let removedBytes = 0
      const failedKeys = []

      for (const photo of photosInFolder) {
        try {
          await mediaService.deletePhoto(photo.key, idToken)
          await galleriesService.deletePhotoMetadata(galerieActiva.id, photo.key)
          deletedKeys.add(photo.key)
          removedBytes += Number(photo.size || 0)
        } catch (_) {
          failedKeys.push(photo.key)
        }
      }

      if (failedKeys.length > 0) {
        await handleDeschideGalerie(galerieActiva)
        alert(`Au rămas ${failedKeys.length} poze care nu au putut fi șterse. Încearcă din nou.`)
        return
      }

      await galleriesService.deletePhotoMetadataByFolder(galerieActiva.id, folderId).catch(() => {})
      await galleriesService.deleteFolder(galerieActiva.id, folderId)

      const nextPhotos = pozeGalerie.filter((photo) => !deletedKeys.has(photo.key))
      const nextFolders = galleryFolders.filter((item) => item.id !== folderId)
      setPozeGalerie(nextPhotos)
      setGalleryFolders(nextFolders)
      setActiveFolderId(nextFolders[0]?.id || DEFAULT_FOLDER_ID)

      await syncFolderCounts(galerieActiva.id, nextFolders, nextPhotos)

      const nextCoverKey = deletedKeys.has(galerieActiva?.coverKey) ? (nextPhotos[0]?.key || '') : (galerieActiva?.coverKey || '')
      const currentPhotoCount = Number(galerieActiva?.poze ?? pozeGalerie.length ?? 0)
      const currentBytes = Number(galerieActiva?.storageBytes || 0)
      await galleriesService.updateGallery(galerieActiva.id, {
        poze: Math.max(0, currentPhotoCount - deletedKeys.size),
        storageBytes: Math.max(0, currentBytes - removedBytes),
        coverKey: nextCoverKey,
      })
      if (removedBytes > 0) {
        await galleriesService.adjustUserStorageUsed(user.uid, -removedBytes)
      }
    } catch (error) {
      console.error('Error deleting folder:', error)
      alert('Nu am putut șterge folderul. Încearcă din nou.')
    }
  }
  // Management Galerii (Trash / Delete / Restore)
  const handleMoveToTrash = async (id) => {
    try {
      await galleriesService.moveToTrash(id, new Date())
      if (galerieActiva?.id === id) {
        closeActiveGallery()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleDeletePermanently = async (id, { skipConfirm = false } = {}) => {
    if (!skipConfirm && !window.confirm('Această acțiune va șterge definitiv toate fotografiile din stocarea Cloudflare și nu poate fi anulată. Ștergi definitiv?')) return
    try {
      const idToken = await authService.getCurrentIdToken()
      const explicitFunctionUrl = String(import.meta.env.VITE_DELETE_GALLERY_ASSETS_URL || '').trim()
      const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim()
      const endpoint = explicitFunctionUrl || (projectId ? `https://us-central1-${projectId}.cloudfunctions.net/deleteGalleryAssets` : '')
      if (!endpoint) throw new Error('URL funcției deleteGalleryAssets nu este configurat.')

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ galleryId: id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload?.error || '').trim() || `Delete failed (${response.status}).`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Eroare la ștergere definitivă. Încearcă din nou.')
    }
  }

  const handleRestoreGalerie = async (id) => {
    try {
      await galleriesService.restoreGallery(id)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handlePreview = async (galerie) => {
    if (!galerie?.id) return
    const url = getGalleryPublicUrl(galerie)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleLogout = async () => {
    await onLogout?.()
  }

  useEffect(() => {
    if (!user?.uid || activeTab !== 'card') return
    let cancelled = false

    const loadCardProfile = async () => {
      setProfileLoading(true)
      try {
        const [cardData, brandingData] = await Promise.all([
          sitesService.getCardProfile(user.uid),
          sitesService.getProfile(user.uid).catch(() => null),
        ])

        if (cancelled) return

        const mergedProfile = {
          logoUrl: cardData?.logoUrl ?? brandingData?.logoUrl ?? '',
          numeBrand: cardData?.numeBrand ?? brandingData?.brandName ?? '',
          slogan: cardData?.slogan ?? '',
          accentColor: cardData?.accentColor ?? brandingData?.accentColor ?? '#1d1d1f',
          whatsapp: cardData?.whatsapp ?? cardData?.telefon ?? brandingData?.whatsappNumber ?? '',
          instagram: cardData?.instagram ?? brandingData?.instagramUrl ?? '',
          email: cardData?.email ?? brandingData?.emailContact ?? '',
          website: cardData?.website ?? brandingData?.websiteUrl ?? '',
        }

        setProfileData(mergedProfile)

        if (mergedProfile.logoUrl) {
          try {
            const logoUrl = await mediaService.getBrandingAsset(mergedProfile.logoUrl)
            if (!cancelled) setCardLogoPreview(logoUrl)
          } catch (_) {
            if (!cancelled) setCardLogoPreview(null)
          }
        } else {
          setCardLogoPreview(null)
        }
      } catch (error) {
        console.error('Error loading card profile:', error)
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    loadCardProfile()
    return () => { cancelled = true }
  }, [user?.uid, activeTab])

  const saveProfileSettings = async (e) => {
    e?.preventDefault?.()
    if (!user?.uid) return

    const normalizedProfile = {
      logoUrl: String(profileData.logoUrl || '').trim(),
      numeBrand: String(profileData.numeBrand || '').trim(),
      slogan: String(profileData.slogan || '').trim(),
      accentColor: String(profileData.accentColor || '#1d1d1f').trim() || '#1d1d1f',
      whatsapp: String(profileData.whatsapp || '').trim(),
      instagram: String(profileData.instagram || '').trim(),
      email: String(profileData.email || '').trim(),
      website: String(profileData.website || '').trim(),
    }

    setProfileSaving(true)
    try {
      await sitesService.saveCardProfile(
        user.uid,
        { ...normalizedProfile, updatedAt: new Date() },
        { merge: true }
      )

      // Keep public profile in sync for gallery/site branding compatibility.
      await sitesService.saveProfile(
        user.uid,
        {
          brandName: normalizedProfile.numeBrand,
          instagramUrl: normalizedProfile.instagram,
          whatsappNumber: normalizedProfile.whatsapp,
          websiteUrl: normalizedProfile.website,
          emailContact: normalizedProfile.email,
          accentColor: normalizedProfile.accentColor,
          logoUrl: normalizedProfile.logoUrl,
          updatedAt: new Date(),
        },
        { merge: true }
      )

      alert('Modificările au fost salvate.')
    } catch (err) {
      console.error('Error:', err)
      alert('Nu am putut salva datele cardului. Încearcă din nou.')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleCardLogoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !user?.uid) return

    if (!file.type.startsWith('image/')) {
      alert('Selectează un fișier imagine (PNG, JPG).')
      return
    }

    setCardLogoUploading(true)
    try {
      const path = CARD_LOGO_PATH(user.uid)
      const idToken = await authService.getCurrentIdToken()
      await mediaService.uploadFileToPath(file, path, undefined, idToken)
      const logoUrl = await mediaService.getBrandingAsset(path)

      setCardLogoPreview(logoUrl)
      setProfileData((prev) => ({ ...prev, logoUrl: path }))

      await sitesService.saveCardProfile(user.uid, { logoUrl: path, updatedAt: new Date() }, { merge: true })
      await sitesService.saveProfile(user.uid, { logoUrl: path, updatedAt: new Date() }, { merge: true })
    } catch (error) {
      console.error(error)
      alert('Eroare la încărcarea logo-ului.')
    } finally {
      setCardLogoUploading(false)
      if (cardLogoInputRef.current) cardLogoInputRef.current.value = ''
    }
  }

  const userInitial = (user?.name || 'U').charAt(0).toUpperCase()
  const runUiTransition = (callback) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => callback())
      return
    }
    callback?.()
  }

  const pozeGalerieFiltrate = useMemo(() => {
    if (activeFolderId === DEFAULT_FOLDER_ID) {
      if (!galleryFolders.length) return pozeGalerie
      return pozeGalerie.filter((photo) => normalizePhotoFolderId(photo?.folderId) === DEFAULT_FOLDER_ID)
    }
    return pozeGalerie.filter((photo) => normalizePhotoFolderId(photo?.folderId) === activeFolderId)
  }, [activeFolderId, galleryFolders, normalizePhotoFolderId, pozeGalerie])

  const renderSidebar = () => (
    <div className="dashboard-sidebar">
      <div className="sidebar-logo-area">
        <h1 className="dashboard-logo" onClick={() => runUiTransition(() => {
          closeActiveGallery()
          if (location.pathname === '/settings') navigate('/dashboard?tab=galerii')
          else setSearchParams({ tab: 'galerii' })
        })}>
          <span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#ffffff',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span>
        </h1>
      </div>
      {SIDEBAR_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`dashboard-sidebar-btn ${activeTab === key ? 'active' : ''}`}
          onClick={() => runUiTransition(() => {
            closeActiveGallery()
            if (key === 'setari') navigate('/settings')
            else {
              if (location.pathname === '/settings') navigate(`/dashboard?tab=${key}`)
              else setSearchParams({ tab: key })
            }
          })}
        >
          <span className="dashboard-sidebar-btn-indicator" />
          {Icon && <Icon size={18} className="dashboard-sidebar-btn-icon" />}
          {label}
        </button>
      ))}
    </div>
  )

  const renderMainContent = () => {
    // Vizualizare poze într-o galerie specifică
    if (galerieActiva) {
      return (
        <div key={`view-gallery-${galerieActiva.id}`} className="dashboard-view-animate">
          <GalleryDetailView
            galerie={galerieActiva}
            pozeGalerie={pozeGalerieFiltrate}
            allPozeGalerie={pozeGalerie}
            loadingPoze={loadingPoze}
            loadingFolders={loadingFolders}
            galleryFolders={galleryFolders}
            activeFolderId={activeFolderId}
            user={user}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadedCount={uploadedCount}
            totalCount={uploadTotalCount}
            uploadedBytes={uploadedBytes}
            uploadStartedAt={uploadStartedAt}
            fileInputRef={fileInputRef}
            onBack={closeActiveGallery}
            onPreview={handlePreview}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onUploadPoze={handleUploadPoze}
            onCancelUpload={handleCancelUpload}
            onDeletePoza={handleDeletePoza}
            onDeleteGallery={handleMoveToTrash}
          />
        </div>
      )
    }

    const activeTabLabel = SIDEBAR_TABS.find((t) => t.key === activeTab)?.label ?? activeTab

    return (
      <div key={`view-${activeTab}`} className="dashboard-view-animate">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-right">
            <div className="dashboard-avatar-wrap" title={user?.email}>
              <div className="dashboard-avatar">{userInitial}</div>
              <div className="dashboard-profile">
                <span className="dashboard-profile-name">{user?.name || 'Fotograf'}</span>
                <span className="dashboard-profile-email">{user?.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="dashboard-logout-link">Ieșire</button>
          </div>
        </header>

        {/* Tab-uri Galerii / Coș */}
        {(activeTab === 'galerii' || activeTab === 'trash') && (
          <AdminGalleryTable
            user={user}
            galerii={galerii}
            loading={loading}
            activeTab={activeTab}
            userPlan={userPlan}
            storageLimit={storageLimit}
            onDeschideGalerie={handleDeschideGalerie}
            onGalleryCreated={handleGalleryCreated}
            onMoveToTrash={handleMoveToTrash}
            onDeletePermanently={handleDeletePermanently}
            onRestore={handleRestoreGalerie}
            onPreview={handlePreview}
          />
        )}

        {/* Tab Branding / Card */}
        {activeTab === 'card' && (
          <div className="brand-card-container">
            <div className="brand-card-editor">
              <h2 className="brand-card-title">Card fotograf</h2>
              {profileLoading ? (
                <p>Se încarcă...</p>
              ) : (
                <form onSubmit={saveProfileSettings} className="brand-card-form">
                  <div className="brand-card-form-group">
                    <label>Logo</label>
                    <input
                      ref={cardLogoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCardLogoChange}
                      style={{ display: 'none' }}
                    />
                    <div className="brand-card-logo-row">
                      <button
                        type="button"
                        className="btn-secondary brand-card-logo-btn"
                        onClick={() => cardLogoInputRef.current?.click()}
                        disabled={cardLogoUploading}
                      >
                        {cardLogoUploading ? 'Se încarcă...' : 'Încarcă logo'}
                      </button>
                      {cardLogoPreview ? (
                        <img src={cardLogoPreview} alt="Logo" className="brand-card-logo-preview" />
                      ) : (
                        <span className="brand-card-logo-placeholder">Fără logo</span>
                      )}
                    </div>
                  </div>

                  <div className="brand-card-form-group">
                    <label>Nume brand</label>
                    <input
                      className="brand-card-input"
                      type="text"
                      value={profileData.numeBrand}
                      onChange={(e) => setProfileData((p) => ({ ...p, numeBrand: e.target.value }))}
                      placeholder="Ex: Studio Foto XYZ"
                    />
                  </div>

                  <div className="brand-card-form-group">
                    <label>Slogan</label>
                    <input
                      className="brand-card-input"
                      type="text"
                      value={profileData.slogan}
                      onChange={(e) => setProfileData((p) => ({ ...p, slogan: e.target.value }))}
                      placeholder="Ex: Fotografii care spun povești"
                    />
                  </div>

                  <div className="brand-card-form-group">
                    <label>Culoare accent</label>
                    <div className="brand-card-color-row">
                      <input
                        className="brand-card-color-input"
                        type="color"
                        value={profileData.accentColor || '#1d1d1f'}
                        onChange={(e) => setProfileData((p) => ({ ...p, accentColor: e.target.value }))}
                      />
                      <input
                        className="brand-card-input brand-card-color-text"
                        type="text"
                        value={profileData.accentColor || '#1d1d1f'}
                        onChange={(e) => setProfileData((p) => ({ ...p, accentColor: e.target.value }))}
                        placeholder="#1d1d1f"
                      />
                    </div>
                  </div>

                  <div className="brand-card-form-group">
                    <label>WhatsApp</label>
                    <input
                      className="brand-card-input"
                      type="tel"
                      value={profileData.whatsapp}
                      onChange={(e) => setProfileData((p) => ({ ...p, whatsapp: e.target.value }))}
                      placeholder="+40 712 345 678"
                    />
                  </div>

                  <div className="brand-card-form-group">
                    <label>Instagram</label>
                    <input
                      className="brand-card-input"
                      type="text"
                      value={profileData.instagram}
                      onChange={(e) => setProfileData((p) => ({ ...p, instagram: e.target.value }))}
                      placeholder="@username sau link complet"
                    />
                  </div>

                  <div className="brand-card-form-group">
                    <label>Email contact</label>
                    <input
                      className="brand-card-input"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData((p) => ({ ...p, email: e.target.value }))}
                      placeholder="contact@studio.ro"
                    />
                  </div>

                  <div className="brand-card-form-group">
                    <label>Website</label>
                    <input
                      className="brand-card-input"
                      type="text"
                      inputMode="url"
                      value={profileData.website}
                      onChange={(e) => setProfileData((p) => ({ ...p, website: e.target.value }))}
                      placeholder="https://exemplu.ro"
                    />
                  </div>

                  <div className="brand-card-actions">
                    <button type="submit" className="btn-primary" disabled={profileSaving}>
                      {profileSaving ? 'Se salvează...' : 'Salvează cardul'}
                    </button>
                    <a className="brand-card-copy-link" href={'/card/' + (user?.uid || '')} target="_blank" rel="noreferrer">
                      Vezi cardul public
                    </a>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab Site ── ADĂUGAT */}
        {activeTab === 'site' && (
          <SiteEditor user={user} userGalleries={galerii} />
        )}

        {/* Tab Lansare */}
        {activeTab === 'lansare' && <LaunchChecklist />}

        {/* Tab Setări Generale */}
        {activeTab === 'setari' && (
          <div className="dashboard-subscription-wrap" style={{ width: '100%', padding: '20px 40px' }}>
            <Settings
              user={user}
              theme={theme}
              setTheme={setTheme}
              userPlan={userPlan}
              storageLimit={storageLimit}
              checkAccess={checkAccess}
            />
          </div>
        )}

        {/* Tab Abonament */}
        {activeTab === 'abonament' && (
          <div className="dashboard-subscription-wrap" style={{ width: '100%', padding: '20px 40px' }}>
            <SubscriptionSection user={user} userPlan={userPlan} storageLimit={storageLimit} checkAccess={checkAccess} mode="plansOnly" />
          </div>
        )}

        {/* Placeholder pentru tab-uri în lucru */}
        {['statistici', 'contracte'].includes(activeTab) && (
          <div className="dashboard-tab-placeholder">
            Secțiunea {activeTabLabel} urmează să fie implementată.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dashboard-layout">
      {renderSidebar()}
      <div className={`dashboard-main-content ${!galerieActiva ? 'page-content dashboard-app' : ''}`}>
        {renderMainContent()}
      </div>

      {showPaymentSuccess && (
        <div className="dashboard-payment-success-overlay" onClick={() => setShowPaymentSuccess(false)}>
          <div className="dashboard-payment-success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard-payment-success-icon">
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h3>Plata a fost primită</h3>
            <p>Contul tău a fost actualizat. Bine ai revenit în Mina.</p>
            <button type="button" onClick={() => setShowPaymentSuccess(false)}>
              Înțeles
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
