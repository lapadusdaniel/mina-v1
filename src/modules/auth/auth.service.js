import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const BOOTSTRAP_ADMIN_EMAIL = 'lapadusdaniel@gmail.com'

function isBootstrapAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL
}

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
  const bootstrapAdmin = isBootstrapAdminEmail(firebaseUser?.email)

  return {
    name: fallbackName || 'Utilizator',
    brandName: '',
    email: firebaseUser?.email || '',
    createdAt: new Date().toISOString(),
    plan: 'Free',
    role: bootstrapAdmin ? 'admin' : 'user',
    isAdmin: bootstrapAdmin,
    status: 'active',
  }
}

async function ensureUserProfileDoc(db, firebaseUser) {
  if (!firebaseUser?.uid) return null
  const ref = doc(db, 'users', firebaseUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const current = snap.data() || {}
    if (isBootstrapAdminEmail(firebaseUser?.email) && !(current.isAdmin === true || current.role === 'admin')) {
      const promoted = {
        role: 'admin',
        isAdmin: true,
        updatedAt: new Date().toISOString(),
      }
      await setDoc(ref, promoted, { merge: true })
      return { ...current, ...promoted }
    }
    return current
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
      const bootstrapAdmin = isBootstrapAdminEmail(email)

      await updateProfile(userCredential.user, { displayName: name })

      await setDoc(doc(db, 'users', uid), {
        name,
        brandName,
        email,
        createdAt: new Date().toISOString(),
        plan: 'Free',
        role: bootstrapAdmin ? 'admin' : 'user',
        isAdmin: bootstrapAdmin,
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
        role: bootstrapAdmin ? 'admin' : 'user',
        isAdmin: bootstrapAdmin,
      })
    },

    async logout() {
      await signOut(auth)
    },
  }
}
