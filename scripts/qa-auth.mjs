#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:5180').replace(/\/+$/, '')
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(process.cwd(), 'tmp', 'qa-auth')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const result = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    result[key] = value
  }
  return result
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {
    data = null
  }
  return { res, data, text }
}

async function createAuthUser(apiKey, email, password) {
  const { res, data, text } = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  )
  if (!res.ok) {
    throw new Error(`signUp failed (${res.status}): ${text}`)
  }
  return {
    uid: data.localId,
    idToken: data.idToken,
    email,
    password,
  }
}

async function deleteAuthUser(apiKey, idToken) {
  const { res, text } = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )
  if (!res.ok) {
    throw new Error(`accounts:delete failed (${res.status}): ${text}`)
  }
}

async function resolveCredentials() {
  const envEmail = (process.env.QA_EMAIL || '').trim()
  const envPassword = (process.env.QA_PASSWORD || '').trim()

  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword, cleanup: null }
  }

  const envPath = path.resolve(process.cwd(), '.env')
  const envFile = parseEnvFile(envPath)
  const apiKey = String(envFile.VITE_FIREBASE_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error(
      'Lipsesc QA_EMAIL/QA_PASSWORD si nu am VITE_FIREBASE_API_KEY in .env pentru auto-provisioning.'
    )
  }

  const stamp = Date.now()
  const email = `qa-auth-${stamp}@example.com`
  const password = `Qa!${stamp}Ab`
  const user = await createAuthUser(apiKey, email, password)
  return {
    email,
    password,
    cleanup: { apiKey, idToken: user.idToken, uid: user.uid, email },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function loginAndCheckDesktop(context, screenshotsPath, credentials) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })

  await page.locator('input[type="email"]').fill(credentials.email)
  await page.locator('input[type="password"]').fill(credentials.password)
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

  const credentials = await resolveCredentials()
  if (credentials.cleanup) {
    console.log(`QA Auth: am creat utilizator temporar ${credentials.cleanup.email} (${credentials.cleanup.uid})`)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  try {
    const desktopResult = await loginAndCheckDesktop(context, outputDir, credentials)
    const mobileResult = await checkMobileWithSameSession(context, outputDir)

    await context.close()
    await browser.close()

    if (credentials.cleanup) {
      await deleteAuthUser(credentials.cleanup.apiKey, credentials.cleanup.idToken)
    }

    console.log(`QA Auth - baseUrl: ${baseUrl}`)
    console.log(`Desktop screenshot: ${desktopResult.desktopShot}`)
    console.log(`Mobile screenshot: ${mobileResult.mobileShot}`)
    console.log('QA Auth PASSED.')
  } catch (err) {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    if (credentials.cleanup) {
      await deleteAuthUser(credentials.cleanup.apiKey, credentials.cleanup.idToken).catch((cleanupErr) => {
        console.warn(`Cleanup auth user failed: ${cleanupErr.message || cleanupErr}`)
      })
    }
    console.error(`QA Auth FAILED: ${err.message || err}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`QA Auth crashed: ${err.message || err}`)
  process.exit(1)
})
