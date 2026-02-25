import {
  collection,
  collectionGroup,
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

function normalizePlanFromString(raw) {
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 'unlimited') return 'Unlimited'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'free') return 'Free'
  return ''
}

function extractUidFromSubscriptionSnap(snap) {
  const path = String(snap?.ref?.path || '')
  const parts = path.split('/')
  const customersIndex = parts.indexOf('customers')
  if (customersIndex < 0) return ''
  return parts[customersIndex + 1] || ''
}

function inferPlanFromSubscriptionData(data, { stripePricePro, stripePriceUnlimited }) {
  const explicitPlan = normalizePlanFromString(
    data?.plan
    || data?.role
    || data?.metadata?.plan
    || data?.metadata?.tier
  )
  if (explicitPlan) return explicitPlan

  const priceId = data?.items?.data?.[0]?.price?.id || data?.price?.id || ''
  if (priceId && priceId === stripePriceUnlimited) return 'Unlimited'
  if (priceId && priceId === stripePricePro) return 'Pro'

  return 'Free'
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

    async getAdminSnapshot({ stripePricePro, stripePriceUnlimited } = {}) {
      const [
        usersSnap,
        galleriesSnap,
        overridesSnap,
        subscriptionsSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'galerii')),
        getDocs(collection(db, 'adminOverrides')),
        getDocs(collectionGroup(db, 'subscriptions')),
      ])

      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }))

      const galleryCountByUid = {}
      galleriesSnap.docs.forEach((d) => {
        const uid = d.data()?.userId
        if (!uid) return
        galleryCountByUid[uid] = (galleryCountByUid[uid] || 0) + 1
      })

      const planOverrideByUid = {}
      overridesSnap.docs.forEach((d) => {
        const plan = normalizePlanFromString(d.data()?.plan)
        if (!plan) return
        planOverrideByUid[d.id] = plan
      })

      const subscriptions = []
      const activePlanByUid = {}
      subscriptionsSnap.docs.forEach((d) => {
        const subData = d.data() || {}
        const uid = extractUidFromSubscriptionSnap(d)
        if (!uid) return

        subscriptions.push({
          uid,
          ...subData,
        })

        const status = String(subData?.status || '').trim().toLowerCase()
        if (!['active', 'trialing'].includes(status)) return

        const inferredPlan = inferPlanFromSubscriptionData(subData, {
          stripePricePro,
          stripePriceUnlimited,
        })

        if (inferredPlan === 'Unlimited') {
          activePlanByUid[uid] = 'Unlimited'
          return
        }
        if (inferredPlan === 'Pro' && activePlanByUid[uid] !== 'Unlimited') {
          activePlanByUid[uid] = 'Pro'
        }
      })

      return {
        users,
        subscriptions,
        galleryCountByUid,
        planOverrideByUid,
        activePlanByUid,
      }
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
