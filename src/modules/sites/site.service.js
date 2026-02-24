import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

function firstOrNull(snapshot) {
  if (!snapshot || snapshot.empty) return null
  const first = snapshot.docs[0]
  return { id: first.id, ...first.data() }
}

export function createSitesModule({ db }) {
  return {
    async resolveSlugTarget(slug) {
      if (!slug) return 'notfound'

      const siteQ = query(collection(db, 'photographerSites'), where('slug', '==', slug))
      const siteSnap = await getDocs(siteQ)
      if (!siteSnap.empty) return 'site'

      try {
        const galleryQ = query(
          collection(db, 'galerii'),
          where('slug', '==', slug),
          where('status', '==', 'active'),
          where('statusActiv', '==', true)
        )
        const gallerySnap = await getDocs(galleryQ)
        if (!gallerySnap.empty) return 'gallery'
      } catch (_) {
        return 'notfound'
      }

      return 'notfound'
    },

    async getSiteBySlug(slug) {
      if (!slug) return null
      const q = query(collection(db, 'photographerSites'), where('slug', '==', slug))
      const snap = await getDocs(q)
      return firstOrNull(snap)
    },

    async getSiteByOwnerUid(uid) {
      if (!uid) return null
      const snap = await getDoc(doc(db, 'photographerSites', uid))
      return snap.exists() ? { id: snap.id, ...snap.data() } : null
    },

    async saveSiteByOwnerUid(uid, data, { merge = true } = {}) {
      if (!uid) throw new Error('saveSiteByOwnerUid: uid este obligatoriu')
      await setDoc(doc(db, 'photographerSites', uid), data, { merge })
    },

    async getProfile(uid) {
      if (!uid) return null
      const snap = await getDoc(doc(db, 'profiles', uid))
      return snap.exists() ? snap.data() : null
    },

    async saveProfile(uid, data, { merge = true } = {}) {
      if (!uid) throw new Error('saveProfile: uid este obligatoriu')
      await setDoc(doc(db, 'profiles', uid), data, { merge })
    },

    async getLegacySettings(uid) {
      if (!uid) return null
      const snap = await getDoc(doc(db, 'setariFotografi', uid))
      return snap.exists() ? snap.data() : null
    },

    async getCardProfile(uid) {
      if (!uid) return null
      const snap = await getDoc(doc(db, 'users', uid, 'settings', 'profile'))
      return snap.exists() ? snap.data() : null
    },

    async saveCardProfile(uid, data, { merge = true } = {}) {
      if (!uid) throw new Error('saveCardProfile: uid este obligatoriu')
      await setDoc(doc(db, 'users', uid, 'settings', 'profile'), data, { merge })
    },

    async getGalleriesByIds(ids = []) {
      if (!Array.isArray(ids) || ids.length === 0) return []
      const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'galerii', id))))
      return snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }))
    },

    async submitContactMessage({ name, email, phone, message, photographerUid }) {
      return addDoc(collection(db, 'contactMessages'), {
        name: name || '',
        email: email || '',
        phone: phone || '',
        message: message || '',
        photographerUid: photographerUid || null,
        createdAt: new Date(),
      })
    },
  }
}
