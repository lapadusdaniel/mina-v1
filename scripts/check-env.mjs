#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_R2_WORKER_URL',
]

const OPTIONAL_KEYS = [
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'VITE_STRIPE_PRICE_PRO',
  'VITE_STRIPE_PRICE_UNLIMITED',
  'VITE_FIREBASE_MEASUREMENT_ID',
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const result = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    result[key] = value
  }

  return result
}

const envPath = path.resolve(process.cwd(), '.env')
const envValues = parseEnvFile(envPath)

if (!fs.existsSync(envPath)) {
  console.error('ERROR: Lipseste fisierul .env in proiect.')
  process.exit(1)
}

const missingRequired = REQUIRED_KEYS.filter((key) => !envValues[key])
const missingOptional = OPTIONAL_KEYS.filter((key) => !envValues[key])

console.log(`Verificare .env: ${envPath}`)
console.log(`Required: ${REQUIRED_KEYS.length - missingRequired.length}/${REQUIRED_KEYS.length}`)
console.log(`Optional: ${OPTIONAL_KEYS.length - missingOptional.length}/${OPTIONAL_KEYS.length}`)

for (const key of REQUIRED_KEYS) {
  console.log(`${key}: ${envValues[key] ? 'OK' : 'MISSING'}`)
}

for (const key of OPTIONAL_KEYS) {
  console.log(`${key}: ${envValues[key] ? 'OK' : 'MISSING (optional)'}`)
}

if (missingRequired.length > 0) {
  console.error(`\nERROR: Lipsesc variabile obligatorii: ${missingRequired.join(', ')}`)
  process.exit(1)
}

console.log('\nOK: configurarea minima este completa.')
