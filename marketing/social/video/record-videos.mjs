import { chromium } from 'playwright'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const rawDir = path.join(root, 'raw')
const finalDir = path.join(root, 'final')
const pageUrl = pathToFileURL(path.join(root, 'demo-gallery.html')).href

await mkdir(rawDir, { recursive: true })
await mkdir(finalDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

const smoothScroll = async (page, target, duration) => {
  await page.evaluate(async ({ targetY, durationMs }) => {
    const startY = window.scrollY
    const distance = targetY - startY
    const started = performance.now()
    const ease = (value) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
    await new Promise((resolve) => {
      const frame = (now) => {
        const progress = Math.min(1, (now - started) / durationMs)
        window.scrollTo(0, startY + distance * ease(progress))
        if (progress < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }, { targetY: target, durationMs: duration })
}

const record = async ({ name, width, height, action }) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDir, size: { width, height } },
  })
  const page = await context.newPage()
  await page.goto(pageUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await action(page)
  const video = page.video()
  await context.close()
  const generated = await video.path()
  const output = path.join(rawDir, `${name}.webm`)
  await copyFile(generated, output)
  return output
}

await record({
  name: '01-gallery-scroll-reel',
  width: 540,
  height: 960,
  action: async (page) => {
    await page.waitForTimeout(700)
    await smoothScroll(page, 610, 1800)
    await page.waitForTimeout(650)
    await smoothScroll(page, 1320, 2200)
    await page.waitForTimeout(700)
    await smoothScroll(page, 2050, 1900)
    await page.waitForTimeout(1100)
  },
})

await record({
  name: '02-client-selection-reel',
  width: 540,
  height: 960,
  action: async (page) => {
    await smoothScroll(page, 380, 1200)
    const hearts = page.locator('.photo button')
    await hearts.nth(0).click()
    await page.waitForTimeout(700)
    await smoothScroll(page, 820, 1300)
    await hearts.nth(3).click()
    await page.waitForTimeout(650)
    await smoothScroll(page, 1230, 1300)
    await hearts.nth(6).click()
    await page.waitForTimeout(900)
    await page.locator('.favorites').click()
    await page.waitForTimeout(1800)
  },
})

await record({
  name: '03-desktop-gallery-scroll',
  width: 1280,
  height: 720,
  action: async (page) => {
    await page.waitForTimeout(700)
    await smoothScroll(page, 500, 1700)
    await page.waitForTimeout(650)
    await smoothScroll(page, 1050, 2100)
    await page.waitForTimeout(700)
    await smoothScroll(page, 1550, 1900)
    await page.waitForTimeout(1000)
  },
})

await browser.close()
console.log(rawDir)
