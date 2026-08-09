import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasNamedDefaultFolder,
  shouldShowDefaultFolderTab,
} from '../../src/modules/galleries/folder-visibility.js'

test('un tab implicit redenumit rămâne vizibil după crearea primului folder', () => {
  const gallery = { defaultFolderName: 'Pregătiri' }

  assert.equal(hasNamedDefaultFolder(gallery), true)
  assert.equal(shouldShowDefaultFolderTab({
    gallery,
    hasExplicitFolders: true,
    defaultPhotosCount: 0,
    uploading: false,
  }), true)
})

test('tabul implicit gol și neredenumit poate fi ascuns când există foldere explicite', () => {
  assert.equal(shouldShowDefaultFolderTab({
    gallery: {},
    hasExplicitFolders: true,
    defaultPhotosCount: 0,
    uploading: false,
  }), false)
})

test('tabul implicit rămâne vizibil când are fotografii sau primește upload', () => {
  assert.equal(shouldShowDefaultFolderTab({
    gallery: {},
    hasExplicitFolders: true,
    defaultPhotosCount: 1,
  }), true)
  assert.equal(shouldShowDefaultFolderTab({
    gallery: {},
    hasExplicitFolders: true,
    uploading: true,
  }), true)
})
