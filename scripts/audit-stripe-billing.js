#!/usr/bin/env node

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requireFromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'))
const Stripe = requireFromFunctions('stripe')

const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim()
if (!secretKey.startsWith('sk_')) {
  console.error('ERROR: STRIPE_SECRET_KEY nu este configurată.')
  process.exit(1)
}

const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })

const EXPECTED_MINA_PRICE_IDS = new Set([
  'price_1TAzSw1ax2jGrLZHiihltxme', 'price_1TAzSw1ax2jGrLZHq7UZbHBt',
  'price_1TAzSx1ax2jGrLZH9zPBW4PW', 'price_1TAzSy1ax2jGrLZHPtB0oLr3',
  'price_1T6a4F1ax2jGrLZH92vUsGzE', 'price_1TAzSz1ax2jGrLZHPfhcPu81',
  'price_1T6a501ax2jGrLZHgLBbkzT4', 'price_1TAzT01ax2jGrLZHsqLDBI44',
  'price_1U1Qt31ax2jGrLZHYsjdMS6c', 'price_1U1Qt31ax2jGrLZHtIROmtcV',
  'price_1U1Qt41ax2jGrLZHuddImmll', 'price_1U1Qt51ax2jGrLZHXrm1KBrK',
  'price_1U1Qt61ax2jGrLZHahcYtOC6', 'price_1U1Qt61ax2jGrLZH258DaGGZ',
  'price_1U1Qt71ax2jGrLZHBilAcXHi', 'price_1U1Qt81ax2jGrLZHd6ZPVoDy',
])

async function listAll(listPage) {
  const results = []
  let startingAfter
  do {
    const page = await listPage(startingAfter)
    results.push(...page.data)
    startingAfter = page.has_more && page.data.length
      ? page.data[page.data.length - 1].id
      : undefined
  } while (startingAfter)
  return results
}

async function main() {
  const [prices, subscriptions, portalConfigurations] = await Promise.all([
    listAll((startingAfter) => stripe.prices.list({
      active: true,
      currency: 'ron',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    listAll((startingAfter) => stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    listAll((startingAfter) => stripe.billingPortal.configurations.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
  ])

  const minaPrices = prices
    .filter((price) => EXPECTED_MINA_PRICE_IDS.has(price.id))
    .map((price) => ({
      id: price.id,
      amount: price.unit_amount,
      interval: price.recurring?.interval || '',
      nickname: price.nickname || '',
      version: price.metadata?.pricing_version || 'legacy',
    }))
    .sort((a, b) => a.amount - b.amount || a.interval.localeCompare(b.interval))

  const activeMainSubscriptions = subscriptions.filter((subscription) =>
    ['active', 'trialing'].includes(subscription.status)
    && subscription.metadata?.type !== 'addon'
  )

  console.log(`Cont Stripe: ${secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`)
  console.log(`Prețuri Mina active în RON: ${minaPrices.length}`)
  for (const price of minaPrices) {
    console.log(`${price.id} | ${price.amount} bani/${price.interval} | ${price.version} | ${price.nickname}`)
  }
  console.log(`Abonamente principale active/trialing: ${activeMainSubscriptions.length}`)
  console.log(`Configurații Customer Portal active: ${portalConfigurations.length}`)
  for (const configuration of portalConfigurations) {
    // Stripe omits this expandable list in list/retrieve responses unless it is expanded.
    const detailedConfiguration = await stripe.billingPortal.configurations.retrieve(
      configuration.id,
      { expand: ['features.subscription_update.products'] },
    )
    const update = detailedConfiguration.features?.subscription_update || {}
    const products = update.products || []
    const priceCount = products.reduce((total, product) => total + (product.prices?.length || 0), 0)
    console.log(
      `${configuration.id} | default=${Boolean(configuration.is_default)} | `
      + `plan_switch=${Boolean(update.enabled)} | products=${products.length} | prices=${priceCount}`
    )
  }
}

main().catch((error) => {
  console.error(`Audit Stripe eșuat: ${error?.message || String(error)}`)
  process.exit(1)
})
