export const STORAGE_DURATION_OPTIONS = [
  { key: '1month', label: '1 lună', months: 1 },
  { key: '3months', label: '3 luni', months: 3 },
  { key: '6months', label: '6 luni', months: 6 },
  { key: '1year', label: '1 an', months: 12 },
]

const STORAGE_DURATION_BY_KEY = STORAGE_DURATION_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option
  return acc
}, {})

export const DEFAULT_GALLERY_SETTINGS = {
  main: {
    allowOriginalDownloads: true,
    watermarkEnabled: false,
    language: 'ro',
  },
  favorites: {
    allowPhotoSelection: true,
    favoritesName: 'Selecție fotografii',
    limitSelectedPhotos: false,
    maxSelectedPhotos: 0,
    allowComments: false,
    requireEmail: false,
    requirePhoneNumber: false,
    requireAdditionalInfo: false,
  },
  reviews: {
    allowReviews: false,
    reviewMessage: 'Lasă o recenzie dacă ți-au plăcut fotografiile.',
    askReviewAfterDownload: false,
  },
  contacts: {
    showShareButton: true,
    showBusinessCardWidget: true,
    showNameWebsiteOnCover: true,
  },
  privacy: {
    passwordProtected: false,
    passwordHash: '',
  },
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_GALLERY_SETTINGS))
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target
  const output = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(target?.[key] || {}, value)
    } else {
      output[key] = value
    }
  }
  return output
}

function normalizeDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function addMonths(baseDate, months) {
  const value = new Date(baseDate)
  value.setMonth(value.getMonth() + months)
  return value
}

export function toDateInputValue(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function normalizeGallerySettings(rawSettings = {}) {
  return deepMerge(cloneDefaults(), rawSettings || {})
}

export function slugifyGalleryName(name) {
  const normalized = normalizeDiacritics(name).toLowerCase().trim()
  const slug = normalized
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'galerie'
}

export function createGallerySlug(name) {
  const base = slugifyGalleryName(name)
  const datePrefix = new Date().toISOString().slice(0, 10)
  const randomSuffix = Math.random().toString(36).slice(2, 7)
  return `${datePrefix}-${base}-${randomSuffix}`
}

function inferDurationKeyFromDates(startDate, expiryDate) {
  if (!startDate || !expiryDate) return '1year'
  const start = new Date(startDate)
  const end = new Date(expiryDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '1year'
  const monthsDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30 * 24 * 3600000)))
  let closest = STORAGE_DURATION_OPTIONS[0]
  for (const option of STORAGE_DURATION_OPTIONS) {
    if (Math.abs(option.months - monthsDiff) < Math.abs(closest.months - monthsDiff)) {
      closest = option
    }
  }
  return closest.key
}

function resolveStoreUntil({ storageMode, storageDuration, shootDate, storeUntil }) {
  if (storageMode === 'indefinite') return null
  if (storeUntil) {
    const explicitDate = new Date(storeUntil)
    if (!Number.isNaN(explicitDate.getTime())) return explicitDate.toISOString()
  }
  const duration = STORAGE_DURATION_BY_KEY[storageDuration] || STORAGE_DURATION_BY_KEY['1year']
  const base = shootDate ? new Date(shootDate) : new Date()
  const expiry = addMonths(base, duration.months)
  if (Number.isNaN(expiry.getTime())) return null
  return expiry.toISOString()
}

export function buildGalleryFormState(gallery = null) {
  const settings = normalizeGallerySettings(gallery?.settings || {})

  const shootDate = toDateInputValue(gallery?.dataEveniment)
  const storeUntil = toDateInputValue(gallery?.dataExpirare)
  const storageMode = gallery?.dataExpirare ? 'lifetime' : 'indefinite'
  const storageDuration = inferDurationKeyFromDates(gallery?.dataEveniment || null, gallery?.dataExpirare || null)

  return {
    galleryName: gallery?.nume || '',
    category: gallery?.categoria || 'Nunți',
    shootDate,
    storageMode,
    storageDuration,
    storeUntil,
    settings,
    privacyPassword: '',
  }
}

async function sha256Hex(value) {
  const raw = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildGalleryPayload({
  formState,
  mode,
  existingGallery = null,
  ownerUid,
  ownerName,
}) {
  const settings = normalizeGallerySettings(formState?.settings || {})
  const privacyPassword = String(formState?.privacyPassword || '').trim()
  const previousHash = existingGallery?.settings?.privacy?.passwordHash || ''

  let privacyPasswordHash = previousHash
  if (settings.privacy.passwordProtected) {
    if (privacyPassword) {
      privacyPasswordHash = await sha256Hex(privacyPassword)
    } else if (!privacyPasswordHash && mode === 'create') {
      throw new Error('Introdu o parolă pentru galeria protejată.')
    }
  } else {
    privacyPasswordHash = ''
  }

  settings.privacy.passwordHash = privacyPasswordHash

  const limitEnabled = !!settings.favorites.limitSelectedPhotos
  const maxSelected = Math.max(0, Number(settings.favorites.maxSelectedPhotos || 0))

  const expiryIso = resolveStoreUntil({
    storageMode: formState.storageMode,
    storageDuration: formState.storageDuration,
    shootDate: formState.shootDate,
    storeUntil: formState.storeUntil,
  })

  const payload = {
    nume: String(formState.galleryName || '').trim(),
    categoria: formState.category || 'Nunți',
    dataEveniment: formState.shootDate ? new Date(formState.shootDate).toISOString() : null,
    dataExpirare: expiryIso,
    settings,

    // Compatibility fields already consumed in existing flows.
    numeSelectieClient: settings.favorites.favoritesName || 'Selecție fotografii',
    limitSelectie: limitEnabled ? maxSelected : null,
    maxSelectie: limitEnabled ? maxSelected : null,
    allowOriginalDownloads: !!settings.main.allowOriginalDownloads,
  }

  if (mode === 'create') {
    payload.slug = createGallerySlug(payload.nume)
    payload.userId = ownerUid
    payload.userName = ownerName || 'Fotograf'
    payload.poze = 0
    payload.data = new Date().toISOString()
    payload.createdAt = new Date()
    payload.status = 'active'
    payload.statusActiv = true
  }

  return payload
}
