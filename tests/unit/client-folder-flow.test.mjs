import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVisibleFolderSections,
  orderPhotosByFolders,
  visibleCountForFolder,
} from '../../src/modules/galleries/client-folder-flow.js'

const folders = [
  { id: 'pregatiri', name: 'Pregătiri' },
  { id: 'ceremonie', name: 'Ceremonie' },
  { id: 'petrecere', name: 'Petrecere' },
]

test('fotografiile sunt afișate continuu în ordinea folderelor', () => {
  const photos = [
    { key: 'party-1', folderId: 'petrecere' },
    { key: 'prep-1', folderId: 'pregatiri' },
    { key: 'ceremony-1', folderId: 'ceremonie' },
  ]

  assert.deepEqual(
    orderPhotosByFolders(photos, folders).map((photo) => photo.key),
    ['prep-1', 'ceremony-1', 'party-1'],
  )
})

test('următorul folder nu apare înainte ca fotografiile precedente să fie încărcate', () => {
  const photos = [
    ...Array.from({ length: 30 }, (_, index) => ({ key: `prep-${index}`, folderId: 'pregatiri' })),
    { key: 'ceremony-1', folderId: 'ceremonie' },
  ]
  const visiblePhotos = photos.slice(0, 24)
  const sections = buildVisibleFolderSections({ folders, allPhotos: photos, visiblePhotos, visibleCount: 24 })

  assert.deepEqual(sections.map((section) => section.id), ['pregatiri'])
})

test('click pe un tab încarcă suficient conținut pentru folderul ales', () => {
  const photos = [
    ...Array.from({ length: 30 }, (_, index) => ({ key: `prep-${index}`, folderId: 'pregatiri' })),
    ...Array.from({ length: 12 }, (_, index) => ({ key: `ceremony-${index}`, folderId: 'ceremonie' })),
  ]

  assert.equal(visibleCountForFolder({
    photos,
    folders,
    folderId: 'ceremonie',
    current: 24,
    batchSize: 24,
  }), 42)
})

test('un folder gol rămâne o destinație validă în navigare', () => {
  const photos = Array.from({ length: 30 }, (_, index) => ({ key: `prep-${index}`, folderId: 'pregatiri' }))
  const visibleCount = visibleCountForFolder({
    photos,
    folders,
    folderId: 'ceremonie',
    current: 24,
    batchSize: 24,
  })
  const sections = buildVisibleFolderSections({
    folders,
    allPhotos: photos,
    visiblePhotos: photos.slice(0, visibleCount),
    visibleCount,
  })

  assert.equal(visibleCount, 30)
  assert.deepEqual(sections.map((section) => section.id), ['pregatiri', 'ceremonie', 'petrecere'])
})
