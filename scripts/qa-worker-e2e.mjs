#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const result = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    result[key] = value
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {
    data = null
  }
  return { res, data, text }
}

function loadAdminServices() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(process.cwd(), 'serviceAccount.json'),
    path.resolve(process.cwd(), 'mina-service-account.json'),
  ].filter(Boolean)
  const credentialsPath = candidates.find((candidate) => fs.existsSync(candidate))
  assert(credentialsPath, 'Lipsește cheia service account necesară pentru QA Worker.')
  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) })
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) }
}

async function signInWithPassword(apiKey, email, password) {
  const { res, data, text } = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  if (!res.ok) throw new Error(`signInWithPassword failed (${res.status}): ${text}`)
  return data.idToken
}

async function createAuthUser(apiKey, adminAuth, email, password) {
  const { res, data, text } = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  )
  if (!res.ok) {
    throw new Error(`signUp failed (${res.status}): ${text}`)
  }
  await adminAuth.updateUser(data.localId, { emailVerified: true })
  const verifiedIdToken = await signInWithPassword(apiKey, email, password)
  return {
    uid: data.localId,
    idToken: verifiedIdToken,
    email,
    password,
  }
}

async function deleteAuthUser(adminAuth, uid) {
  await adminAuth.deleteUser(uid)
}

async function createGalleryDoc({ adminDb, galleryId, ownerUid }) {
  await adminDb.collection('galerii').doc(galleryId).set({
    userId: ownerUid,
    status: 'active',
    statusActiv: true,
    nume: `QA ${galleryId}`,
    slug: `qa-${galleryId}`,
    data: new Date().toISOString(),
  })
}

async function deleteGalleryDoc({ adminDb, galleryId }) {
  await adminDb.collection('galerii').doc(galleryId).delete()
}

