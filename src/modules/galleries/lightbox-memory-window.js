export function getLightboxWindowKeys(photos = [], centerIndex = -1, radius = 1) {
  if (!Array.isArray(photos) || !Number.isInteger(centerIndex) || centerIndex < 0) return new Set()

  const safeRadius = Math.max(0, Number(radius) || 0)
  const keys = new Set()
  for (let index = centerIndex - safeRadius; index <= centerIndex + safeRadius; index += 1) {
    const key = photos[index]?.key
    if (key) keys.add(key)
  }
  return keys
}

export function partitionLightboxUrls(urls = {}, keepKeys = new Set()) {
  const kept = {}
  const removed = []

  for (const [key, url] of Object.entries(urls || {})) {
    if (keepKeys.has(key)) kept[key] = url
    else removed.push([key, url])
  }

  return { kept, removed }
}
