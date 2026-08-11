import test from 'node:test'
import assert from 'node:assert/strict'
import { centerTabHorizontally } from '../../src/modules/galleries/horizontal-tab-scroll.js'

test('centrarea tabului folosește exclusiv scrollul orizontal al barei', () => {
  const calls = []
  const tab = { offsetLeft: 420, offsetWidth: 100 }
  const container = {
    clientWidth: 300,
    scrollTo: (options) => calls.push(options),
  }

  const targetLeft = centerTabHorizontally(tab, container)

  assert.equal(targetLeft, 320)
  assert.deepEqual(calls, [{ left: 320, behavior: 'smooth' }])
  assert.equal('top' in calls[0], false)
})

test('centrarea nu produce valori negative la primul tab', () => {
  const calls = []
  const targetLeft = centerTabHorizontally(
    { offsetLeft: 20, offsetWidth: 80 },
    { clientWidth: 320, scrollTo: (options) => calls.push(options) },
  )

  assert.equal(targetLeft, 0)
  assert.deepEqual(calls[0], { left: 0, behavior: 'smooth' })
})
