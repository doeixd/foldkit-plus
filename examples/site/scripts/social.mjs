/**
 * Draws the blog's social cards, 1200 by 630, with Chrome through Playwright:
 * `public/blog/og/<slug>.png` for every post in `docs/blog/`, from one
 * template, and `cards.json` beside them, which holds the hash of what each
 * was drawn from (the title and the date) so `test/blog.test.ts` can say
 * that a card is out of date. `--default` draws `default.png` from
 * `assets/blog-card.svg` instead, the card of the index and of a post whose
 * card is missing. Run `pnpm --filter foldkit-example-site social` after
 * adding a post or editing a title, and commit the images with the JSON. Pass
 * `--only=<slug>` to update just one post and leave the other cards intact.
 *
 * The page loads the face the site loads (the Google Fonts stylesheet of
 * `index.html`), and the script fails when it is not the face drawn, or
 * when a title does not fit: three lines at the smallest size, no word wider
 * than its box. The colours are the site's light theme (`src/style.ts`) as
 * the shipped palette computes them.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

import { hashOf } from '../src/blog/cardHash.ts'

const site = join(import.meta.dirname, '..')
const posts = join(site, '../../docs/blog')
const directory = join(site, 'public/blog/og')

/** The stylesheet `index.html` links: the card draws the face the site ships. */
const FONTS =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap'

const field = (text, key) => new RegExp(`^${key}: (.+)$`, 'm').exec(text.split('\n---')[0])?.[1]

const readPosts = () =>
  readdirSync(posts)
    .filter(name => name.endsWith('.md'))
    .map(name => {
      const [, slug] = /^\d{4}-\d{2}-\d{2}-(.+)\.md$/.exec(name)
      const text = readFileSync(join(posts, name), 'utf8')
      return {
        slug: slug.replaceAll('.', '-'),
        title: field(text, 'title'),
        date: field(text, 'date'),
      }
    })

/** "Composition over copy and paste: Foldkit Plus 0.41" is a title and the release it is about. */
const splitTitle = title => {
  const colon = title.indexOf(': ')
  if (colon < 0) return { title, kicker: '' }
  const [head, tail] = [title.slice(0, colon), title.slice(colon + 2)]
  if (tail.startsWith('Foldkit Plus')) return { title: head, kicker: tail }
  if (head.startsWith('Foldkit Plus'))
    return { title: tail[0].toUpperCase() + tail.slice(1), kicker: head }
  return { title, kicker: '' }
}

const day = date =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )

const escape = text =>
  text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const INK = 'oklch(10% 0.011 270)'
const MUTED = 'oklch(45% 0.0075 270)'
const FAINT = 'oklch(66% 0 0)'
const HAIRLINE = 'oklch(88% 0.003 270)'
const SOFT = 'oklch(93% 0.003 270)'

const card = ({ title, kicker, date, releaseVersion }) => `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1200px; height: 630px; overflow: hidden; background: oklch(100% 0 270); color: ${INK};
    font-family: "Geist", ui-sans-serif, system-ui, sans-serif; position: relative }
  /* A hairline just inside the edge, so the card does not bleed into a white page. */
  .frame { position: absolute; inset: 0; border: 1px solid ${HAIRLINE} }
  /* The gallery hero's dot grid, fading out from the corner. */
  .dots { position: absolute; inset: 0 0 auto auto; width: 760px; height: 400px;
    background-image: radial-gradient(oklch(80% 0.003 270) 1.6px, transparent 1.6px); background-size: 28px 28px;
    -webkit-mask-image: radial-gradient(ellipse at 100% 0, black 25%, transparent 75%); }
  .top { position: absolute; inset: 72px 80px auto 80px; display: flex; align-items: center; gap: 16px }
  .mark { width: 44px; height: 44px; border-radius: 50%; background: ${INK}; color: oklch(100% 0 270);
    display: grid; place-items: center; font: 700 20px "Geist Mono", ui-monospace, monospace }
  .word { font-size: 30px; font-weight: 600; letter-spacing: -0.01em }
  .main { position: absolute; inset: auto 80px 152px 80px; display: flex; flex-direction: column; gap: 28px; align-items: flex-start }
  .kicker { font: 500 24px "Geist Mono", ui-monospace, monospace; letter-spacing: 0.02em; color: ${MUTED};
    border: 1px solid ${HAIRLINE}; border-radius: 999px; padding: 6px 20px; background: oklch(100% 0 270) }
  h1 { font-weight: 600; letter-spacing: -0.035em; line-height: 1.05; max-width: 1000px; text-wrap: balance }
  .foot { position: absolute; inset: auto 80px 56px 80px; padding-top: 24px; border-top: 1px solid ${SOFT};
    display: flex; justify-content: space-between; font: 400 24px "Geist Mono", ui-monospace, monospace; color: ${FAINT} }
  .foot span:first-child { color: ${MUTED} }
  ${
    releaseVersion === ''
      ? ''
      : `.main { gap: 16px }
  .kicker { border: 0; padding: 0; color: ${INK}; font: 700 124px/1 "Geist", ui-sans-serif, sans-serif;
    letter-spacing: -0.05em; background: transparent }`
  }
</style>
<div class="frame"></div><div class="dots"></div>
<div class="top"><span class="mark">F+</span><span class="word">Foldkit Plus</span></div>
<div class="main">${releaseVersion || kicker ? `<span class="kicker">${escape(releaseVersion || kicker)}</span>` : ''}<h1>${escape(title)}</h1></div>
<div class="foot"><span>${escape(day(date))}</span><span>foldkit-plus.pages.dev/blog</span></div>`

