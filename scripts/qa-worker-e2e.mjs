#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

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

function docFields(obj) {
  const fields = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'boolean') fields[key] = { booleanValue: value }
    else if (typeof value === 'number' && Number.isInteger(value)) fields[key] = { integerValue: String(value) }
    else fields[key] = { stringValue: String(value) }
  }
  return { fields }
}

async function createAuthUser(apiKey, email, password) {
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
  return {
    uid: data.localId,
    idToken: data.idToken,
    email,
    password,
  }
}

async function deleteAuthUser(apiKey, idToken) {
  const { res, text } = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )
  if (!res.ok) {
    throw new Error(`accounts:delete failed (${res.status}): ${text}`)
  }
}

async function createGalleryDoc({ projectId, galleryId, idToken, ownerUid }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/galerii?documentId=${encodeURIComponent(galleryId)}`
  const payload = docFields({
    userId: ownerUid,
    status: 'active',
    statusActiv: true,
    nume: `QA ${galleryId}`,
    slug: `qa-${galleryId}`,
    data: new Date().toISOString(),
  })
  const { res, text } = await jsonFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`create gallery failed (${res.status}): ${text}`)
  }
}

async function deleteGalleryDoc({ projectId, galleryId, idToken }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/galerii/${encodeURIComponent(galleryId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`delete gallery failed (${res.status}): ${text}`)
  }
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
    const userA = await createAuthUser(apiKey, emailA, password)
    const userB = await createAuthUser(apiKey, emailB, password)
    cleanup.userA = userA
    cleanup.userB = userB

    await createGalleryDoc({
      projectId,
      galleryId,
      idToken: userA.idToken,
      ownerUid: userA.uid,
    })

    const ownerUid = userA.uid
    const ownerLegacyPath = `${ownerUid}/${galleryId}/legacy-test.jpg`
    const ownerLegacyPrefix = `${ownerUid}/${galleryId}/`

    const putOwner = await fetch(`${workerBase}${encodeURIComponent(testPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userA.idToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([1, 2, 3, 4, 5]),
    })
    assert(putOwner.ok, `owner PUT failed (${putOwner.status})`)

    const putOwnerLegacy = await fetch(`${workerBase}${encodeURIComponent(ownerLegacyPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userA.idToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array([4, 5, 6]),
    })
    assert(putOwnerLegacy.ok, `owner legacy PUT failed (${putOwnerLegacy.status})`)

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
    assert(putOther.status === 403, `other user PUT should be 403, got ${putOther.status}`)

    const listPublic = await fetch(`${workerBase}?prefix=${encodeURIComponent(listPrefix)}`)
    assert(listPublic.status === 403, `public LIST without token should be 403, got ${listPublic.status}`)

    const listPublicWithToken = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(listPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    assert(listPublicWithToken.ok, `public LIST with token failed (${listPublicWithToken.status})`)
    const listed = await listPublicWithToken.json().catch(() => [])
    const found = Array.isArray(listed) && listed.some((item) => item?.key === testPath)
    assert(found, 'uploaded object not found in public list with token')

    const getWithoutToken = await fetch(`${workerBase}${encodeURIComponent(testPath)}`)
    assert(getWithoutToken.status === 403, `public GET without token should be 403, got ${getWithoutToken.status}`)

    const getWithToken = await fetch(`${workerBase}${encodeURIComponent(testPath)}?st=${encodeURIComponent(shareToken)}`)
    assert(getWithToken.ok, `public GET with token failed (${getWithToken.status})`)

    const listLegacyNoToken = await fetch(`${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}`)
    assert(listLegacyNoToken.status === 403, `legacy LIST without token should be 403, got ${listLegacyNoToken.status}`)

    const listLegacy = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    assert(listLegacy.ok, `legacy LIST with token failed (${listLegacy.status})`)
    const listedLegacy = await listLegacy.json().catch(() => [])
    const foundLegacy = Array.isArray(listedLegacy) && listedLegacy.some((item) => item?.key === ownerLegacyPath)
    assert(foundLegacy, 'uploaded legacy object not found in list')

    const deleteOther = await fetch(`${workerBase}?prefix=${encodeURIComponent(`galerii/${galleryId}/`)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userB.idToken}` },
    })
    assert(deleteOther.status === 403, `other user DELETE should be 403, got ${deleteOther.status}`)

    const deleteOwner = await fetch(`${workerBase}?prefix=${encodeURIComponent(`galerii/${galleryId}/`)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userA.idToken}` },
    })
    assert(deleteOwner.ok, `owner DELETE failed (${deleteOwner.status})`)

    const deleteOwnerLegacy = await fetch(`${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userA.idToken}` },
    })
    assert(deleteOwnerLegacy.ok, `owner legacy DELETE failed (${deleteOwnerLegacy.status})`)

    const verifyNewEmptyRes = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(listPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    assert(verifyNewEmptyRes.ok, `verify new list failed (${verifyNewEmptyRes.status})`)
    const verifyNewEmpty = await verifyNewEmptyRes.json().catch(() => [])
    assert(Array.isArray(verifyNewEmpty) && verifyNewEmpty.length === 0, 'new prefix still contains objects after delete')

    const verifyLegacyEmptyRes = await fetch(
      `${workerBase}?prefix=${encodeURIComponent(ownerLegacyPrefix)}&st=${encodeURIComponent(shareToken)}`
    )
    assert(verifyLegacyEmptyRes.ok, `verify legacy list failed (${verifyLegacyEmptyRes.status})`)
    const verifyLegacyEmpty = await verifyLegacyEmptyRes.json().catch(() => [])
    assert(Array.isArray(verifyLegacyEmpty) && verifyLegacyEmpty.length === 0, 'legacy prefix still contains objects after delete')

    await deleteGalleryDoc({ projectId, galleryId, idToken: userA.idToken })

    console.log('QA Worker E2E PASSED')
    console.log(`Owner UID: ${userA.uid}`)
    console.log(`Other UID: ${userB.uid}`)
    console.log(`Gallery ID: ${galleryId}`)
  } finally {
    try {
      if (cleanup.userA?.idToken) await deleteAuthUser(apiKey, cleanup.userA.idToken)
    } catch (err) {
      console.warn(`Cleanup owner failed: ${err.message || err}`)
    }
    try {
      if (cleanup.userB?.idToken) await deleteAuthUser(apiKey, cleanup.userB.idToken)
    } catch (err) {
      console.warn(`Cleanup other failed: ${err.message || err}`)
    }
  }
}

main().catch((err) => {
  console.error(`QA Worker E2E FAILED: ${err.message || err}`)
  process.exit(1)
})
