#!/usr/bin/env node

import process from 'node:process'
import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:5180').replace(/\/+$/, '')
const routes = ['/', '/login', '/register', '/dashboard']

async function checkRoute(page, route) {
  const url = `${baseUrl}${route}`
  let hadPageError = false
  const pageErrors = []
  const consoleErrors = []

  const onPageError = (err) => {
    hadPageError = true
    pageErrors.push(err.message || String(err))
  }
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  }

  page.on('pageerror', onPageError)
  page.on('console', onConsole)

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    const status = response ? response.status() : 0
    const title = await page.title()
    const rootText = await page.locator('#root').innerText().catch(() => '')

    return {
      route,
      url,
      ok: status >= 200 && status < 400 && !hadPageError,
      status,
      title,
      rootTextLength: rootText.length,
      pageErrors,
      consoleErrors,
    }
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const results = []

  try {
    for (const route of routes) {
      results.push(await checkRoute(page, route))
    }
  } finally {
    await browser.close()
  }

  let failed = false
  for (const result of results) {
    const statusLabel = result.ok ? 'OK' : 'FAIL'
    console.log(`[${statusLabel}] ${result.url} status=${result.status} title="${result.title}" rootTextLen=${result.rootTextLength}`)

    if (result.pageErrors.length > 0) {
      failed = true
      console.log(`  pageErrors: ${result.pageErrors.join(' | ')}`)
    }
    if (result.consoleErrors.length > 0) {
      console.log(`  consoleErrors: ${result.consoleErrors.slice(0, 3).join(' | ')}`)
    }
    if (!result.ok) {
      failed = true
    }
  }

  if (failed) {
    console.error('\nSmoke check FAILED.')
    process.exit(1)
  }

  console.log('\nSmoke check PASSED.')
}

main().catch((err) => {
  console.error('Smoke check crashed:', err.message || err)
  process.exit(1)
})
