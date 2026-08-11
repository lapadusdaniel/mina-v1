import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDownloadQueue,
  formatDownloadBytes,
  processDownloadQueue,
} from '../../src/modules/galleries/download-queue.js'

test('coada raportează progresul și păstrează fișierele eșuate pentru reîncercare', async () => {
  const queue = createDownloadQueue([
    { key: 'galerii/g/originals/a.jpg', size: 100 },
    { key: 'galerii/g/originals/b.jpg', size: 200 },
  ])

  const result = await processDownloadQueue(queue, {
    downloadItem: async (item) => {
      if (item.key.endsWith('b.jpg')) throw new Error('network')
      return item.size
    },
  })

  assert.equal(result.status, 'warning')
  assert.equal(result.completedCount, 1)
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].item.key, 'galerii/g/originals/b.jpg')
})

test('oprirea nu marchează fișierul curent ca finalizat', async () => {
  const queue = createDownloadQueue([{ key: 'a.jpg', size: 100 }])
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'

  const result = await processDownloadQueue(queue, {
    downloadItem: async () => {
      queue.stopRequested = true
      throw abortError
    },
  })

  assert.equal(result.status, 'stopped')
  assert.equal(result.completedCount, 0)
  assert.equal(queue.index, 0)
})

test('dimensiunile sunt afișate compact', () => {
  assert.equal(formatDownloadBytes(1536), '1.5 KB')
  assert.equal(formatDownloadBytes(2.5 * 1024 ** 3), '2.5 GB')
})

test('o coadă de reîncercare păstrează progresul sesiunii inițiale', async () => {
  const retryQueue = createDownloadQueue([{ key: 'b.jpg', size: 200 }], {
    completedCount: 1,
    completedBytes: 100,
    totalCount: 2,
    totalBytes: 300,
  })

  const result = await processDownloadQueue(retryQueue, {
    downloadItem: async (item) => item.size,
  })

  assert.equal(result.status, 'complete')
  assert.equal(result.completedCount, 2)
  assert.equal(result.completedBytes, 300)
})
