#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parseEnvFile(filePath) {
  const result = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return result
}

function loadAdminServices() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(process.cwd(), 'serviceAccount.json'),
    path.resolve(process.cwd(), 'mina-service-account.json'),
  ].filter(Boolean)
  const credentialsPath = candidates.find((candidate) => fs.existsSync(candidate))
  assert(credentialsPath, 'Lipsește cheia service account necesară pentru QA.')
  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
  const app = getApps()[0] || initializeAdminApp({ credential: cert(serviceAccount) })
  return { adminAuth: getAdminAuth(app), adminDb: getAdminFirestore(app) }
}

async function expectCallableError(action, expectedCode) {
  try {
    await action()
  } catch (error) {
    const code = String(error?.code || '')
    if (code === expectedCode || code.endsWith(`/${expectedCode}`)) return
    throw new Error(`Cod neașteptat: ${code || error?.message || 'necunoscut'}; așteptat ${expectedCode}`)
  }
  throw new Error(`Apelul trebuia să eșueze cu ${expectedCode}`)
}

async function main() {
  const env = parseEnvFile(path.resolve(process.cwd(), '.env'))
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  assert(firebaseConfig.apiKey && firebaseConfig.projectId, 'Config Firebase incompletă.')

  const { adminAuth, adminDb } = loadAdminServices()
  const clientApp = initializeApp(firebaseConfig, `qa-launch-${Date.now()}`)
  const clientAuth = getAuth(clientApp)
  const clientFunctions = getFunctions(clientApp, 'us-central1')
  if (process.env.FUNCTIONS_EMULATOR_HOST) {
    const [host, port] = process.env.FUNCTIONS_EMULATOR_HOST.split(':')
    connectFunctionsEmulator(clientFunctions, host, Number(port))
  }

  const createGallery = httpsCallable(clientFunctions, 'createGallery')
  const setGalleryStatus = httpsCallable(clientFunctions, 'setGalleryStatus')
  const savePhotographerSite = httpsCallable(clientFunctions, 'savePhotographerSite')
  const stamp = Date.now()
  const password = `Qa!${stamp}Safe`
  const verifiedEmail = `qa-guards-verified-${stamp}@example.com`
  const unverifiedEmail = `qa-guards-unverified-${stamp}@example.com`
  const createdUids = []
  let verifiedUid = ''

  try {
    const verifiedUser = await adminAuth.createUser({
      email: verifiedEmail,
      password,
      emailVerified: true,
    })
    verifiedUid = verifiedUser.uid
    createdUids.push(verifiedUid)
    await signInWithEmailAndPassword(clientAuth, verifiedEmail, password)

    const createdGalleryIds = []
    for (let index = 1; index <= 3; index += 1) {
      const result = await createGallery({
        gallery: {
          nume: `QA Guard ${index}`,
          slug: `qa-guard-${stamp}-${index}`,
          categoria: 'Portret',
          settings: {},
        },
      })
      assert(result?.data?.id, `Galeria ${index} nu a fost creată.`)
      createdGalleryIds.push(result.data.id)
    }

    await expectCallableError(
      () => createGallery({ gallery: { nume: 'QA Guard limit', slug: `qa-guard-${stamp}-limit`, settings: {} } }),
      'resource-exhausted'
    )

    await setGalleryStatus({ galleryId: createdGalleryIds[0], status: 'archived' })
    const replacement = await createGallery({
      gallery: { nume: 'QA Guard replacement', slug: `qa-guard-${stamp}-replacement`, settings: {} },
    })
    assert(replacement?.data?.id, 'Crearea după arhivare a eșuat.')

    await expectCallableError(
      () => savePhotographerSite({ site: { brandName: 'QA Free Site', slug: `qa-free-site-${stamp}` } }),
      'permission-denied'
    )

    await adminDb.collection('adminOverrides').doc(verifiedUid).set({ plan: 'Esențial' })
    const paidGallery = await createGallery({
      gallery: { nume: 'QA Paid Gallery', slug: `qa-paid-gallery-${stamp}`, settings: {} },
    })
    assert(
      paidGallery?.data?.id,
      'Override-ul Esențial nu a eliminat limita de 3 galerii active.'
    )
    const savedSite = await savePhotographerSite({
      site: { brandName: 'QA Paid Site', slug: `qa-paid-site-${stamp}`, tagline: 'Test' },
    })
    assert(savedSite?.data?.ok === true, 'Site-ul plătit nu a fost salvat.')

    await signOut(clientAuth)
    const unverifiedUser = await adminAuth.createUser({
      email: unverifiedEmail,
      password,
      emailVerified: false,
    })
    createdUids.push(unverifiedUser.uid)
    await signInWithEmailAndPassword(clientAuth, unverifiedEmail, password)
    await expectCallableError(
      () => createGallery({ gallery: { nume: 'QA Neverificat', slug: `qa-unverified-${stamp}`, settings: {} } }),
      'failed-precondition'
    )

    console.log('QA Launch Guards PASSED')
    console.log('Free: 3 galerii active, a patra blocată; creare permisă după arhivare.')
    console.log('Esențial: a patra galerie și site-ul sunt permise prin override Admin.')
    console.log('Email: contul neverificat este blocat la creare.')
  } finally {
    await signOut(clientAuth).catch(() => {})
    if (verifiedUid) {
      const galleries = await adminDb.collection('galerii').where('userId', '==', verifiedUid).get().catch(() => null)
      if (galleries) {
        for (const galleryDoc of galleries.docs) {
          const slug = String(galleryDoc.data()?.slug || '').trim()
          await galleryDoc.ref.delete().catch(() => {})
          if (slug) await adminDb.collection('slugs').doc(slug).delete().catch(() => {})
        }
      }
      const siteSnap = await adminDb.collection('photographerSites').doc(verifiedUid).get().catch(() => null)
      const siteSlug = String(siteSnap?.data()?.slug || '').trim()
      await adminDb.collection('photographerSites').doc(verifiedUid).delete().catch(() => {})
      if (siteSlug) await adminDb.collection('siteSlugs').doc(siteSlug).delete().catch(() => {})
      await adminDb.collection('adminOverrides').doc(verifiedUid).delete().catch(() => {})
    }
    for (const uid of createdUids) {
      for (const collectionName of [
        'users',
        'profiles',
        'setariFotografi',
        'photographerSites',
        'adminOverrides',
        'customers',
      ]) {
        await adminDb.recursiveDelete(adminDb.collection(collectionName).doc(uid)).catch(() => {})
      }
    }
    await Promise.all(createdUids.map((uid) => adminAuth.deleteUser(uid).catch(() => {})))
    await deleteApp(clientApp).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`QA Launch Guards FAILED: ${error?.message || error}`)
  process.exit(1)
})
