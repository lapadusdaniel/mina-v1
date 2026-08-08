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

const PRICE_IDS = Object.freeze({
  founder: [
    'price_1TAzSw1ax2jGrLZHiihltxme', 'price_1TAzSw1ax2jGrLZHq7UZbHBt',
    'price_1TAzSx1ax2jGrLZH9zPBW4PW', 'price_1TAzSy1ax2jGrLZHPtB0oLr3',
    'price_1T6a4F1ax2jGrLZH92vUsGzE', 'price_1TAzSz1ax2jGrLZHPfhcPu81',
    'price_1T6a501ax2jGrLZHgLBbkzT4', 'price_1TAzT01ax2jGrLZHsqLDBI44',
  ],
  standard: [
    'price_1U1Qt31ax2jGrLZHYsjdMS6c', 'price_1U1Qt31ax2jGrLZHtIROmtcV',
    'price_1U1Qt41ax2jGrLZHuddImmll', 'price_1U1Qt51ax2jGrLZHXrm1KBrK',
    'price_1U1Qt61ax2jGrLZHahcYtOC6', 'price_1U1Qt61ax2jGrLZH258DaGGZ',
    'price_1U1Qt71ax2jGrLZHBilAcXHi', 'price_1U1Qt81ax2jGrLZHd6ZPVoDy',
  ],
})

async function buildPortalProducts(priceIds) {
  const prices = await Promise.all(priceIds.map((priceId) => stripe.prices.retrieve(priceId)))
  const grouped = new Map()
  for (const price of prices) {
    if (!price.active || !price.recurring || !price.product) {
      throw new Error(`Prețul ${price.id} nu este un Price recurent activ.`)
    }
    const productId = String(price.product)
    const productPrices = grouped.get(productId) || []
    productPrices.push(price.id)
    grouped.set(productId, productPrices)
  }
  return [...grouped.entries()].map(([product, pricesForProduct]) => ({
    product,
    prices: pricesForProduct,
  }))
}

async function findConfiguration(catalog) {
  const page = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
  return page.data.find((configuration) => configuration.metadata?.mina_catalog === catalog) || null
}

function configurationPayload(catalog, products) {
  return {
    default_return_url: 'https://cloudbymina.com/dashboard?tab=abonament',
    business_profile: {
      headline: catalog === 'founder'
        ? 'Gestionează abonamentul Mina la Preț Fondator'
        : 'Gestionează abonamentul Mina',
      privacy_policy_url: 'https://cloudbymina.com/confidentialitate',
      terms_of_service_url: 'https://cloudbymina.com/termeni',
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address', 'name', 'tax_id'],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products,
      },
    },
    metadata: {
      platform: 'mina',
      mina_catalog: catalog,
      pricing_version: '2026-08',
    },
  }
}

async function getOrCreateConfiguration(catalog) {
  const products = await buildPortalProducts(PRICE_IDS[catalog])
  const existing = await findConfiguration(catalog)
  const payload = configurationPayload(catalog, products)
  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, payload)
    console.log(`[UPDATE] Portal ${catalog}: ${updated.id}`)
    return updated
  }
  const created = await stripe.billingPortal.configurations.create(payload)
  console.log(`[CREATE] Portal ${catalog}: ${created.id}`)
  return created
}

async function main() {
  console.log(`Cont: ${secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`)
  const founder = await getOrCreateConfiguration('founder')
  const standard = await getOrCreateConfiguration('standard')
  console.log('')
  console.log(`VITE_STRIPE_PORTAL_CONFIGURATION_FOUNDER=${founder.id}`)
  console.log(`VITE_STRIPE_PORTAL_CONFIGURATION_STANDARD=${standard.id}`)
}

main().catch((error) => {
  console.error(`Configurarea Customer Portal a eșuat: ${error?.message || String(error)}`)
  process.exit(1)
})
