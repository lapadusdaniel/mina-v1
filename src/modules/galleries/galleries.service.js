import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  increment,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  limit as limitQuery,
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

function sanitizeClientMeta(meta = {}) {
  const normalize = (value, maxLen) => String(value || '').trim().slice(0, maxLen)
  return {
    clientEmail: normalize(meta.clientEmail, 190),
    clientPhone: normalize(meta.clientPhone, 40),
    clientAdditionalInfo: normalize(meta.clientAdditionalInfo, 1000),
    clientComment: normalize(meta.clientComment, 1000),
  }
}

function sanitizeReviewPayload(payload = {}) {
  const name = String(payload.name || '').trim().slice(0, 120)
  const message = String(payload.message || '').trim().slice(0, 2000)
  const ratingRaw = Number(payload.rating)
  const rating = Number.isFinite(ratingRaw) ? Math.max(1, Math.min(5, Math.round(ratingRaw))) : null
  return {
    name,
    message,
    rating,
  }
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

    async adjustUserStorageUsed(uid, deltaBytes) {
      if (!uid) return
      const delta = Math.trunc(Number(deltaBytes || 0))
      if (!Number.isFinite(delta) || delta === 0) return

      const userRef = doc(db, 'users', uid)
      await setDoc(
        userRef,
        {
          storageUsedBytes: increment(delta),
          updatedAt: new Date(),
        },
        { merge: true }
      )
    },

    async setUserStorageUsed(uid, totalBytes) {
      if (!uid) return
      const value = Math.max(0, Math.trunc(Number(totalBytes || 0)))
      await setDoc(
        doc(db, 'users', uid),
        {
          storageUsedBytes: value,
          updatedAt: new Date(),
        },
        { merge: true }
      )
    },

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
          clientEmail: String(data?.clientEmail || ''),
          clientPhone: String(data?.clientPhone || ''),
          clientAdditionalInfo: String(data?.clientAdditionalInfo || ''),
          clientComment: String(data?.clientComment || ''),
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
        clientEmail: '',
        clientPhone: '',
        clientAdditionalInfo: '',
        clientComment: '',
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
            clientEmail: String(data?.clientEmail || ''),
            clientPhone: String(data?.clientPhone || ''),
            clientAdditionalInfo: String(data?.clientAdditionalInfo || ''),
            clientComment: String(data?.clientComment || ''),
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
            clientEmail: '',
            clientPhone: '',
            clientAdditionalInfo: '',
            clientComment: '',
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

    async saveClientSelection(galleryId, clientName, keys, selectionTitle = '', clientMeta = {}) {
      const normalizedName = normalizeClientName(clientName)
      if (!galleryId || !normalizedName) throw new Error('saveClientSelection: galleryId și clientName sunt obligatorii')

      const clientId = toClientSelectionId(normalizedName)
      if (!clientId) throw new Error('saveClientSelection: clientId invalid')

      const cleanKeys = sanitizeKeys(keys)
      const cleanMeta = sanitizeClientMeta(clientMeta)
      await setDoc(
        doc(db, 'gallerySelections', galleryId, 'clients', clientId),
        {
          clientId,
          clientName: normalizedName,
          ...cleanMeta,
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

      return { clientId, clientName: normalizedName, ...cleanMeta, keys: cleanKeys }
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

    async addClientFavorite(galleryId, clientName, photoKey, selectionTitle = '', clientMeta = {}) {
      const current = await this.getClientSelection(galleryId, clientName)
      const merged = sanitizeKeys([...(current?.keys || []), photoKey])
      return this.saveClientSelection(
        galleryId,
        clientName,
        merged,
        selectionTitle,
        {
          clientEmail: clientMeta.clientEmail ?? current?.clientEmail ?? '',
          clientPhone: clientMeta.clientPhone ?? current?.clientPhone ?? '',
          clientAdditionalInfo: clientMeta.clientAdditionalInfo ?? current?.clientAdditionalInfo ?? '',
          clientComment: clientMeta.clientComment ?? current?.clientComment ?? '',
        }
      )
    },

    async removeClientFavorite(galleryId, clientName, photoKey, selectionTitle = '', clientMeta = {}) {
      const current = await this.getClientSelection(galleryId, clientName)
      const filtered = sanitizeKeys((current?.keys || []).filter((k) => k !== photoKey))
      return this.saveClientSelection(
        galleryId,
        clientName,
        filtered,
        selectionTitle,
        {
          clientEmail: clientMeta.clientEmail ?? current?.clientEmail ?? '',
          clientPhone: clientMeta.clientPhone ?? current?.clientPhone ?? '',
          clientAdditionalInfo: clientMeta.clientAdditionalInfo ?? current?.clientAdditionalInfo ?? '',
          clientComment: clientMeta.clientComment ?? current?.clientComment ?? '',
        }
      )
    },

    async submitGalleryReview(galleryId, payload = {}) {
      if (!galleryId) throw new Error('submitGalleryReview: galleryId este obligatoriu')
      const clean = sanitizeReviewPayload(payload)
      if (!clean.name) throw new Error('Numele este obligatoriu.')
      if (!clean.message) throw new Error('Mesajul recenziei este obligatoriu.')

      const data = {
        name: clean.name,
        message: clean.message,
        createdAt: new Date(),
      }
      if (Number.isFinite(clean.rating)) data.rating = clean.rating

      const ref = await addDoc(collection(db, 'galleryReviews', galleryId, 'items'), data)
      return { id: ref.id, ...data }
    },

    async listGalleryReviews(galleryId, maxItems = 50) {
      if (!galleryId) return []
      const cappedLimit = Math.max(1, Math.min(100, Number(maxItems) || 50))
      const reviewsRef = collection(db, 'galleryReviews', galleryId, 'items')
      const reviewsQuery = query(reviewsRef, orderBy('createdAt', 'desc'), limitQuery(cappedLimit))
      const snap = await getDocs(reviewsQuery)
      return snap.docs.map((d) => {
        const data = d.data() || {}
        return {
          id: d.id,
          name: String(data.name || ''),
          message: String(data.message || ''),
          rating: Number.isFinite(Number(data.rating)) ? Number(data.rating) : null,
          createdAt: data.createdAt || null,
        }
      })
    },

    async deleteGallery(galleryId) {
      await deleteDoc(doc(db, 'galerii', galleryId))
    },
  }
}
