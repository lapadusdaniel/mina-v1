import { auth } from './firebase'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function baseWorkerUrl() {
  if (!WORKER_URL) throw new Error('VITE_R2_WORKER_URL este obligatoriu')
  return WORKER_URL.endsWith('/') ? WORKER_URL : `${WORKER_URL}/`
}

function readShareTokenFromLocation() {
  if (typeof window === 'undefined') return ''
  try {
    const token = new URLSearchParams(window.location.search).get('st')
    return token ? String(token).trim() : ''
  } catch (_) {
    return ''
  }
}

function objectUrl(path, accessToken = '') {
  const token = accessToken || readShareTokenFromLocation()
  const query = token ? `?st=${encodeURIComponent(token)}` : ''
  return `${baseWorkerUrl()}${encodeURIComponent(path)}${query}`
}

function listUrl(prefix, accessToken = '') {
  const token = accessToken || readShareTokenFromLocation()
  const tokenPart = token ? `&st=${encodeURIComponent(token)}` : ''
  return `${baseWorkerUrl()}?prefix=${encodeURIComponent(prefix)}${tokenPart}`
}

function shareTokenApiUrl(galleryId, ttlHours = 720) {
  const gid = encodeURIComponent(String(galleryId || '').trim())
  const ttl = Math.max(1, Math.min(24 * 365, Number(ttlHours) || 720))
  return `${baseWorkerUrl()}share-token?galleryId=${gid}&ttlHours=${ttl}`
}

function requireIdToken(idToken, operation) {
  if (!idToken) {
    throw new Error(`${operation}: sesiunea a expirat. Reautentifică-te și încearcă din nou.`)
  }
}

function isAllowedPublicPath(path) {
  if (!path) return false
  const str = String(path).trim()
  if (!str) return false
  if (/^galerii\/[^/]+\/(originals|medium|thumbnails)\/.+$/i.test(str)) return true
  if (/^branding\/[^/]+\/.+$/i.test(str)) return true
  return false
}

function ensurePublicPath(path, operation) {
  if (!isAllowedPublicPath(path)) {
    throw new Error(`${operation}: cale invalidă sau nepermisă (${path || 'empty'})`)
  }
}

async function buildReadAuthHeaders() {
  try {
    const currentUser = auth?.currentUser
    if (!currentUser) return {}
    const idToken = await currentUser.getIdToken()
    if (!idToken) return {}
    return { Authorization: `Bearer ${idToken}` }
  } catch (_) {
    return {}
  }
}

/** Upload file to R2. Requires Firebase idToken for Worker auth. */
export const uploadPoza = async (file, galerieId, _ownerUid, onProgress, targetPath, idToken) => {
  requireIdToken(idToken, 'Upload')
  if (!file) throw new Error('uploadPoza: file este obligatoriu')
  if (!galerieId && !targetPath) throw new Error('uploadPoza: galerieId sau targetPath este obligatoriu')

  const safeName = `${Date.now()}-${(file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const path = targetPath ?? `galerii/${galerieId}/originals/${safeName}`
  const url = objectUrl(path)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = (e.loaded / e.total) * 100
        onProgress(percentComplete)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(path)
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'))
    })

    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`)
    xhr.send(file)
  })
}

export const listPoze = async (galerieId, _ownerUid = '') => {
  if (!galerieId) return []
  const prefix = `galerii/${galerieId}/originals/`

  const publicShareToken = readShareTokenFromLocation()
  const headers = await buildReadAuthHeaders()
  const response = await fetch(listUrl(prefix, publicShareToken), {
    method: 'GET',
    headers,
  })
  if (!response.ok) throw new Error(`List failed: ${response.status}`)

  const raw = await response.json().catch(() => [])
  const items = Array.isArray(raw) ? raw : (raw?.Contents ?? raw?.objects ?? raw?.items ?? [])
  return items
    .map((o) => {
      const key = o?.Key ?? o?.key ?? o?.name
      if (!key) return null
      return {
        key,
        Key: o?.Key ?? key,
        size: o?.Size ?? o?.size,
      }
    })
    .filter(Boolean)
}

/**
 * Resolve the storage path for a given key and type.
 * type 'thumb' -> galerii/{id}/thumbnails/{fileName}.webp
 * type 'medium' -> galerii/{id}/medium/{fileName}.webp
 * type 'original' or omit -> return key as is
 */
function resolvePath(key, type) {
  if (!key) return null
  const str = String(key).trim()
  const match = str.match(/^galerii\/([^/]+)\/originals\/(.+)$/)
  if (match) {
    const [, galerieId, fileName] = match
    const base = fileName.replace(/\.[^.]+$/, '')
    if (type === 'thumb') return `galerii/${galerieId}/thumbnails/${base}.webp`
    if (type === 'medium') return `galerii/${galerieId}/medium/${base}.webp`
  }
  return str
}

async function fetchBlobFromWorker(path, errorLabel, accessToken = '') {
  ensurePublicPath(path, errorLabel)
  const headers = await buildReadAuthHeaders()
  const response = await fetch(objectUrl(path, accessToken), { method: 'GET', headers })
  if (!response.ok) throw new Error(`${errorLabel}: ${response.status}`)
  return response.blob()
}

