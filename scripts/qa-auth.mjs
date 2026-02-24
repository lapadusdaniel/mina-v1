#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:5180').replace(/\/+$/, '')
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(process.cwd(), 'tmp', 'qa-auth')

const email = process.env.QA_EMAIL || ''
const password = process.env.QA_PASSWORD || ''

if (!email || !password) {
  console.error('ERROR: Seteaza QA_EMAIL si QA_PASSWORD pentru testul de autentificare.')
  console.error('Exemplu:')
  console.error('QA_EMAIL="test@example.com" QA_PASSWORD="parola123" npm run qa:auth -- https://your-url')
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function loginAndCheckDesktop(context, screenshotsPath) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /Intră în cont/i }).click()

  // Login redirect can take a few seconds (auth listener + profile read),
  // so wait explicitly for dashboard/settings route instead of fixed delay.
  await page.waitForURL(/\/(dashboard|settings)/, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)

  const currentUrl = page.url()
  assert(currentUrl.includes('/dashboard') || currentUrl.includes('/settings'), `Login failed. URL curent: ${currentUrl}`)

  try {
    await page.waitForSelector('.dashboard-sidebar', { state: 'attached', timeout: 20000 })
  } catch (err) {
    const failShot = path.join(screenshotsPath, 'dashboard-desktop-fail.png')
    await page.screenshot({ path: failShot, fullPage: true }).catch(() => {})
    const bodyText = await page.locator('body').innerText().catch(() => '')
    throw new Error(
      `Sidebar missing on desktop. URL=${page.url()} body="${bodyText.slice(0, 220)}" screenshot=${failShot}`
    )
  }

  const desktopInfo = await page.evaluate(() => {
    const node = document.querySelector('.dashboard-sidebar')
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    return {
      width: rect.width,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      position: style.position,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })

  assert(desktopInfo, 'Sidebar lipseste dupa login.')
  assert(desktopInfo.width >= 180, `Sidebar desktop prea mica (${desktopInfo.width}px).`)
  assert(desktopInfo.left <= 1, `Sidebar nu este aliniata stanga (left=${desktopInfo.left}).`)

  const desktopShot = path.join(screenshotsPath, 'dashboard-desktop.png')
  await page.screenshot({ path: desktopShot, fullPage: true })

  assert(pageErrors.length === 0, `JS page errors: ${pageErrors.join(' | ')}`)
  return { desktopShot, desktopInfo }
}

async function checkMobileWithSameSession(context, screenshotsPath) {
  const page = await context.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)

  try {
    await page.waitForSelector('.dashboard-sidebar', { state: 'attached', timeout: 20000 })
  } catch (err) {
    const failShot = path.join(screenshotsPath, 'dashboard-mobile-fail.png')
    await page.screenshot({ path: failShot, fullPage: true }).catch(() => {})
    const bodyText = await page.locator('body').innerText().catch(() => '')
    throw new Error(
      `Sidebar missing on mobile. URL=${page.url()} body="${bodyText.slice(0, 220)}" screenshot=${failShot}`
    )
  }

  const mobileInfo = await page.evaluate(() => {
    const node = document.querySelector('.dashboard-sidebar')
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    return {
      width: rect.width,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      position: style.position,
      viewportHeight: window.innerHeight,
    }
  })

  if (!mobileInfo) throw new Error('Sidebar mobile lipseste.')
  if (mobileInfo.position !== 'fixed') {
    throw new Error(`Sidebar mobile nu e fixed (position=${mobileInfo.position}).`)
  }
  if (mobileInfo.bottom < mobileInfo.viewportHeight - 2) {
    throw new Error(`Sidebar mobile nu sta jos (bottom=${mobileInfo.bottom}, vh=${mobileInfo.viewportHeight}).`)
  }

  const mobileShot = path.join(screenshotsPath, 'dashboard-mobile.png')
  await page.screenshot({ path: mobileShot, fullPage: true })
  return { mobileShot, mobileInfo }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  try {
    const desktopResult = await loginAndCheckDesktop(context, outputDir)
    const mobileResult = await checkMobileWithSameSession(context, outputDir)

    await context.close()
    await browser.close()

    console.log(`QA Auth - baseUrl: ${baseUrl}`)
    console.log(`Desktop screenshot: ${desktopResult.desktopShot}`)
    console.log(`Mobile screenshot: ${mobileResult.mobileShot}`)
    console.log('QA Auth PASSED.')
  } catch (err) {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    console.error(`QA Auth FAILED: ${err.message || err}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`QA Auth crashed: ${err.message || err}`)
  process.exit(1)
})
