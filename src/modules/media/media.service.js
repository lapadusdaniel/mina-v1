import {
  createGalleryShareToken,
  deleteGalleryFolder,
  deletePoza,
  getBrandingUrl,
  getPozaBlob,
  getPozaUrl,
  getPozaUrlOriginal,
  listPoze,
  uploadPoza,
  uploadToPath,
} from '../../r2'

export function createMediaModule() {
  return {
    async listGalleryPhotos(galleryId, ownerUid) {
      return listPoze(galleryId, ownerUid)
    },

    async getPhotoUrl(photoKey, type = 'original') {
      return getPozaUrl(photoKey, type)
    },

    async getOriginalPhotoUrl(photoKey) {
      return getPozaUrlOriginal(photoKey)
    },

    async getPhotoBlob(photoKey, type = 'original') {
      return getPozaBlob(photoKey, type)
    },

    async getBrandingAsset(path) {
      return getBrandingUrl(path)
    },

    async uploadPhoto(file, galleryId, ownerUid, onProgress, targetPath, idToken) {
      return uploadPoza(file, galleryId, ownerUid, onProgress, targetPath, idToken)
    },

    async uploadFileToPath(file, path, onProgress, idToken) {
      return uploadToPath(file, path, onProgress, idToken)
    },

    async deletePhoto(photoKey, idToken) {
      return deletePoza(photoKey, idToken)
    },

    async deleteGalleryAssets(galleryId, idToken, ownerUid = '') {
      return deleteGalleryFolder(galleryId, idToken, ownerUid)
    },

    async createSecureShareToken(galleryId, idToken, ttlHours = 720) {
      return createGalleryShareToken(galleryId, idToken, ttlHours)
    },
  }
}
