// @vitest-environment node
/**
 * The Playwright behaviors against a page made to pass or break each one: a
 * write shown at once, only after its answer, or taken back by it; a text
 * shown for one frame, or kept hidden; errors logged and thrown.
 */
import { type Browser, chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Behaviors } from '../src/testing/playwright.js'

const ORIGIN = 'http://app.test'

/**
 * The page under test. `write` is how Add behaves: `optimistic` shows the row
 * and posts a Remote mutation, `pessimistic` shows it once the answer lands,
 * `revert` shows it and removes it on the answer, `local` shows it and posts
 * nothing. `load` is what a load shows before the list: `blink` reads
 * "Loading…" for one frame, `hidden` keeps a hidden "Loading…" in the page.
 */
const html = `<!doctype html>
<html><body>
<p id="loading" style="visibility: hidden">Loading…</p>
<ul id="list"></ul>
<button id="add">Add</button>
<button id="fail">Fail</button>
<script>
const params = new URLSearchParams(location.search)
const list = document.getElementById('list')
const show = () => { list.innerHTML = '<li>Milk</li>' }
const clear = () => { list.innerHTML = '' }
const post = () => fetch('/remote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ operation: 'mutate', payload: {} }),
}).then(response => response.json())
document.getElementById('add').onclick = () => {
  const write = params.get('write')
  if (write === 'optimistic') { show(); post() }
  if (write === 'pessimistic') post().then(show)
  if (write === 'revert') { show(); post().then(clear) }
  if (write === 'local') show()
}
document.getElementById('fail').onclick = () => {
  console.error('logged on purpose')
  throw new Error('thrown on purpose')
}
if (params.get('load') === 'blink') {
  const status = document.createElement('p')
  status.textContent = 'Loading…'
  document.body.append(status)
  requestAnimationFrame(() => { status.textContent = 'Ready' })
}
</script>
</body></html>`

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)

afterAll(() => browser?.close())

/** A fresh page on the app at `query`, its `/remote` answered at once. */
const open = async (query: string) => {
  page = await browser.newPage()
  await page.route(`${ORIGIN}/remote`, route => route.fulfill({ json: { result: null } }))
  await page.route(
    url => url.origin === ORIGIN && url.pathname === '/',
    route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
  )
  await page.goto(`${ORIGIN}/${query}`)
  return page
}

const row = () => page.getByRole('listitem').filter({ hasText: 'Milk' })
const add = () => page.getByRole('button', { name: 'Add' }).click()

describe('optimistic', () => {
  const timing = { hold: '1500 millis', within: '500 millis' } as const

  it('passes a write shown before its answer and kept after it', async () => {
    await open('?write=optimistic')
    await Behaviors.optimistic(page, { act: add, shows: row(), ...timing })
    await page.close()
  })

  it.each([
    ['shown only once it is answered', 'pessimistic', /did not show within 500 ms/],
    ['taken back by its answer', 'revert', /showed while the write was held, but not after/],
    ['shown with no write sent', 'local', /the action sent no Remote mutation/],
  ])('refuses a write %s', async (_, write, message) => {
    await open(`?write=${write}`)
    await expect(Behaviors.optimistic(page, { act: add, shows: row(), ...timing })).rejects.toThrow(
      message,
    )
    await page.close()
  })

  it('refuses a wait shorter than the hold it would have to beat', async () => {
    await open('?write=optimistic')
    await expect(
      Behaviors.optimistic(page, { act: add, shows: row(), hold: '1 second', within: '1 second' }),
    ).rejects.toThrow(/must be shorter than hold/)
    await page.close()
  })
})

describe('neverShows', () => {
  const reload = async () => {
    await page.reload()
    await page.getByRole('button', { name: 'Add' }).waitFor()
  }

  it('catches a text shown for one frame as the page reloads', async () => {
    await open('?load=blink')
    await expect(Behaviors.neverShows(page, { text: 'Loading…', during: reload })).rejects.toThrow(
      'the page showed Loading…: "Loading…"',
    )
    await page.close()
  })

  it('reads a string as written, not as a pattern', async () => {
    await open('?load=blink')
    await Behaviors.neverShows(page, { text: 'Lo.ding', during: reload })
    await page.close()
  })

  it('passes a page that keeps the text hidden, by a string or a pattern', async () => {
    await open('?load=hidden')
    await Behaviors.neverShows(page, { text: 'Loading…', during: reload })
    await Behaviors.neverShows(page, { text: /^Load/, during: reload })
    await page.close()
  })

  it('watches the document already open, not only those loaded after', async () => {
    await open('?write=optimistic')
    await expect(Behaviors.neverShows(page, { text: 'Milk', during: add })).rejects.toThrow(
      /showed Milk/,
    )
    await page.close()
  })
})

describe('consoleErrors', () => {
  it('lists what the page logged as an error and what it threw', async () => {
    await open('')
    const errors = Behaviors.consoleErrors(page)
    expect(errors()).toEqual([])
    await page.getByRole('button', { name: 'Fail' }).click()
    await expect.poll(() => errors()).toEqual(['logged on purpose', 'Error: thrown on purpose'])
    await page.close()
  })
})