export const getPozaUrl = async (fileName, type = 'original', accessToken = '') => {
  if (!fileName) throw new Error('getPozaUrl: fileName este obligatoriu')
  const path = resolvePath(fileName, type)
  const blob = await fetchBlobFromWorker(path, 'Get failed', accessToken)
  return URL.createObjectURL(blob)
}

/** Returns the raw Blob for a poza (for Web Share API, etc.). */
export const getPozaBlob = async (fileName, type = 'original', accessToken = '') => {
  if (!fileName) throw new Error('getPozaBlob: fileName este obligatoriu')
  const path = resolvePath(fileName, type)
  return fetchBlobFromWorker(path, 'Get failed', accessToken)
}

/** Returns URL for full-resolution/original image. Use for high-res downloads. */
export const getPozaUrlOriginal = async (fileName, accessToken = '') => {
  if (!fileName) throw new Error('getPozaUrlOriginal: fileName este obligatoriu')
  const path = resolvePath(fileName, 'original')
  const blob = await fetchBlobFromWorker(path, 'Get original failed', accessToken)
  return URL.createObjectURL(blob)
}

/** Upload a file to a custom path. Requires Firebase idToken for Worker auth. */
export const uploadToPath = async (file, path, onProgress, idToken) => {
  requireIdToken(idToken, 'Upload')
  if (!file) throw new Error('uploadToPath: file este obligatoriu')
  if (!path) throw new Error('uploadToPath: path este obligatoriu')
  const url = objectUrl(path)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(path)
      else reject(new Error(`Upload failed: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Upload failed: Network error')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`)
    xhr.send(file)
  })
}

/** Get object URL for a storage path (e.g. branding/xxx/logo.png). */
export const getBrandingUrl = async (path) => {
  if (!path) throw new Error('Path is required')
  const blob = await fetchBlobFromWorker(path, 'Get failed')
  return URL.createObjectURL(blob)
}

/** Delete a single image (original + thumb + medium). Requires Firebase idToken. */
export const deletePoza = async (fileName, idToken) => {
  requireIdToken(idToken, 'Delete')
  const deleteOne = async (path, { allow404 = false } = {}) => {
    const response = await fetch(objectUrl(path), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (response.ok) return
    if (allow404 && response.status === 404) return
    throw new Error(`Delete failed: ${response.status}`)
  }

  await deleteOne(fileName, { allow404: true })

  const thumbPath = resolvePath(fileName, 'thumb')
  if (thumbPath && thumbPath !== fileName) await deleteOne(thumbPath, { allow404: true })
  const mediumPath = resolvePath(fileName, 'medium')
  if (mediumPath && mediumPath !== fileName) await deleteOne(mediumPath, { allow404: true })
}

async function deleteByPrefix(prefix, idToken) {
  const response = await fetch(listUrl(prefix), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!response.ok) {
    throw new Error(`Bulk delete failed for prefix "${prefix}": ${response.status}`)
  }
  const data = await response.json().catch(() => ({}))
  return Number(data?.deleted || 0)
}

async function listByPrefix(prefix) {
  const response = await fetch(listUrl(prefix), { method: 'GET' })
  if (!response.ok) {
    throw new Error(`List verification failed for prefix "${prefix}": ${response.status}`)
  }
  const raw = await response.json().catch(() => [])
  const arr = Array.isArray(raw) ? raw : (raw?.Contents ?? raw?.objects ?? raw?.items ?? [])
  return arr
}

/**
 * Bulk delete all R2 objects for a gallery under the current storage structure.
 * Requires Firebase idToken.
 */
export const deleteGalleryFolder = async (galleryId, idToken, _ownerUid = '') => {
  requireIdToken(idToken, 'Bulk delete')
  if (!galleryId) throw new Error('Bulk delete: galleryId este obligatoriu')

  const galleryRootPrefix = `galerii/${galleryId}/`
  const deletedTotal = await deleteByPrefix(galleryRootPrefix, idToken)

  const verificationPrefixes = [
    `galerii/${galleryId}/originals/`,
    `galerii/${galleryId}/medium/`,
    `galerii/${galleryId}/thumbnails/`,
  ]

  const verificationResults = await Promise.all(
    verificationPrefixes.map((prefix) => listByPrefix(prefix).catch(() => []))
  )
  const remainingTotal = verificationResults.reduce((sum, items) => sum + items.length, 0)

  if (remainingTotal > 0) {
    throw new Error(`Bulk delete incomplete: ${remainingTotal} fișiere încă există în storage`)
  }

  return { deleted: deletedTotal, verified: true }
}

/**
 * Create or rotate secure public share token for a gallery.
 * Returns { token, expiresAt }.
 */
export const createGalleryShareToken = async (galleryId, idToken, ttlHours = 720) => {
  requireIdToken(idToken, 'Create share token')
  if (!galleryId) throw new Error('Create share token: galleryId este obligatoriu')

  const response = await fetch(shareTokenApiUrl(galleryId, ttlHours), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Create share token failed: ${response.status}`)
  }

  const data = await response.json().catch(() => ({}))
  if (!data?.token) throw new Error('Create share token failed: token lipsă din răspuns')
  return {
    token: data.token,
    expiresAt: data.expiresAt || null,
  }
}
