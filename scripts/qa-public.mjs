#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:5180').replace(/\/+$/, '')
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(process.cwd(), 'tmp', 'qa-public')

const desktopRoutes = [
  { route: '/', expectText: 'Galerii care lasă' },
  { route: '/login', expectText: 'Intră în cont' },
  { route: '/register', expectText: 'Creează cont gratuit' },
]

const authRoute = '/dashboard'

function sanitize(name) {
  return name.replace(/[^a-z0-9-_]+/gi, '_')
}

async function collectPageSnapshot(page, { route, expectText, label }, viewport) {
  const url = `${baseUrl}${route}`
  let hadPageError = false
  const pageErrors = []
  const consoleErrors = []

  const onPageError = (err) => {
    hadPageError = true
    pageErrors.push(err.message || String(err))
  }
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  }

  page.on('pageerror', onPageError)
  page.on('console', onConsole)
  await page.setViewportSize(viewport)

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    const status = response ? response.status() : 0
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const title = await page.title()
    const rootTextLen = await page.locator('#root').innerText().then((v) => v.length).catch(() => 0)

    const textOk = expectText ? bodyText.includes(expectText) : true
    const ok = status >= 200 && status < 400 && !hadPageError && textOk

    const shotName = `${label}-${sanitize(route || 'root')}-${viewport.width}x${viewport.height}.png`
    const shotPath = path.join(outputDir, shotName)
    await page.screenshot({ path: shotPath, fullPage: true })

    return {
      route,
      url,
      title,
      status,
      ok,
      textOk,
      expectText,
      hadPageError,
      pageErrors,
      consoleErrors,
      rootTextLen,
      screenshot: shotPath,
      viewport,
    }
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
  }
}

async function runAuthRedirectCheck(page, viewport) {
  const result = await collectPageSnapshot(
    page,
    { route: authRoute, label: 'auth', expectText: 'Intră în cont' },
    viewport
  )
  return {
    ...result,
    redirectBehaviorOk: result.textOk,
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const results = []

  try {
    for (const entry of desktopRoutes) {
      results.push(
        await collectPageSnapshot(page, { ...entry, label: 'desktop' }, { width: 1440, height: 900 })
      )
    }

    results.push(await runAuthRedirectCheck(page, { width: 1440, height: 900 }))

    results.push(
      await collectPageSnapshot(
        page,
        { route: '/', label: 'mobile', expectText: 'Galerii care lasă' },
        { width: 390, height: 844 }
      )
    )
  } finally {
    await browser.close()
  }

  let failed = false
  console.log(`QA Public - baseUrl: ${baseUrl}`)
  console.log(`Screenshots: ${outputDir}`)

  for (const result of results) {
    const statusLabel = result.ok ? 'OK' : 'FAIL'
    console.log(
      `[${statusLabel}] ${result.url} (${result.viewport.width}x${result.viewport.height}) status=${result.status} title="${result.title}" rootTextLen=${result.rootTextLen}`
    )
    if (!result.textOk && result.expectText) {
      failed = true
      console.log(`  missingText: "${result.expectText}"`)
    }
    if (result.pageErrors.length) {
      failed = true
      console.log(`  pageErrors: ${result.pageErrors.join(' | ')}`)
    }
    if (result.consoleErrors.length) {
      console.log(`  consoleErrors: ${result.consoleErrors.slice(0, 3).join(' | ')}`)
    }
    console.log(`  screenshot: ${result.screenshot}`)
  }

  if (failed) {
    console.error('\nQA Public FAILED.')
    process.exit(1)
  }

  console.log('\nQA Public PASSED.')
}

main().catch((err) => {
  console.error('QA Public crashed:', err.message || err)
  process.exit(1)
})
