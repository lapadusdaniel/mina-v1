#!/usr/bin/env node
/**
 * Creează produsele și prețurile Mina în Stripe.
 *
 * Creează/verifică două seturi de prețuri recurente:
 *   - Fondator: disponibile pentru checkout până la 30 septembrie 2026
 *   - Standard: folosite pentru abonamente noi după încheierea ofertei
 *
 * Rulare:
 *   STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-plans.js
 *
 * Scriptul este idempotent: reutilizează produsul și orice preț activ cu
 * aceeași monedă, perioadă și sumă. La final afișează toate ID-urile pentru
 * configurarea frontend-ului și a Firebase Functions.
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
    founder: {
      monthly: { amount: 2900, label: '29 lei/lună' },
      yearly:  { amount: 28900, label: '289 lei/an' },
    },
    regular: {
      monthly: { amount: 3900, label: '39 lei/lună' },
      yearly:  { amount: 39000, label: '390 lei/an' },
    },
    envKey: 'ESENTIAL',
  },
  {
    name: 'Mina Plus',
    description: 'Stochezi și livrezi galerii de până la 500 GB.',
    storage: '500 GB',
    founder: {
      monthly: { amount: 4900, label: '49 lei/lună' },
      yearly:  { amount: 48900, label: '489 lei/an' },
    },
    regular: {
      monthly: { amount: 6900, label: '69 lei/lună' },
      yearly:  { amount: 69000, label: '690 lei/an' },
    },
    envKey: 'PLUS',
  },
  {
    name: 'Mina Pro',
    description: 'Stochezi și livrezi galerii de până la 1 TB.',
    storage: '1 TB',
    founder: {
      monthly: { amount: 7900, label: '79 lei/lună' },
      yearly:  { amount: 78900, label: '789 lei/an' },
    },
    regular: {
      monthly: { amount: 9900, label: '99 lei/lună' },
      yearly:  { amount: 99000, label: '990 lei/an' },
    },
    envKey: 'PRO',
  },
  {
    name: 'Mina Studio',
    description: 'Stochezi și livrezi galerii de până la 2 TB.',
    storage: '2 TB',
    founder: {
      monthly: { amount: 12900, label: '129 lei/lună' },
      yearly:  { amount: 128900, label: '1289 lei/an' },
    },
    regular: {
      monthly: { amount: 14900, label: '149 lei/lună' },
      yearly:  { amount: 149000, label: '1490 lei/an' },
    },
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
      pricing_version: nickname.includes('Fondator') ? 'founder-2026' : 'standard-2026',
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

    const founderMonthlyPrice = await getOrCreatePrice(
      product, 'month', plan.founder.monthly.amount, plan.founder.monthly.label,
      `${plan.name} — Fondator lunar`,
    )
    const founderYearlyPrice = await getOrCreatePrice(
      product, 'year', plan.founder.yearly.amount, plan.founder.yearly.label,
      `${plan.name} — Fondator anual`,
    )
    const regularMonthlyPrice = await getOrCreatePrice(
      product, 'month', plan.regular.monthly.amount, plan.regular.monthly.label,
      `${plan.name} — Standard lunar`,
    )
    const regularYearlyPrice = await getOrCreatePrice(
      product, 'year', plan.regular.yearly.amount, plan.regular.yearly.label,
      `${plan.name} — Standard anual`,
    )

    results.push({
      plan,
      productId: product.id,
      founderMonthlyPriceId: founderMonthlyPrice.id,
      founderYearlyPriceId: founderYearlyPrice.id,
      regularMonthlyPriceId: regularMonthlyPrice.id,
      regularYearlyPriceId: regularYearlyPrice.id,
    })

    console.log()
  }

  console.log('=== Price IDs pentru .env ===\n')
  console.log('# Adaugă în .env (frontend) și în Firebase Functions config:\n')

  for (const r of results) {
    const key = r.plan.envKey
    console.log(`VITE_STRIPE_PRICE_${key}_MONTHLY=${r.founderMonthlyPriceId}`)
    console.log(`VITE_STRIPE_PRICE_${key}_YEARLY=${r.founderYearlyPriceId}`)
    console.log(`VITE_STRIPE_PRICE_${key}_REGULAR_MONTHLY=${r.regularMonthlyPriceId}`)
    console.log(`VITE_STRIPE_PRICE_${key}_REGULAR_YEARLY=${r.regularYearlyPriceId}`)
  }

  console.log()
  console.log('# Și în Firebase Functions (STRIPE_PRICE_* pentru webhook plan resolution):')
  console.log()

  for (const r of results) {
    const key = r.plan.envKey
    console.log(`STRIPE_PRICE_${key}_MONTHLY=${r.founderMonthlyPriceId}`)
    console.log(`STRIPE_PRICE_${key}_YEARLY=${r.founderYearlyPriceId}`)
    console.log(`STRIPE_PRICE_${key}_REGULAR_MONTHLY=${r.regularMonthlyPriceId}`)
    console.log(`STRIPE_PRICE_${key}_REGULAR_YEARLY=${r.regularYearlyPriceId}`)
  }

  console.log()
  console.log('# Rezumat produse:')
  console.log()
  console.log('Plan'.padEnd(16), 'Fondator lunar'.padEnd(32), 'Fondator anual'.padEnd(32), 'Standard lunar'.padEnd(32), 'Standard anual')
  console.log('-'.repeat(150))
  for (const r of results) {
    console.log(
      r.plan.name.padEnd(16),
      r.founderMonthlyPriceId.padEnd(32),
      r.founderYearlyPriceId.padEnd(32),
      r.regularMonthlyPriceId.padEnd(32),
      r.regularYearlyPriceId,
    )
  }

  console.log('\nGata!')
}

main().catch((err) => {
  console.error('\nEroare fatală:', err?.message || String(err))
  process.exit(1)
})
