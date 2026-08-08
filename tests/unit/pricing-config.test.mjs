import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FOUNDER_OFFER,
  PRICING_PLANS,
  getPlanPrice,
  isFounderOfferActive,
} from '../../src/modules/billing/pricing.config.js'

test('oferta Fondator se încheie la finalul zilei de 30 septembrie în România', () => {
  assert.equal(FOUNDER_OFFER.endsAt, '2026-09-30T20:59:59.999Z')
  assert.equal(isFounderOfferActive('2026-09-30T20:59:59.999Z'), true)
  assert.equal(isFounderOfferActive('2026-09-30T21:00:00.000Z'), false)
})

test('catalogul păstrează cele cinci trepte și cotele publice', () => {
  assert.deepEqual(
    PRICING_PLANS.map((plan) => [plan.name, plan.storage]),
    [
      ['Free', '15 GB'],
      ['Esențial', '100 GB'],
      ['Plus', '500 GB'],
      ['Pro', '1 TB'],
      ['Studio', '2 TB'],
    ]
  )
})

test('prețul afișat se schimbă între Fondator și Standard fără a schimba planul', () => {
  const plus = PRICING_PLANS.find((plan) => plan.key === 'plus')
  const founderMonthly = getPlanPrice(plus, 'monthly', { founderEligible: true })
  const regularMonthly = getPlanPrice(plus, 'monthly', { founderEligible: false })
  const founderYearly = getPlanPrice(plus, 'yearly', { founderEligible: true })

  assert.equal(founderMonthly.display, '49 lei')
  assert.equal(founderMonthly.standardDisplay, '69 lei')
  assert.equal(founderMonthly.planId, 'plus_monthly')
  assert.equal(regularMonthly.display, '69 lei')
  assert.equal(regularMonthly.standardDisplay, null)
  assert.equal(founderYearly.display, '489 lei')
  assert.equal(founderYearly.planId, 'plus_yearly')
})
