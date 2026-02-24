import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  extractLegacySelection,
  normalizeClientName,
  sanitizeKeys,
  toClientSelectionId,
} from './selection.utils'

function mapDoc(snap) {
  return { id: snap.id, ...snap.data() }
}

async function syncSelectionAggregates(db, galleryId) {
  const allSnap = await getDocs(collection(db, 'gallerySelections', galleryId, 'clients'))
  let clientsCount = 0
  let totalCount = 0

  allSnap.forEach((d) => {
    const data = d.data()
    const list = sanitizeKeys(data?.keys || [])
    if (list.length > 0) {
      clientsCount += 1
      totalCount += list.length
    }
  })

  await updateDoc(doc(db, 'galerii', galleryId), {
    selectionClientsCount: clientsCount,
    selectionTotalCount: totalCount,
  })

  return { clientsCount, totalCount }
}

export function createGalleriesModule({ db }) {
  return {
    db,

    watchOwnerGalleries(ownerUid, onChange) {
      const q = query(collection(db, 'galerii'), where('userId', '==', ownerUid))
      return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(mapDoc)
        onChange(data)
      })
    },

    async listOwnerGalleries(ownerUid) {
      const q = query(collection(db, 'galerii'), where('userId', '==', ownerUid))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(mapDoc)
    },

    async getGalleryById(galleryId) {
      const snap = await getDoc(doc(db, 'galerii', galleryId))
      if (!snap.exists()) return null
      return mapDoc(snap)
    },

    async getGalleryBySlug(slug) {
      const q = query(
        collection(db, 'galerii'),
        where('slug', '==', slug),
        where('status', '==', 'active'),
        where('statusActiv', '==', true)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      return mapDoc(snapshot.docs[0])
    },

    async createGallery(data) {
      const docRef = await addDoc(collection(db, 'galerii'), data)
      return { id: docRef.id }
    },

    async updateGallery(galleryId, data) {
      await updateDoc(doc(db, 'galerii', galleryId), data)
    },

    async moveToTrash(galleryId, deletedAt = new Date()) {
      await updateDoc(doc(db, 'galerii', galleryId), { status: 'trash', deletedAt })
    },

    async restoreGallery(galleryId) {
      await updateDoc(doc(db, 'galerii', galleryId), { status: 'active' })
    },

    async setSelectionTitle(galleryId, title) {
      await updateDoc(doc(db, 'galerii', galleryId), { numeSelectieClient: title })
    },

    async setGalleryExpiry(galleryId, expiryIsoStringOrNull) {
      await updateDoc(doc(db, 'galerii', galleryId), {
        dataExpirare: expiryIsoStringOrNull || deleteField(),
      })
    },

    async getClientSelection(galleryId, clientName) {
      const normalizedName = normalizeClientName(clientName)
      if (!galleryId || !normalizedName) return null

      const clientId = toClientSelectionId(normalizedName)
      if (!clientId) return null

      const selectionRef = doc(db, 'gallerySelections', galleryId, 'clients', clientId)
      const selectionSnap = await getDoc(selectionRef)
      if (selectionSnap.exists()) {
        const data = selectionSnap.data()
        return {
          id: selectionSnap.id,
          clientId: data?.clientId || clientId,
          clientName: data?.clientName || normalizedName,
          keys: sanitizeKeys(data?.keys || []),
          count: Number(data?.count || 0),
          selectionTitle: data?.selectionTitle || '',
          updatedAt: data?.updatedAt || null,
          source: 'new',
        }
      }

      const gallerySnap = await getDoc(doc(db, 'galerii', galleryId))
      if (!gallerySnap.exists()) return null

      const legacyKeys = extractLegacySelection(gallerySnap.data(), normalizedName)
      if (!legacyKeys.length) return null

      return {
        id: clientId,
        clientId,
        clientName: normalizedName,
        keys: legacyKeys,
        count: legacyKeys.length,
        selectionTitle: gallerySnap.data()?.numeSelectieClient || '',
        updatedAt: null,
        source: 'legacy',
      }
    },

    async listGallerySelections(galleryId) {
      if (!galleryId) return []

      const snap = await getDocs(collection(db, 'gallerySelections', galleryId, 'clients'))
      const fromNew = snap.docs
        .map((d) => {
          const data = d.data()
          const keys = sanitizeKeys(data?.keys || [])
          return {
            id: d.id,
            clientId: data?.clientId || d.id,
            clientName: data?.clientName || d.id,
            keys,
            count: Number(data?.count || keys.length),
            selectionTitle: data?.selectionTitle || '',
            updatedAt: data?.updatedAt || null,
            source: 'new',
          }
        })
        .filter((item) => item.keys.length > 0)

      if (fromNew.length > 0) {
        fromNew.sort((a, b) => {
          const at = a.updatedAt?.toMillis?.() || 0
          const bt = b.updatedAt?.toMillis?.() || 0
          return bt - at
        })
        return fromNew
      }

      const gallerySnap = await getDoc(doc(db, 'galerii', galleryId))
      if (!gallerySnap.exists()) return []

      const galleryData = gallerySnap.data()
      const legacyMap = galleryData?.selectii || {}
      const fromLegacy = Object.entries(legacyMap)
        .map(([clientName, keys]) => {
          const normalizedName = normalizeClientName(clientName)
          const normalizedKeys = sanitizeKeys(keys)
          return {
            id: toClientSelectionId(normalizedName) || normalizedName,
            clientId: toClientSelectionId(normalizedName) || normalizedName,
            clientName: normalizedName,
            keys: normalizedKeys,
            count: normalizedKeys.length,
            selectionTitle: galleryData?.numeSelectieClient || '',
            updatedAt: null,
            source: 'legacy',
          }
        })
        .filter((item) => item.keys.length > 0)

      // Auto-migrate legacy selections to scalable subcollection when discovered in owner/admin flows.
      if (fromLegacy.length > 0) {
        try {
          await this.migrateLegacySelections(galleryId, {
            selectionTitle: galleryData?.numeSelectieClient || '',
          })
        } catch (_) {
        }
      }

      return fromLegacy
    },

    async saveClientSelection(galleryId, clientName, keys, selectionTitle = '') {
      const normalizedName = normalizeClientName(clientName)
      if (!galleryId || !normalizedName) throw new Error('saveClientSelection: galleryId și clientName sunt obligatorii')

      const clientId = toClientSelectionId(normalizedName)
      if (!clientId) throw new Error('saveClientSelection: clientId invalid')

      const cleanKeys = sanitizeKeys(keys)
      await setDoc(
        doc(db, 'gallerySelections', galleryId, 'clients', clientId),
        {
          clientId,
          clientName: normalizedName,
          keys: cleanKeys,
          count: cleanKeys.length,
          selectionTitle: selectionTitle || '',
          updatedAt: new Date(),
        },
        { merge: true }
      )

      // Keep lightweight aggregate stats on gallery doc for dashboard counters.
      try {
        await syncSelectionAggregates(db, galleryId)
      } catch (_) {
      }

      return { clientId, clientName: normalizedName, keys: cleanKeys }
    },

    async migrateLegacySelections(galleryId, { selectionTitle = '' } = {}) {
      if (!galleryId) return { migratedClients: 0, migratedPhotos: 0 }

      const galleryRef = doc(db, 'galerii', galleryId)
      const gallerySnap = await getDoc(galleryRef)
      if (!gallerySnap.exists()) return { migratedClients: 0, migratedPhotos: 0 }

      const galleryData = gallerySnap.data() || {}
      const legacyMap = galleryData?.selectii || {}
      const defaultTitle = selectionTitle || galleryData?.numeSelectieClient || ''

      let migratedClients = 0
      let migratedPhotos = 0

      for (const [rawClientName, rawKeys] of Object.entries(legacyMap)) {
        const clientName = normalizeClientName(rawClientName)
        const keys = sanitizeKeys(rawKeys)
        if (!clientName || keys.length === 0) continue

        const clientId = toClientSelectionId(clientName)
        if (!clientId) continue

        await setDoc(
          doc(db, 'gallerySelections', galleryId, 'clients', clientId),
          {
            clientId,
            clientName,
            keys,
            count: keys.length,
            selectionTitle: defaultTitle,
            updatedAt: new Date(),
          },
          { merge: true }
        )

        migratedClients += 1
        migratedPhotos += keys.length
      }

      if (migratedClients > 0) {
        try {
          await syncSelectionAggregates(db, galleryId)
        } catch (_) {
        }

        // Legacy `selectii` map can become very large; keep only scalable subcollection data.
        try {
          await updateDoc(galleryRef, {
            selectii: deleteField(),
            selectionLegacyMigratedAt: new Date(),
          })
        } catch (_) {
        }
      }

      return { migratedClients, migratedPhotos }
    },

    async addClientFavorite(galleryId, clientName, photoKey, selectionTitle = '') {
      const current = await this.getClientSelection(galleryId, clientName)
      const merged = sanitizeKeys([...(current?.keys || []), photoKey])
      return this.saveClientSelection(galleryId, clientName, merged, selectionTitle)
    },

    async removeClientFavorite(galleryId, clientName, photoKey, selectionTitle = '') {
      const current = await this.getClientSelection(galleryId, clientName)
      const filtered = sanitizeKeys((current?.keys || []).filter((k) => k !== photoKey))
      return this.saveClientSelection(galleryId, clientName, filtered, selectionTitle)
    },

    async deleteGallery(galleryId) {
      await deleteDoc(doc(db, 'galerii', galleryId))
    },
  }
}
