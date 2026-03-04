function safeSegment(value) {
  return encodeURIComponent(String(value || '').trim())
}

export function getGalleryPublicPath(gallery) {
  const slug = String(gallery?.slug || '').trim()
  if (slug) return `/g/${safeSegment(slug)}`

  const id = String(gallery?.id || '').trim()
  if (id) return `/gallery/${safeSegment(id)}`

  return ''
}

export function getGalleryPublicUrl(gallery, origin = null) {
  const path = getGalleryPublicPath(gallery)
  if (!path) return ''

  const baseOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return baseOrigin ? `${baseOrigin}${path}` : path
}