/** Largest of three sizes at which the title takes at most three lines, none wider than its box. */
const SIZES = [96, 84, 72, 64]

const drawPost = async (browser, post) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  try {
    const releaseVersion = post.slug === 'foldkit-plus-0-43-0' ? '0.43' : ''
    const sizes = releaseVersion === '' ? SIZES : [60, 54, 48]
    await page.setContent(card({ ...splitTitle(post.title), date: post.date, releaseVersion }), {
      waitUntil: 'networkidle',
    })
    await page.evaluate(async () => {
      await Promise.all(
        [
          '600 64px Geist',
          '700 124px Geist',
          '600 30px Geist',
          '700 20px "Geist Mono"',
          '500 24px "Geist Mono"',
          '400 24px "Geist Mono"',
        ].map(face => document.fonts.load(face)),
      )
      await document.fonts.ready
    })
    const fit = await page.evaluate(sizes => {
      const h1 = document.querySelector('h1')
      const main = document.querySelector('.main')
      const top = document.querySelector('.top').getBoundingClientRect()
      for (const size of sizes) {
        h1.style.fontSize = `${size}px`
        const lines = Math.round(h1.getBoundingClientRect().height / (size * 1.05))
        const wide = h1.scrollWidth > h1.clientWidth
        const clear = main.getBoundingClientRect().top >= top.bottom + 24
        if (lines <= 3 && !wide && clear) return { size, lines }
      }
      return undefined
    }, sizes)
    if (fit === undefined)
      throw new Error(
        `${post.slug}: the title "${post.title}" does not fit three lines at ${sizes.at(-1)}px`,
      )
    // The face drawn is the one the site ships: read it from the engine, not from the CSS.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'h1' })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    const drawn = fonts.map(f => `${f.familyName}${f.isCustomFont ? ' (loaded)' : ' (system)'}`)
    if (!fonts.every(f => f.familyName === 'Geist' && f.isCustomFont))
      throw new Error(
        `${post.slug}: the title is drawn in ${drawn.join(', ')}, not the site's Geist`,
      )
    const file = join(directory, `${post.slug}.png`)
    writeFileSync(file, await page.screenshot({ type: 'png' }))
    console.log(`${post.slug}: ${fit.size}px, ${fit.lines} lines, ${drawn.join(', ')}`)
  } finally {
    await page.close()
  }
}

mkdirSync(directory, { recursive: true })
const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'chrome' })
try {
  if (process.argv.includes('--default')) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    const svg = readFileSync(join(site, 'assets/blog-card.svg'), 'utf8')
    await page.setContent(`<body style="margin:0">${svg}</body>`)
    writeFileSync(join(directory, 'default.png'), await page.screenshot({ type: 'png' }))
  } else {
    const all = readPosts()
    const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length)
    const selected = only === undefined ? all : all.filter(post => post.slug === only)
    if (selected.length === 0) throw new Error(`No post with slug "${only}"`)
    for (const post of selected) await drawPost(browser, post)
    const hashes =
      only === undefined ? {} : JSON.parse(readFileSync(join(directory, 'cards.json'), 'utf8'))
    for (const post of selected) hashes[post.slug] = hashOf(post.title, post.date)
    mkdirSync(dirname(join(directory, 'cards.json')), { recursive: true })
    writeFileSync(join(directory, 'cards.json'), `${JSON.stringify(hashes, null, 2)}\n`)
  }
} finally {
  await browser.close()
}
