/**
 * Renders `assets/blog-card.svg` to `public/blog/og/default.png`, the 1200 by
 * 630 social card a blog post without its own `image` shares. A browser draws
 * it, so the text is set in the first of Geist, Segoe UI and Arial it finds.
 * Run `node scripts/social.mjs` after editing the SVG, and commit both.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const site = join(import.meta.dirname, '..')
const svg = readFileSync(join(site, 'assets/blog-card.svg'), 'utf8')
const out = join(site, 'public/blog/og/default.png')

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(`<body style="margin:0">${svg}</body>`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await page.screenshot({ type: 'png' }))
} finally {
  await browser.close()
}
console.log(`wrote ${out}`)
