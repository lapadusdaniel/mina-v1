const DIACRITICS_MAP = {
  'ă': 'a',
  'â': 'a',
  'î': 'i',
  'ș': 's',
  'ş': 's',
  'ț': 't',
  'ţ': 't',
}

function normalizeRomanian(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, (char) => DIACRITICS_MAP[char] || char)
}

function toSlugBase(value) {
  return normalizeRomanian(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toDatePrefix(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function randomSuffix(length = 4) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export function generateSlug(name, dateValue = null) {
  const base = toSlugBase(name) || 'galerie'
  const datePrefix = toDatePrefix(dateValue)
  const stem = datePrefix ? `${datePrefix}-${base}` : base
  return `${stem}-${randomSuffix(4)}`
}
