import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

function mapDoc(snap) {
  return { id: snap.id, ...snap.data() }
}

export function createAdminModule({ db }) {
  return {
    async listUsers() {
      const snap = await getDocs(collection(db, 'users'))
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    },

    async countUserGalleries(uid) {
      const snap = await getDocs(query(collection(db, 'galerii'), where('userId', '==', uid)))
      return snap.size
    },

    async getUserPlanOverride(uid) {
      const overrideDoc = await getDoc(doc(db, 'adminOverrides', uid))
      return overrideDoc.exists() ? overrideDoc.data().plan || null : null
    },

    async listUserSubscriptions(uid) {
      const snap = await getDocs(collection(db, 'customers', uid, 'subscriptions'))
      return snap.docs.map(mapDoc)
    },

    watchGalleries(onChange, onError) {
      return onSnapshot(
        collection(db, 'galerii'),
        (snap) => onChange(snap.docs.map(mapDoc)),
        onError
      )
    },

    async listAllSubscriptions() {
      const customersSnap = await getDocs(collection(db, 'customers'))
      const allSubs = []
      for (const customerDoc of customersSnap.docs) {
        const uid = customerDoc.id
        const subsSnap = await getDocs(collection(db, 'customers', uid, 'subscriptions'))
        subsSnap.docs.forEach((s) => {
          allSubs.push({ uid, ...s.data() })
        })
      }
      return allSubs
    },

    watchContactMessages(onChange, onError) {
      return onSnapshot(
        query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc')),
        (snap) => onChange(snap.docs.map(mapDoc)),
        onError
      )
    },

    async getPlatformSettings() {
      const snap = await getDoc(doc(db, 'adminSettings', 'platform'))
      return snap.exists() ? snap.data() : null
    },

    async savePlatformSettings(settings) {
      await setDoc(
        doc(db, 'adminSettings', 'platform'),
        { ...settings, updatedAt: new Date() },
        { merge: true }
      )
    },

    async setPlanOverride(uid, plan) {
      await setDoc(doc(db, 'adminOverrides', uid), { plan, updatedAt: new Date() }, { merge: true })
    },

    async setUserStatus(uid, status) {
      await updateDoc(doc(db, 'users', uid), { status })
      await setDoc(doc(db, 'profiles', uid), { status }, { merge: true })
    },

    async setUserAdmin(uid, isAdmin) {
      await updateDoc(doc(db, 'users', uid), {
        role: isAdmin ? 'admin' : 'user',
        isAdmin: !!isAdmin,
        updatedAt: new Date(),
      })
    },

    async deleteUser(uid) {
      await deleteDoc(doc(db, 'users', uid))
      try {
        await deleteDoc(doc(db, 'profiles', uid))
      } catch (_) {
        // Ignore missing profile docs to keep delete flow resilient.
      }
    },

    async markContactMessageRead(id) {
      await updateDoc(doc(db, 'contactMessages', id), { read: true })
    },
  }
}
