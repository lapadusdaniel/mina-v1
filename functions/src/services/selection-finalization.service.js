const crypto = require('crypto')

function normalizeSelectionStatus(value) {
  return String(value || '').trim().toLowerCase() === 'finalized' ? 'finalized' : 'draft'
}

function didSelectionFinalize(beforeData = {}, afterData = {}) {
  return normalizeSelectionStatus(beforeData?.status) !== 'finalized'
    && normalizeSelectionStatus(afterData?.status) === 'finalized'
}

function normalizeClientName(value) {
  return String(value || '').trim().slice(0, 120)
}

function hashString(value) {
  const input = String(value || '')
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function toClientSelectionId(value) {
  const clientName = normalizeClientName(value)
  if (!clientName) return ''

  const slug = clientName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || `client-${hashString(clientName)}`
}

function normalizeAccessToken(value) {
  const token = String(value || '').trim()
  if (token.length < 32 || token.length > 200) return ''
  return token
}

function accessTokensMatch(expected, received) {
  const left = Buffer.from(normalizeAccessToken(expected))
  const right = Buffer.from(normalizeAccessToken(received))
  if (!left.length || left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function timestampToMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function isGalleryOpenForClientSelection(galleryData = {}, nowMs = Date.now()) {
  const status = String(galleryData?.status || '').trim().toLowerCase()
  const expiryMs = timestampToMillis(galleryData?.dataExpirareTs || galleryData?.dataExpirare)

  return status !== 'trash'
    && status !== 'archived'
    && galleryData?.statusActiv !== false
    && galleryData?.publicShareRequired === false
    && (!Number.isFinite(expiryMs) || expiryMs >= nowMs)
}

module.exports = {
  accessTokensMatch,
  didSelectionFinalize,
  isGalleryOpenForClientSelection,
  normalizeAccessToken,
  normalizeClientName,
  normalizeSelectionStatus,
  toClientSelectionId,
}
