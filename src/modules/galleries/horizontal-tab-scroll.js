export function centerTabHorizontally(tab, scrollContainer, behavior = 'smooth') {
  if (!tab || !scrollContainer || typeof scrollContainer.scrollTo !== 'function') return null

  const targetLeft = Math.max(
    0,
    Number(tab.offsetLeft || 0) - (Number(scrollContainer.clientWidth || 0) - Number(tab.offsetWidth || 0)) / 2,
  )
  scrollContainer.scrollTo({ left: targetLeft, behavior })
  return targetLeft
}
