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

export function resolveActiveFolderId({
  activeFolderId = 'default',
  gallery,
  folders = [],
  hasDefaultPhotos = false,
} = {}) {
  const explicitFolders = Array.isArray(folders) ? folders : []
  const firstExplicitFolderId = String(explicitFolders[0]?.id || '').trim()
  const keepDefaultFolder = Boolean(hasDefaultPhotos) || hasNamedDefaultFolder(gallery)

  if (!explicitFolders.length) return 'default'
  if (activeFolderId === 'default') {
    return keepDefaultFolder ? 'default' : (firstExplicitFolderId || 'default')
  }

  const activeFolderExists = explicitFolders.some((folder) => folder?.id === activeFolderId)
  if (activeFolderExists) return activeFolderId
  return keepDefaultFolder ? 'default' : (firstExplicitFolderId || 'default')
}
