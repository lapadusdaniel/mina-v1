/**
 * One-time migration: move passwordHash from galerii/{galleryId}.settings.privacy
 * to the private gallerySecrets/{galleryId} collection.
 *
 * After running this script:
 * - Each gallery's passwordHash is in gallerySecrets/{galleryId}.passwordHash (private)
 * - The passwordHash field is removed from galerii/{galleryId}.settings.privacy
 * - The passwordProtected flag remains in galerii/{galleryId}.settings.privacy
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/migrate-gallery-passwords.js
 *   # or with Application Default Credentials (if running on GCP / after `gcloud auth application-default login`):
 *   node scripts/migrate-gallery-passwords.js
 *
 * Set DRY_RUN=true to preview without writing:
 *   DRY_RUN=true node scripts/migrate-gallery-passwords.js
 */

'use strict'

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()
const DRY_RUN = process.env.DRY_RUN === 'true'

async function main() {
  console.log(`Starting gallery password migration. DRY_RUN=${DRY_RUN}`)

  const galleriesSnap = await db.collection('galerii').get()
  console.log(`Found ${galleriesSnap.size} gallery documents.`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const doc of galleriesSnap.docs) {
    const data = doc.data()
    const passwordHash = data?.settings?.privacy?.passwordHash

    if (!passwordHash || typeof passwordHash !== 'string' || !passwordHash.trim()) {
      skipped++
      continue
    }

    const galleryId = doc.id
    console.log(`Migrating gallery ${galleryId} (hash length: ${passwordHash.length})`)

    if (!DRY_RUN) {
      try {
        const batch = db.batch()

        // Write hash to private collection
        const secretRef = db.collection('gallerySecrets').doc(galleryId)
        batch.set(secretRef, {
          passwordHash: passwordHash.toLowerCase().trim(),
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          galleryId,
        }, { merge: true })

        // Remove hash from public gallery document
        // Use FieldValue.delete() via a plain update on the nested field.
        const galleryRef = db.collection('galerii').doc(galleryId)
        batch.update(galleryRef, {
          'settings.privacy.passwordHash': admin.firestore.FieldValue.delete(),
        })

        await batch.commit()
        migrated++
        console.log(`  ✓ Migrated gallery ${galleryId}`)
      } catch (err) {
        errors++
        console.error(`  ✗ Error migrating gallery ${galleryId}:`, err.message || err)
      }
    } else {
      console.log(`  [DRY_RUN] Would migrate gallery ${galleryId}`)
      migrated++
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  Migrated: ${migrated}`)
  console.log(`  Skipped (no password): ${skipped}`)
  console.log(`  Errors: ${errors}`)

  if (errors > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
