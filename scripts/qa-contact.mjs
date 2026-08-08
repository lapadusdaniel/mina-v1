#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { addDoc, collection, getFirestore as getClientFirestore } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

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

function loadAdminDb() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(process.cwd(), 'serviceAccount.json'),
    path.resolve(process.cwd(), 'mina-service-account.json'),
  ].filter(Boolean)
  const credentialsPath = candidates.find((candidate) => fs.existsSync(candidate))
  assert(credentialsPath, 'Lipsește cheia service account necesară pentru QA.')
  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
  const adminApp = getApps()[0] || initializeAdminApp({ credential: cert(serviceAccount) })
  return getFirestore(adminApp)
}

async function main() {
  const env = parseEnvFile(path.resolve(process.cwd(), '.env'))
  const clientApp = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }, `qa-contact-${Date.now()}`)
  const adminDb = loadAdminDb()
  const clientDb = getClientFirestore(clientApp)
  const submitContactMessage = httpsCallable(getFunctions(clientApp, 'us-central1'), 'submitContactMessage')
  const email = `qa-contact-${Date.now()}@example.com`

  try {
    try {
      await addDoc(collection(clientDb, 'contactMessages'), {
        name: 'QA direct write',
        email,
        message: 'Acest mesaj trebuie refuzat de reguli.',
        createdAt: new Date(),
      })
      throw new Error('Scrierea publică directă a fost permisă.')
    } catch (error) {
      const code = String(error?.code || '')
      assert(code === 'permission-denied' || code.endsWith('/permission-denied'), error?.message || 'Eroare neașteptată la testul regulilor.')
    }

    if (process.argv.includes('--rules-only')) {
      console.log('QA Contact Rules PASSED')
      console.log('Scrierea publică directă în Firestore este blocată.')
      return
    }

    const response = await submitContactMessage({
      name: 'QA Contact Mina',
      email,
      message: 'Mesaj automat de verificare — poate fi șters.',
      photographerUid: 'qa-contact-no-email',
    })
    assert(response?.data?.accepted === true, 'Endpoint-ul nu a acceptat mesajul QA.')

    const messages = await adminDb.collection('contactMessages').where('email', '==', email).get()
    assert(messages.size === 1, `Așteptat 1 mesaj salvat, găsit ${messages.size}.`)
    await Promise.all(messages.docs.map((messageDoc) => messageDoc.ref.delete()))
    console.log('QA Contact PASSED')
    console.log('Mesajul a fost validat, salvat server-side și șters după test; nu a fost trimis email.')
  } finally {
    await deleteApp(clientApp).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`QA Contact FAILED: ${error?.message || error}`)
  process.exit(1)
})
