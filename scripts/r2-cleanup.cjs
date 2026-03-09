/**
 * R2 Cleanup Script
 * Compară directoarele din R2 cu galeriile din Firestore.
 * Cu --dry-run: doar listează ce ar fi șters.
 * Fără --dry-run: șterge efectiv.
 *
 * Rulare:
 *   node scripts/r2-cleanup.js --dry-run
 *   node scripts/r2-cleanup.js
 */

const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CF_ACCOUNT_ID = 'f948bc6542801c804f5ab6e8b3c2f597'
const CF_TOKEN = 'Cu8DjA-AKTslJw5UYG1unDLeG9m6wruv2z6xo5gS'
const CF_BUCKET = 'mina-v1-media'
const R2_PREFIX = 'galerii/'

// Calea către service account JSON descărcat din Firebase Console
// Dashboard Firebase → Setări proiect → Conturi de serviciu → Generați cheie privată
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccount.json'
// ────────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')

async function listR2Directories() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${CF_BUCKET}/objects?prefix=${encodeURIComponent(R2_PREFIX)}&delimiter=%2F`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  })
  const json = await res.json()
  if (!json.success) {
    throw new Error('R2 list failed: ' + JSON.stringify(json.errors))
  }
  // common_prefixes = directoare (ex: "galerii/ABC123/")
  const prefixes = json.result?.common_prefixes || []
  return prefixes.map((p) => p.replace(R2_PREFIX, '').replace('/', ''))
}

async function listAllR2Objects(prefix) {
  const objects = []
  let cursor = null
  while (true) {
    const params = new URLSearchParams({ prefix })
    if (cursor) params.set('cursor', cursor)
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${CF_BUCKET}/objects?${params}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CF_TOKEN}` },
    })
    const json = await res.json()
    if (!json.success) throw new Error('R2 list objects failed: ' + JSON.stringify(json.errors))
    const batch = json.result?.objects || []
    objects.push(...batch.map((o) => o.key))
    if (!json.result?.truncated) break
    cursor = json.result?.cursor
  }
  return objects
}

async function deleteR2Object(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${CF_BUCKET}/objects/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  })
  if (!res.ok) {
    throw new Error(`Delete failed for ${key}: ${res.status}`)
  }
}

async function listFirestoreGalleryIds(db) {
  const snap = await db.collection('galerii').get()
  return new Set(snap.docs.map((d) => d.id))
}

async function main() {
  console.log(`\n🔍 R2 Cleanup Script ${DRY_RUN ? '(DRY RUN - nu se șterge nimic)' : '(LIVE - se șterge!)'}\n`)

  // Init Firebase Admin
  const serviceAccount = require(SERVICE_ACCOUNT_PATH)
  initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore()

  console.log('📦 Citesc galeriile din Firestore...')
  const firestoreIds = await listFirestoreGalleryIds(db)
  console.log(`   → ${firestoreIds.size} galerii în Firestore\n`)

  console.log('☁️  Citesc directoarele din R2...')
  const r2Dirs = await listR2Directories()
  console.log(`   → ${r2Dirs.length} directoare în R2\n`)

  const orphans = r2Dirs.filter((id) => !firestoreIds.has(id))
  const valid = r2Dirs.filter((id) => firestoreIds.has(id))

  console.log(`✅ Galerii valide în R2: ${valid.length}`)
  console.log(`🗑️  Directoare orfane în R2: ${orphans.length}\n`)

  if (orphans.length === 0) {
    console.log('🎉 Nu există fișiere orfane!')
    process.exit(0)
  }

  console.log('Directoare orfane:')
  orphans.forEach((id) => console.log(`  - galerii/${id}/`))
  console.log()

  if (DRY_RUN) {
    console.log('ℹ️  DRY RUN: rulează fără --dry-run pentru a șterge efectiv.')
    process.exit(0)
  }

  console.log('🗑️  Șterg fișierele orfane...')
  let totalDeleted = 0
  for (const id of orphans) {
    const prefix = `${R2_PREFIX}${id}/`
    console.log(`\n  Procesez: ${prefix}`)
    const objects = await listAllR2Objects(prefix)
    console.log(`    ${objects.length} fișiere`)
    for (const key of objects) {
      await deleteR2Object(key)
      totalDeleted++
    }
    console.log(`    ✓ Șters`)
  }

  console.log(`\n✅ Gata! ${totalDeleted} fișiere șterse din ${orphans.length} directoare orfane.`)
}

main().catch((err) => {
  console.error('❌ Eroare:', err.message)
  process.exit(1)
})
