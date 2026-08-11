export function createDownloadQueue(items = [], options = {}) {
  const targets = Array.isArray(items) ? items.filter((item) => item?.key) : []
  return {
    targets,
    index: 0,
    completedCount: Math.max(0, Number(options.completedCount) || 0),
    completedBytes: Math.max(0, Number(options.completedBytes) || 0),
    totalCount: Math.max(targets.length, Number(options.totalCount) || targets.length),
    totalBytes: Math.max(0, Number(options.totalBytes) || targets.reduce((sum, item) => sum + Number(item?.size || 0), 0)),
    failures: [],
    stopRequested: false,
    currentItem: null,
  }
}

export function downloadQueueSnapshot(queue, status = 'running') {
  return {
    status,
    totalCount: queue.totalCount,
    totalBytes: queue.totalBytes,
    completedCount: queue.completedCount,
    completedBytes: queue.completedBytes,
    currentName: queue.currentItem?.key?.split('/').pop() || '',
    failures: [...queue.failures],
  }
}

export async function processDownloadQueue(queue, options = {}) {
  const downloadItem = options.downloadItem
  const onProgress = options.onProgress || (() => {})
  const waitBetweenItems = options.waitBetweenItems || (() => Promise.resolve())
  if (typeof downloadItem !== 'function') throw new Error('downloadItem este obligatoriu')

  while (queue.index < queue.targets.length) {
    if (queue.stopRequested) return downloadQueueSnapshot(queue, 'stopped')

    const item = queue.targets[queue.index]
    queue.currentItem = item
    onProgress(downloadQueueSnapshot(queue, 'running'))

    try {
      const downloadedBytes = await downloadItem(item)
      queue.completedCount += 1
      queue.completedBytes += Math.max(0, Number(downloadedBytes) || Number(item?.size || 0))
      queue.index += 1
    } catch (error) {
      if (queue.stopRequested) {
        return downloadQueueSnapshot(queue, 'stopped')
      }
      queue.failures.push({ item, message: String(error?.message || 'Descărcare eșuată') })
      queue.index += 1
    }

    onProgress(downloadQueueSnapshot(queue, 'running'))
    if (queue.index < queue.targets.length && !queue.stopRequested) await waitBetweenItems()
  }

  queue.currentItem = null
  return downloadQueueSnapshot(queue, queue.failures.length > 0 ? 'warning' : 'complete')
}

export function formatDownloadBytes(value) {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
