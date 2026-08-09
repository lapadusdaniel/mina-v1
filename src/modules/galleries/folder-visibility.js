export function hasNamedDefaultFolder(gallery) {
  return Boolean(String(gallery?.defaultFolderName || '').trim())
}

export function shouldShowDefaultFolderTab({
  gallery,
  hasExplicitFolders = false,
  defaultPhotosCount = 0,
  uploading = false,
} = {}) {
  return !hasExplicitFolders
    || Number(defaultPhotosCount) > 0
    || Boolean(uploading)
    || hasNamedDefaultFolder(gallery)
}
