export function orderPhotosByFolders(photos = [], folders = []) {
  if (!Array.isArray(folders) || folders.length === 0) return Array.isArray(photos) ? photos : []

  const validFolderIds = new Set(folders.map((folder) => folder.id))
  const photosByFolder = new Map(folders.map((folder) => [folder.id, []]))
  const orphanPhotos = []

  for (const photo of Array.isArray(photos) ? photos : []) {
    if (validFolderIds.has(photo?.folderId)) {
      photosByFolder.get(photo.folderId)?.push(photo)
    } else {
      orphanPhotos.push(photo)
    }
  }

  return [
    ...folders.flatMap((folder) => photosByFolder.get(folder.id) || []),
    ...orphanPhotos,
  ]
}

export function visibleCountForFolder({ photos = [], folders = [], folderId, current = 0, batchSize = 24 }) {
  const targetFolderIndex = folders.findIndex((folder) => folder.id === folderId)
  if (targetFolderIndex < 0) return current

  const precedingFolderIds = new Set(folders.slice(0, targetFolderIndex).map((folder) => folder.id))
  const photosBeforeTarget = photos.filter((photo) => precedingFolderIds.has(photo?.folderId)).length
  return Math.max(current, Math.min(photos.length, photosBeforeTarget + batchSize))
}

export function buildVisibleFolderSections({ folders = [], allPhotos = [], visiblePhotos = [], visibleCount = 0 }) {
  if (!folders.length) {
    return [{ id: 'all', name: '', photos: visiblePhotos, totalCount: allPhotos.length, startsAt: 0 }]
  }

  let photoOffset = 0
  return folders
    .map((folder) => {
      const photos = visiblePhotos.filter((photo) => photo?.folderId === folder.id)
      const totalCount = allPhotos.filter((photo) => photo?.folderId === folder.id).length
      const startsAt = photoOffset
      photoOffset += totalCount
      return { ...folder, photos, totalCount, startsAt }
    })
    .filter((section) => (
      section.startsAt < visibleCount
      || (section.totalCount === 0 && section.startsAt <= visibleCount)
    ))
}
