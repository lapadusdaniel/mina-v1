export function sanitizeKeys(keys = []) {
  if (!Array.isArray(keys)) return []
  return Array.from(new Set(keys.filter((k) => typeof k === 'string' && k.trim())))
}

export function normalizeClientName(clientName) {
  return String(clientName || '').trim()
}

export function hashString(value) {
  const input = String(value || '')
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

export function toClientSelectionId(clientName) {
  const normalized = normalizeClientName(clientName)
  if (!normalized) return ''

  const slug = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug) return slug
  return `client-${hashString(normalized)}`
}

export function extractLegacySelection(galleryData, clientName) {
  if (!galleryData || !clientName) return []
  const normalized = normalizeClientName(clientName)
  if (!normalized) return []
  const legacy = galleryData?.selectii?.[normalized]
  return sanitizeKeys(legacy)
}
