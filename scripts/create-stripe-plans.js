#!/usr/bin/env node
/**
 * Creează produsele și prețurile Mina în Stripe.
 *
 * Planuri:
 *   Esențial  — 100 GB,  29 lei/lună,  289 lei/an
 *   Plus      — 500 GB,  49 lei/lună,  489 lei/an
 *   Pro       — 1 TB,    79 lei/lună,  789 lei/an
 *   Studio    — 2 TB,   129 lei/lună, 1289 lei/an
 *
 * Rulare:
 *   STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-plans.js
 *
 * Scriptul verifică dacă un produs cu același nume există deja
 * și sare peste creare dacă da. La final printează toate price ID-urile
 * pentru .env.
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requireFromFunctions = createRequire(
  path.join(__dirname, '..', 'functions', 'package.json')
)
const Stripe = requireFromFunctions('stripe')

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: Setează variabila de mediu STRIPE_SECRET_KEY înainte de a rula scriptul.')
  console.error('  STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-plans.js')
  process.exit(1)
}

if (!STRIPE_SECRET_KEY.startsWith('sk_')) {
  console.error('ERROR: STRIPE_SECRET_KEY pare invalidă (trebuie să înceapă cu "sk_").')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// 1 RON = 100 bani (unitatea minimă Stripe pentru RON)
const PLANS = [
  {
    name: 'Mina Esențial',
    description: 'Stochezi și livrezi galerii de până la 100 GB.',
    storage: '100 GB',
    monthly: { amount: 2900, label: '29 lei/lună' },
    yearly:  { amount: 28900, label: '289 lei/an' },
    envKey: 'ESENTIAL',
  },
  {
    name: 'Mina Plus',
    description: 'Stochezi și livrezi galerii de până la 500 GB.',
    storage: '500 GB',
    monthly: { amount: 4900, label: '49 lei/lună' },
    yearly:  { amount: 48900, label: '489 lei/an' },
    envKey: 'PLUS',
  },
  {
    name: 'Mina Pro',
    description: 'Stochezi și livrezi galerii de până la 1 TB.',
    storage: '1 TB',
    monthly: { amount: 7900, label: '79 lei/lună' },
    yearly:  { amount: 78900, label: '789 lei/an' },
    envKey: 'PRO',
  },
  {
    name: 'Mina Studio',
    description: 'Stochezi și livrezi galerii de până la 2 TB.',
    storage: '2 TB',
    monthly: { amount: 12900, label: '129 lei/lună' },
    yearly:  { amount: 128900, label: '1289 lei/an' },
    envKey: 'STUDIO',
  },
]

async function findExistingProduct(name) {
  try {
    const result = await stripe.products.search({
      query: `name:"${name}"`,
      limit: 5,
    })
    return result.data.find((p) => p.name === name && p.active) || null
  } catch (err) {
    // Search API not available on some older API versions — fallback to list
    let hasMore = true
    let startingAfter = undefined
    while (hasMore) {
      const page = await stripe.products.list({
        limit: 100,
        active: true,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      const match = page.data.find((p) => p.name === name)
      if (match) return match
      hasMore = page.has_more
      if (page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id
      } else {
        break
      }
    }
    return null
  }
}

async function findExistingPrice(productId, interval, amount) {
  let hasMore = true
  let startingAfter = undefined
  while (hasMore) {
    const page = await stripe.prices.list({
      product: productId,
      currency: 'ron',
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    const match = page.data.find(
      (p) =>
        p.recurring?.interval === interval &&
        p.unit_amount === amount
    )
    if (match) return match
    hasMore = page.has_more
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id
    } else {
      break
    }
  }
  return null
}

async function getOrCreateProduct(plan) {
  const existing = await findExistingProduct(plan.name)
  if (existing) {
    console.log(`  [SKIP] Produs existent: "${plan.name}" (${existing.id})`)
    return existing
  }

  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: {
      storage: plan.storage,
      platform: 'mina',
    },
  })
  console.log(`  [OK]   Produs creat:    "${plan.name}" (${product.id})`)
  return product
}

async function getOrCreatePrice(product, interval, amount, label, nickname) {
  const existing = await findExistingPrice(product.id, interval, amount)
  if (existing) {
    console.log(`         [SKIP] Preț existent: ${nickname} ${label} (${existing.id})`)
    return existing
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: 'ron',
    recurring: { interval },
    nickname,
    metadata: {
      platform: 'mina',
    },
  })
  console.log(`         [OK]   Preț creat:    ${nickname} ${label} (${price.id})`)
  return price
}

async function main() {
  console.log('=== Creare planuri Stripe Mina ===\n')
  console.log(`Cont: ${STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'}\n`)

  const results = []

  for (const plan of PLANS) {
    console.log(`Procesez planul: ${plan.name}`)

    const product = await getOrCreateProduct(plan)

    const monthlyPrice = await getOrCreatePrice(
      product,
      'month',
      plan.monthly.amount,
      plan.monthly.label,
      `${plan.name} — Lunar`,
    )

    const yearlyPrice = await getOrCreatePrice(
      product,
      'year',
      plan.yearly.amount,
      plan.yearly.label,
      `${plan.name} — Anual`,
    )

    results.push({
      plan,
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      yearlyPriceId: yearlyPrice.id,
    })

    console.log()
  }

  console.log('=== Price IDs pentru .env ===\n')
  console.log('# Adaugă în .env (frontend) și în Firebase Functions config:\n')

  for (const r of results) {
    const key = r.plan.envKey
    console.log(`VITE_STRIPE_PRICE_${key}_MONTHLY=${r.monthlyPriceId}`)
    console.log(`VITE_STRIPE_PRICE_${key}_YEARLY=${r.yearlyPriceId}`)
  }

  console.log()
  console.log('# Și în Firebase Functions (STRIPE_PRICE_* pentru webhook plan resolution):')
  console.log()

  for (const r of results) {
    const key = r.plan.envKey
    console.log(`STRIPE_PRICE_${key}_MONTHLY=${r.monthlyPriceId}`)
    console.log(`STRIPE_PRICE_${key}_YEARLY=${r.yearlyPriceId}`)
  }

  console.log()
  console.log('# Rezumat produse:')
  console.log()
  console.log('Plan'.padEnd(16), 'Product ID'.padEnd(32), 'Monthly Price ID'.padEnd(32), 'Yearly Price ID')
  console.log('-'.repeat(110))
  for (const r of results) {
    console.log(
      r.plan.name.padEnd(16),
      r.productId.padEnd(32),
      r.monthlyPriceId.padEnd(32),
      r.yearlyPriceId,
    )
  }

  console.log('\nGata!')
}

main().catch((err) => {
  console.error('\nEroare fatală:', err?.message || String(err))
  process.exit(1)
})
