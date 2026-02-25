import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

function normalizeUser(firebaseUser, profileData) {
  if (!firebaseUser) return null
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name:
      profileData?.name ||
      firebaseUser.displayName ||
      (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Utilizator'),
    brandName: profileData?.brandName || '',
    plan: profileData?.plan || undefined,
    role: profileData?.role || 'user',
    isAdmin: profileData?.isAdmin === true,
  }
}

function buildDefaultProfile(firebaseUser) {
  const fallbackName = firebaseUser?.displayName
    || (firebaseUser?.email ? firebaseUser.email.split('@')[0] : 'Utilizator')

  return {
    name: fallbackName || 'Utilizator',
    brandName: '',
    email: firebaseUser?.email || '',
    createdAt: new Date().toISOString(),
    plan: 'Free',
    role: 'user',
    isAdmin: false,
    status: 'active',
  }
}

async function ensureUserProfileDoc(db, firebaseUser) {
  if (!firebaseUser?.uid) return null
  const ref = doc(db, 'users', firebaseUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return snap.data() || {}
  }

  const payload = buildDefaultProfile(firebaseUser)
  await setDoc(ref, payload, { merge: true })
  return payload
}

export function createAuthModule({ auth, db }) {
  return {
    auth,
    db,
    async getCurrentIdToken(forceRefresh = false) {
      if (!auth.currentUser) return null
      return auth.currentUser.getIdToken(forceRefresh)
    },

    async getCurrentUser() {
      const current = auth.currentUser
      if (!current) return null
      const profile = await ensureUserProfileDoc(db, current)
      return normalizeUser(current, profile)
    },

    watchSession(onChange) {
      return onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          onChange(null)
          return
        }
        try {
          const profile = await ensureUserProfileDoc(db, firebaseUser)
          onChange(normalizeUser(firebaseUser, profile))
        } catch {
          onChange(normalizeUser(firebaseUser, null))
        }
      })
    },

    async loginWithEmail({ email, password }) {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const profile = await ensureUserProfileDoc(db, userCredential.user)
      return normalizeUser(userCredential.user, profile)
    },

    async registerWithEmail({ name, brandName, email, password }) {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const uid = userCredential.user.uid

      await updateProfile(userCredential.user, { displayName: name })

      await setDoc(doc(db, 'users', uid), {
        name,
        brandName,
        email,
        createdAt: new Date().toISOString(),
        plan: 'Free',
        role: 'user',
        isAdmin: false,
        status: 'active',
      })

      await setDoc(doc(db, 'setariFotografi', uid), {
        brandName,
        logo: '',
        website: '',
        telefon: '',
        descriere: '',
        categorii: ['Nunți', 'Botezuri', 'Corporate', 'Portret'],
        createdAt: new Date().toISOString(),
      })

      return normalizeUser(userCredential.user, {
        name,
        brandName,
        plan: 'Free',
        role: 'user',
        isAdmin: false,
      })
    },

    async logout() {
      await signOut(auth)
    },
  }
}