async function main() {
  const envPath = path.resolve(process.cwd(), '.env')
  const env = parseEnvFile(envPath)
  const apiKey = env.VITE_FIREBASE_API_KEY
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const workerUrlRaw = env.VITE_R2_WORKER_URL

  assert(apiKey, 'Missing VITE_FIREBASE_API_KEY in .env')
  assert(projectId, 'Missing VITE_FIREBASE_PROJECT_ID in .env')
  assert(workerUrlRaw, 'Missing VITE_R2_WORKER_URL in .env')
  const { adminAuth, adminDb } = loadAdminServices()

  const workerBase = workerUrlRaw.endsWith('/') ? workerUrlRaw : `${workerUrlRaw}/`
  const stamp = Date.now()
  const emailA = `qa-owner-${stamp}@example.com`
  const emailB = `qa-other-${stamp}@example.com`
  const password = `Qa!${stamp}Xx`
  const galleryId = `qa-worker-${stamp}`
  const testPath = `galerii/${galleryId}/originals/e2e-test.jpg`
  const listPrefix = `galerii/${galleryId}/originals/`

  const cleanup = {
    userA: null,
    userB: null,
  }

  try {
    const userA = await createAuthUser(apiKey, adminAuth, emailA, password)
    const userB = await createAuthUser(apiKey, adminAuth, emailB, password)
    cleanup.userA = userA
    cleanup.userB = userB

    await createGalleryDoc({
      adminDb,
      galleryId,
      ownerUid: userA.uid,
    })

    const putOwner = await fetch(`${workerBase}${encodeURIComponent(testPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userA.idToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([1, 2, 3, 4, 5]),
    })
    const putOwnerBody = await putOwner.text()
    assert(putOwner.ok, `owner PUT failed (${putOwner.status}): ${putOwnerBody.slice(0, 300)}`)
    const ownerLegacyPath = `${userA.uid}/${galleryId}/legacy-test.jpg`
    const putOwnerLegacyRejected = await fetch(`${workerBase}${encodeURIComponent(ownerLegacyPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userA.idToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([4, 5, 6]),
    })
    assert(putOwnerLegacyRejected.status === 400, `legacy PUT should be 400, got ${putOwnerLegacyRejected.status}`)

    const createShareToken = await fetch(
      `${workerBase}share-token?galleryId=${encodeURIComponent(galleryId)}&ttlHours=24`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userA.idToken}` },
      }
    )
    assert(createShareToken.ok, `share-token POST failed (${createShareToken.status})`)
    const shareData = await createShareToken.json().catch(() => null)
    const shareToken = shareData?.token || ''
    assert(shareToken, 'share token missing from worker response')

    const putOther = await fetch(`${workerBase}${encodeURIComponent(testPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userB.idToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([9, 8, 7]),
    })
    const putOtherBody = await putOther.text()
    assert(
      putOther.status === 403,
      `other user PUT should be 403, got ${putOther.status}: ${putOtherBody.slice(0, 300)}`
    )

    const listPublic = await fetch(`${workerBase}?prefix=${encodeURIComponent(listPrefix)}`)
    assert(listPublic.status === 403, `public LIST without token should be 403, got ${listPublic.status}`)

    const listPublicWithToken = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(listPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    const listPublicWithTokenBody = await listPublicWithToken.text()
    assert(
      listPublicWithToken.ok,
      `public LIST with token failed (${listPublicWithToken.status}): ${listPublicWithTokenBody.slice(0, 300)}`
    )
    const listed = JSON.parse(listPublicWithTokenBody || '[]')
    const found = Array.isArray(listed) && listed.some((item) => item?.key === testPath)
    assert(found, 'uploaded object not found in public list with token')

    const getWithoutToken = await fetch(`${workerBase}${encodeURIComponent(testPath)}`)
    assert(getWithoutToken.status === 403, `public GET without token should be 403, got ${getWithoutToken.status}`)

    const getWithToken = await fetch(`${workerBase}${encodeURIComponent(testPath)}?st=${encodeURIComponent(shareToken)}`)
    assert(getWithToken.ok, `public GET with token failed (${getWithToken.status})`)
    const ownerLegacyPrefix = `${userA.uid}/${galleryId}/`
    const listLegacyNoToken = await fetch(`${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}`)
    assert(listLegacyNoToken.status === 403, `legacy LIST should be 403, got ${listLegacyNoToken.status}`)

    const deleteOther = await fetch(`${workerBase}?prefix=${encodeURIComponent(`galerii/${galleryId}/`)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userB.idToken}` },
    })
    assert(
      deleteOther.status === 403 || deleteOther.status === 404,
      `other user DELETE should be denied, got ${deleteOther.status}`
    )

    const deleteOwner = await fetch(`${workerBase}?prefix=${encodeURIComponent(`galerii/${galleryId}/`)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userA.idToken}` },
    })
    assert(deleteOwner.ok, `owner DELETE failed (${deleteOwner.status})`)
    const deleteOwnerLegacy = await fetch(`${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userA.idToken}` },
    })
    assert(deleteOwnerLegacy.status === 400, `legacy DELETE should be 400, got ${deleteOwnerLegacy.status}`)

    const verifyNewEmptyRes = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(listPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    assert(verifyNewEmptyRes.ok, `verify new list failed (${verifyNewEmptyRes.status})`)
    const verifyNewEmpty = await verifyNewEmptyRes.json().catch(() => [])
    assert(Array.isArray(verifyNewEmpty) && verifyNewEmpty.length === 0, 'new prefix still contains objects after delete')

    await deleteGalleryDoc({ adminDb, galleryId })

    console.log('QA Worker E2E PASSED')
    console.log(`Owner UID: ${userA.uid}`)
    console.log(`Other UID: ${userB.uid}`)
    console.log(`Gallery ID: ${galleryId}`)
  } finally {
    try {
      if (cleanup.userA?.uid) await deleteAuthUser(adminAuth, cleanup.userA.uid)
    } catch (err) {
      console.warn(`Cleanup owner failed: ${err.message || err}`)
    }
    try {
      if (cleanup.userB?.uid) await deleteAuthUser(adminAuth, cleanup.userB.uid)
    } catch (err) {
      console.warn(`Cleanup other failed: ${err.message || err}`)
    }
  }
}

main().catch((err) => {
  console.error(`QA Worker E2E FAILED: ${err.message || err}`)
  process.exit(1)
})
