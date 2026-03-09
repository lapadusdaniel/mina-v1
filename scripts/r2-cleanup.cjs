/**
 * Curăță prefixele orfane din R2 care nu mai au galerie activă în Firestore.
 *
 * Rulare:
 *   node scripts/r2-cleanup.cjs --dry-run
 *   node scripts/r2-cleanup.cjs
 */

const fs = require('fs')
const path = require('path')
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3')
const admin = require('firebase-admin')

const R2_PREFIX = 'galerii/'
const R2_BUCKET_NAME = 'mina-v1-media'
const DELETE_BATCH_SIZE = 50
const DRY_RUN = process.argv.includes('--dry-run')

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Lipsește variabila de environment ${name}.`)
  }
  return value
}

function createR2Client() {
  const accountId = getRequiredEnv('R2_ACCOUNT_ID')
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY')

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

function initializeFirestore() {
  const serviceAccountPath = getRequiredEnv('GOOGLE_APPLICATION_CREDENTIALS')
  const resolvedPath = path.resolve(serviceAccountPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Fișierul GOOGLE_APPLICATION_CREDENTIALS nu există: ${resolvedPath}`)
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
  }

  return admin.firestore()
}

function getGalleryIdFromPrefix(prefix) {
  const match = String(prefix || '').match(/^galerii\/([^/]+)\/$/)
  return match?.[1] || ''
}

function isActiveGallery(data) {
  const status = String(data?.status || '').trim().toLowerCase()
  if (status === 'trash' || status === 'archived') return false
  if (data?.statusActiv === false) return false
  return true
}

async function listR2GalleryIds(client) {
  const galleryIds = new Set()
  let continuationToken

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: R2_PREFIX,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
    )

    for (const item of response.CommonPrefixes || []) {
      const galleryId = getGalleryIdFromPrefix(item.Prefix)
      if (galleryId) galleryIds.add(galleryId)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return Array.from(galleryIds).sort()
}

async function listActiveFirestoreGalleryIds(db) {
  const snapshot = await db.collection('galerii').get()
  const galleryIds = new Set()

  snapshot.forEach((doc) => {
    if (isActiveGallery(doc.data())) {
      galleryIds.add(doc.id)
    }
  })

  return galleryIds
}

async function listKeysForPrefix(client, prefix) {
  const keys = []
  let continuationToken

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    for (const item of response.Contents || []) {
      if (item.Key) keys.push(item.Key)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

async function deleteKeysInBatches(client, keys) {
  let deletedCount = 0

  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    const batch = keys.slice(index, index + DELETE_BATCH_SIZE)
    if (!batch.length) continue

    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: false,
        },
      })
    )

    const deletedNow = response.Deleted?.length || 0
    const errors = response.Errors || []
    if (errors.length) {
      throw new Error(`DeleteObjects a eșuat: ${errors.map((item) => `${item.Key}: ${item.Message}`).join('; ')}`)
    }

    deletedCount += deletedNow
  }

  return deletedCount
}

async function main() {
  console.log(`R2 cleanup ${DRY_RUN ? '(dry-run)' : '(live)'}`)

  const client = createR2Client()
  const db = initializeFirestore()

  console.log('Citesc prefixele din R2...')
  const r2GalleryIds = await listR2GalleryIds(client)
  console.log(`R2: ${r2GalleryIds.length} prefixe unice`)

  console.log('Citesc galeriile active din Firestore...')
  const firestoreGalleryIds = await listActiveFirestoreGalleryIds(db)
  console.log(`Firestore: ${firestoreGalleryIds.size} galerii active`)

  const orphanGalleryIds = r2GalleryIds.filter((galleryId) => !firestoreGalleryIds.has(galleryId))

  if (!orphanGalleryIds.length) {
    console.log('Nu există prefixe orfane în R2.')
    return
  }

  console.log(`Prefixe orfane găsite: ${orphanGalleryIds.length}`)
  orphanGalleryIds.forEach((galleryId) => {
    console.log(`- galerii/${galleryId}/`)
  })

  if (DRY_RUN) {
    console.log('Dry run activ: nu s-a șters nimic.')
    return
  }

  let totalDeleted = 0

  for (const galleryId of orphanGalleryIds) {
    const prefix = `${R2_PREFIX}${galleryId}/`
    const keys = await listKeysForPrefix(client, prefix)
    if (!keys.length) continue

    const deletedCount = await deleteKeysInBatches(client, keys)
    totalDeleted += deletedCount
    console.log(`Șters ${deletedCount} obiecte din ${prefix}`)
  }

  console.log(`Cleanup complet. Obiecte șterse: ${totalDeleted}`)
}

main().catch((error) => {
  console.error('Cleanup eșuat:', error?.message || String(error))
  process.exit(1)
})
