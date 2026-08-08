import { execFileSync } from 'node:child_process'

const projectId = process.env.FIREBASE_PROJECT_ID || 'mina-v1-aea51'
const expectedBucketName = 'mina-photos'
const expectedRule = {
  daysFromHidingToDeleting: 1,
  daysFromUploadingToHiding: null,
  fileNamePrefix: '',
}

function readSecret(name) {
  return execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'firebase-tools', 'functions:secrets:access', name, '--project', projectId],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const detail = data?.message || data?.code || `HTTP ${response.status}`
    throw new Error(`${response.status}: ${detail}`)
  }
  return data
}

function sameRule(left, right) {
  return left?.daysFromHidingToDeleting === right.daysFromHidingToDeleting
    && left?.daysFromUploadingToHiding === right.daysFromUploadingToHiding
    && String(left?.fileNamePrefix || '') === right.fileNamePrefix
}

const keyId = readSecret('B2_KEY_ID')
const applicationKey = readSecret('B2_APPLICATION_KEY')
const configuredBucketName = readSecret('B2_BUCKET_NAME')

if (configuredBucketName !== expectedBucketName) {
  throw new Error(`Bucket neașteptat: ${configuredBucketName || '(gol)'}`)
}

const authorization = await requestJson(
  'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
  {
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString('base64')}`,
    },
  },
)

const accountId = String(authorization?.accountId || '')
const apiUrl = String(authorization?.apiInfo?.storageApi?.apiUrl || authorization?.apiUrl || '')
const authorizationToken = String(authorization?.authorizationToken || '')
if (!accountId || !apiUrl || !authorizationToken) {
  throw new Error('Răspunsul de autorizare B2 este incomplet.')
}

async function getBucket() {
  const result = await requestJson(`${apiUrl}/b2api/v4/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId, bucketName: expectedBucketName }),
  })
  const bucket = result?.buckets?.[0]
  if (!bucket || bucket.bucketName !== expectedBucketName) {
    throw new Error(`Bucketul ${expectedBucketName} nu a fost găsit.`)
  }
  return bucket
}

const before = await getBucket()
const beforeRules = Array.isArray(before.lifecycleRules) ? before.lifecycleRules : []

if (beforeRules.length === 1 && sameRule(beforeRules[0], expectedRule)) {
  console.log('Lifecycle B2 este deja configurat corect.')
  process.exit(0)
}

if (beforeRules.length > 0) {
  throw new Error('Bucketul are deja alte reguli lifecycle; oprire pentru a evita suprascrierea lor.')
}

await requestJson(`${apiUrl}/b2api/v4/b2_update_bucket`, {
  method: 'POST',
  headers: {
    Authorization: authorizationToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    accountId,
    bucketId: before.bucketId,
    ifRevisionIs: before.revision,
    lifecycleRules: [expectedRule],
  }),
})

const after = await getBucket()
const afterRules = Array.isArray(after.lifecycleRules) ? after.lifecycleRules : []
if (afterRules.length !== 1 || !sameRule(afterRules[0], expectedRule)) {
  throw new Error('Verificarea lifecycle după update a eșuat.')
}

console.log('Lifecycle B2 activ: versiunile ascunse se șterg după 1 zi.')
