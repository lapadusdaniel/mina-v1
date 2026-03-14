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
  if (normalized === 'studio' || normalized === 'unlimited') return 'Studio'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'plus') return 'Plus'
  if (normalized === 'esential' || normalized === 'esențial' || normalized === 'starter') return 'Esențial'
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

function inferPlanFromSubscriptionData(data, {
  stripePriceEsentialMonthly, stripePriceEsentialYearly,
  stripePricePlusMonthly, stripePricePlusYearly,
  stripePriceProMonthly, stripePriceProYearly,
  stripePriceStudioMonthly, stripePriceStudioYearly,
  // legacy fallbacks
  stripePriceStarter, stripePricePro, stripePriceStudio,
} = {}) {
  const explicitPlan = normalizePlanFromString(
    data?.plan
    || data?.role
    || data?.metadata?.plan
    || data?.metadata?.tier
  )
  if (explicitPlan) return explicitPlan

  const priceId = data?.items?.data?.[0]?.price?.id || data?.price?.id || ''
  if (!priceId) return 'Free'

  if (priceId === stripePriceStudioMonthly || priceId === stripePriceStudioYearly || priceId === stripePriceStudio) return 'Studio'
  if (priceId === stripePriceProMonthly    || priceId === stripePriceProYearly    || priceId === stripePricePro)    return 'Pro'
  if (priceId === stripePricePlusMonthly   || priceId === stripePricePlusYearly)                                    return 'Plus'
  if (priceId === stripePriceEsentialMonthly || priceId === stripePriceEsentialYearly || priceId === stripePriceStarter) return 'Esențial'

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

    async getAdminSnapshot({
      stripePriceEsentialMonthly, stripePriceEsentialYearly,
      stripePricePlusMonthly, stripePricePlusYearly,
      stripePriceProMonthly, stripePriceProYearly,
      stripePriceStudioMonthly, stripePriceStudioYearly,
      // legacy
      stripePriceStarter, stripePricePro, stripePriceStudio,
    } = {}) {
      let usersSnap = null
      let galleriesSnap = null
      let overridesSnap = null
      let subscriptionsSnap = null

      try {
        usersSnap = await getDocs(collection(db, 'users'))
      } catch (err) {
        console.error('[getAdminSnapshot] Query failed: users', err)
      }

      try {
        galleriesSnap = await getDocs(collection(db, 'galerii'))
      } catch (err) {
        console.error('[getAdminSnapshot] Query failed: galerii', err)
      }

      try {
        overridesSnap = await getDocs(collection(db, 'adminOverrides'))
      } catch (err) {
        console.error('[getAdminSnapshot] Query failed: adminOverrides', err)
      }

      try {
        subscriptionsSnap = await getDocs(collectionGroup(db, 'subscriptions'))
      } catch (err) {
        console.error('[getAdminSnapshot] Query failed: collectionGroup(subscriptions)', err)
      }

      const users = (usersSnap?.docs ?? []).map((d) => ({ uid: d.id, ...d.data() }))

      const galleryCountByUid = {}
      ;(galleriesSnap?.docs ?? []).forEach((d) => {
        const uid = d.data()?.userId
        if (!uid) return
        galleryCountByUid[uid] = (galleryCountByUid[uid] || 0) + 1
      })

      const planOverrideByUid = {}
      ;(overridesSnap?.docs ?? []).forEach((d) => {
        const plan = normalizePlanFromString(d.data()?.plan)
        if (!plan) return
        planOverrideByUid[d.id] = plan
      })

      const subscriptions = []
      const activePlanByUid = {}
      ;(subscriptionsSnap?.docs ?? []).forEach((d) => {
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
          stripePriceEsentialMonthly, stripePriceEsentialYearly,
          stripePricePlusMonthly, stripePricePlusYearly,
          stripePriceProMonthly, stripePriceProYearly,
          stripePriceStudioMonthly, stripePriceStudioYearly,
          stripePriceStarter, stripePricePro, stripePriceStudio,
        })

        const planPriority = { Studio: 4, Pro: 3, Plus: 2, 'Esențial': 1, Free: 0 }
        const current = activePlanByUid[uid] || 'Free'
        if ((planPriority[inferredPlan] || 0) > (planPriority[current] || 0)) {
          activePlanByUid[uid] = inferredPlan
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
