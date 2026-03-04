import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit as limitQuery,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

function mapDoc(snap) {
  return { id: snap.id, ...snap.data() }
}

function sanitizeFolderName(name) {
  return String(name || '').trim().slice(0, 120)
}

function toPhotoDocId(photoKey) {
  return encodeURIComponent(String(photoKey || '').trim())
}

function fromPhotoDocId(photoDocId) {
  try {
    return decodeURIComponent(String(photoDocId || ''))
  } catch (_) {
    return String(photoDocId || '')
  }
}

export function createFoldersService({ db }) {
  return {
    async createFolder(galleryId, { name }) {
      if (!galleryId) throw new Error('createFolder: galleryId este obligatoriu')
      const folderName = sanitizeFolderName(name)
      if (!folderName) throw new Error('createFolder: name este obligatoriu')

      const foldersRef = collection(db, 'galerii', galleryId, 'folders')
      const lastFolderQuery = query(foldersRef, orderBy('order', 'desc'), limitQuery(1))
      const lastFolderSnap = await getDocs(lastFolderQuery)
      const lastOrder = lastFolderSnap.empty ? -1 : Number(lastFolderSnap.docs[0].data()?.order || 0)
      const nextOrder = lastOrder + 1

      const payload = {
        name: folderName,
        order: nextOrder,
        createdAt: new Date(),
        photoCount: 0,
      }

      const createdRef = await addDoc(foldersRef, payload)
      return { id: createdRef.id, ...payload }
    },

    async getFolders(galleryId) {
      if (!galleryId) return []
      const foldersRef = collection(db, 'galerii', galleryId, 'folders')
      const folderQuery = query(foldersRef, orderBy('order', 'asc'))
      const folderSnap = await getDocs(folderQuery)
      return folderSnap.docs.map(mapDoc)
    },

    async updateFolder(galleryId, folderId, { name }) {
      if (!galleryId || !folderId) throw new Error('updateFolder: galleryId și folderId sunt obligatorii')
      const folderName = sanitizeFolderName(name)
      if (!folderName) throw new Error('updateFolder: name este obligatoriu')
      await updateDoc(doc(db, 'galerii', galleryId, 'folders', folderId), {
        name: folderName,
        updatedAt: new Date(),
      })
    },

    async deleteFolder(galleryId, folderId) {
      if (!galleryId || !folderId) throw new Error('deleteFolder: galleryId și folderId sunt obligatorii')
      await deleteDoc(doc(db, 'galerii', galleryId, 'folders', folderId))
    },

    async setFolderPhotoCount(galleryId, folderId, count) {
      if (!galleryId || !folderId) return
      const safeCount = Math.max(0, Number(count || 0))
      await updateDoc(doc(db, 'galerii', galleryId, 'folders', folderId), {
        photoCount: safeCount,
        updatedAt: new Date(),
      })
    },

    async incrementFolderPhotoCount(galleryId, folderId, delta) {
      if (!galleryId || !folderId) return
      const safeDelta = Math.trunc(Number(delta || 0))
      if (!Number.isFinite(safeDelta) || safeDelta === 0) return
      await updateDoc(doc(db, 'galerii', galleryId, 'folders', folderId), {
        photoCount: increment(safeDelta),
        updatedAt: new Date(),
      })
    },

    async upsertPhotoMetadata(galleryId, photoKey, data = {}) {
      if (!galleryId || !photoKey) return
      const folderId = String(data?.folderId || '').trim()
      const payload = {
        key: String(photoKey),
        folderId: folderId || null,
        size: Math.max(0, Number(data?.size || 0)),
        lastModified: data?.lastModified || null,
        updatedAt: new Date(),
      }
      if (data?.createdAt) payload.createdAt = data.createdAt
      else payload.createdAt = new Date()

      await setDoc(
        doc(db, 'galerii', galleryId, 'photos', toPhotoDocId(photoKey)),
        payload,
        { merge: true }
      )
    },

    async listPhotoMetadata(galleryId) {
      if (!galleryId) return []
      const photosRef = collection(db, 'galerii', galleryId, 'photos')
      const snap = await getDocs(photosRef)
      return snap.docs.map((d) => {
        const data = d.data() || {}
        return {
          id: d.id,
          key: String(data.key || fromPhotoDocId(d.id)),
          folderId: data.folderId ? String(data.folderId) : null,
          size: Math.max(0, Number(data.size || 0)),
          lastModified: data.lastModified || null,
          createdAt: data.createdAt || null,
        }
      })
    },

    async deletePhotoMetadata(galleryId, photoKey) {
      if (!galleryId || !photoKey) return
      await deleteDoc(doc(db, 'galerii', galleryId, 'photos', toPhotoDocId(photoKey))).catch(() => {})
    },

    async deletePhotoMetadataByFolder(galleryId, folderId) {
      if (!galleryId || !folderId) return { count: 0, keys: [], totalSize: 0 }
      const photosRef = collection(db, 'galerii', galleryId, 'photos')
      const snap = await getDocs(query(photosRef, where('folderId', '==', folderId)))
      if (snap.empty) return { count: 0, keys: [], totalSize: 0 }

      const keys = []
      let totalSize = 0
      const batch = writeBatch(db)

      snap.docs.forEach((d) => {
        const data = d.data() || {}
        const key = String(data.key || fromPhotoDocId(d.id))
        if (key) keys.push(key)
        totalSize += Math.max(0, Number(data.size || 0))
        batch.delete(d.ref)
      })

      await batch.commit()
      return { count: snap.size, keys, totalSize }
    },
  }
}
