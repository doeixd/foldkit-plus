/**
 * #474: how long a new search takes, in two running copies of the domains
 * app. Each page is loaded once; then, interleaving the two, a word never
 * searched before is typed into `#domain-search`, and the time runs from
 * the last key to the first frame drawing ten `.price`s beside that word.
 * Both include the app's own debounce.
 *
 * Build each app (`pnpm --filter <app> build`), serve each with
 * `wrangler dev --local --ip 127.0.0.1 --port <p> --inspector-port <q>`
 * (two at once need two inspector ports), then:
 *
 *   node scripts/search-compare.mjs <name>=<url> <name>=<url> [--reps 20] [--throttle 1]
 *
 * `--throttle` slows Chromium's CPU by that factor, as for a phone.
 */
import { chromium } from 'playwright'

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}
const reps = Number(option('reps', '20'))
const throttle = Number(option('throttle', '1'))
const apps = process.argv
  .slice(2)
  .filter(arg => arg.includes('='))
  .map(arg => arg.split('=', 2))
if (apps.length < 2) throw new Error('usage: search-compare.mjs a=<url> b=<url> [--reps n] [--throttle n]')

const PRICED = 10
const TIMEOUT = 10_000
const WARMUPS = 2
const stems = ['zephyr', 'quillon', 'brava', 'lumex', 'tornado', 'pebblo', 'saffro', 'kinetik']

const browser = await chromium.launch()
const pages = new Map()
for (const [name, url] of apps) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await page.goto(url, { waitUntil: 'networkidle' })
  pages.set(name, page)
}

/** Milliseconds from the last key of `word` to the frame that draws its prices, or -1. */
const searchFor = async (page, word) => {
  const input = page.locator('#domain-search')
  await input.click()
  await input.fill('')
  // Past the debounce, so the cleared box searches nothing in the timed window.
  await page.waitForTimeout(400)
  await page.evaluate(
    ({ word, priced }) => {
      window.__searchStart = undefined
      document
        .querySelector('#domain-search')
        .addEventListener('keydown', event => (window.__searchStart = event.timeStamp), { capture: true })
      const drawn = () =>
        [...document.querySelectorAll('.price')].filter(price => {
          for (let at = price, up = 0; at !== null && up < 5; at = at.parentElement, up++)
            if (at.textContent.includes(word)) return true
          return false
        }).length >= priced
      window.__searchDrawn = new Promise(resolve => {
        const frame = time =>
          window.__searchStart !== undefined && drawn()
            ? resolve(time - window.__searchStart)
            : requestAnimationFrame(frame)
        requestAnimationFrame(frame)
      })
    },
    { word, priced: PRICED },
  )
  await page.keyboard.type(word, { delay: 20 })
  return page.evaluate(
    timeout =>
      Promise.race([window.__searchDrawn, new Promise(resolve => setTimeout(() => resolve(-1), timeout))]),
    TIMEOUT,
  )
}

const samples = new Map(apps.map(([name]) => [name, []]))
for (let run = 0; run < reps + WARMUPS; run++) {
  const order = run % 2 === 0 ? apps : [...apps].reverse()
  for (const [name] of order) {
    const ms = await searchFor(pages.get(name), `${stems[run % stems.length]}${run}${name}`)
    if (run >= WARMUPS) samples.get(name).push(ms)
  }
}
await browser.close()

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
for (const [name, values] of samples) {
  const drawn = values.filter(ms => ms >= 0)
  console.log(
    `${throttle}x ${name}: median ${median(drawn).toFixed(0)} ms, ` +
      `min ${Math.min(...drawn).toFixed(0)}, max ${Math.max(...drawn).toFixed(0)}, ` +
      `timed out ${values.length - drawn.length} of ${values.length}`,
  )
}
