// @vitest-environment node
/**
 * The Playwright behaviors against a page made to pass or break each one: a
 * write shown at once, only after its answer, or taken back by it; a text
 * shown for one frame, or kept hidden; errors logged and thrown.
 */
import { resolve } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'
import { Behaviors } from '../src/testing/playwright.js'

const ORIGIN = 'http://app.test'

/**
 * The page under test. `write` is how Add behaves: `optimistic` shows the row
 * and posts a Remote mutation, `pessimistic` shows it once the answer lands,
 * `revert` shows it and removes it on the answer, `local` shows it and posts
 * nothing. The rest show it and post, then on the answer: `jump` takes away
 * a line drawn above it while it was pending, so it moves up, and `drawn`
 * does so three frames after the answer arrives, as an app drawing the
 * Message it caused on a later frame would; `redraw` draws
 * it again as a new node; `reinsert` takes the list out and puts it back
 * where it was; `hide` hides it for a frame, and `blank` makes it invisible
 * for one; `flash` hides and shows it in one go; `late` asks a query, and
 * moves it once that is answered; `logs` logs an error, and `throws` throws
 * one. `port` writes as a SharedWorker's port would, past the network, and
 * takes the line above away 600 ms later. `load` is what a load shows before
 * the list: `blink` reads "Loading…" for one frame, `hidden` keeps a hidden
 * "Loading…" in the page.
 */
const html = `<!doctype html>
<html><body>
<p id="loading" style="visibility: hidden">Loading…</p>
<p id="waiting" hidden>1 waiting</p>
<ul id="list"></ul>
<button id="add">Add</button>
<button id="fail">Fail</button>
<script>
const params = new URLSearchParams(location.search)
const list = document.getElementById('list')
const waiting = document.getElementById('waiting')
const show = () => { list.innerHTML = '<li>Milk</li>' }
const clear = () => { list.innerHTML = '' }
const ask = operation => fetch('/remote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ operation, payload: {} }),
}).then(response => response.json())
const post = () => ask('mutate')
const row = () => list.firstElementChild
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
const answers = {
  revert: clear,
  jump: () => { waiting.hidden = true },
  drawn: () => nextFrame().then(nextFrame).then(nextFrame).then(() => { waiting.hidden = true }),
  redraw: show,
  reinsert: () => { const add = document.getElementById('add'); list.remove(); add.before(list) },
  hide: () => { row().hidden = true; nextFrame().then(() => nextFrame()).then(() => { row().hidden = false }) },
  blank: () => { row().style.visibility = 'hidden'; nextFrame().then(() => nextFrame()).then(() => { row().style.visibility = '' }) },
  flash: () => { row().hidden = true; row().hidden = false },
  late: () => ask('query').then(() => { waiting.hidden = false }),
  logs: () => console.error('PredictionMismatch: the server answered otherwise'),
  throws: () => setTimeout(() => { throw new Error('answered badly') }),
}
document.getElementById('add').onclick = () => {
  const write = params.get('write')
  if (write === 'pessimistic') post().then(show)
  else if (write === 'local') show()
  else if (write === 'port') {
    waiting.hidden = false
    show()
    setTimeout(() => { waiting.hidden = true }, 600)
  }
  else {
    if (write === 'jump' || write === 'drawn') waiting.hidden = false
    show()
    post().then(answers[write] ?? (() => {}))
  }
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
  // A query is answered late, after any quiet a check could wait for.
  await page.route(`${ORIGIN}/remote`, async (route, request) => {
    if (request.postDataJSON().operation === 'query')
      await new Promise(resume => setTimeout(resume, 400))
    await route.fulfill({ json: { result: null } })
  })
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
    ['taken back by its answer', 'revert', /<li>Milk<\/li> was taken out of the page/],
    ['shown with no write sent', 'local', /the action sent no Remote mutation/],
    ['pushed by a line taken away on its answer', 'jump', /moved \d+px up,/],
    ['pushed by a line taken away frames after its answer', 'drawn', /moved \d+px up,/],
    ['drawn again on its answer', 'redraw', /<li>Milk<\/li> was replaced by a new element/],
    ['taken out and put back on its answer', 'reinsert', /was taken out and put back/],
    ['hidden for a frame by its answer', 'hide', /<li hidden="">Milk<\/li> was hidden/],
    ['made invisible for a frame by its answer', 'blank', /was hidden/],
    ['hidden and shown again in one go', 'flash', /<li>Milk<\/li> was hidden/],
    ['moved once a query its answer asked is answered', 'late', /moved \d+px down/],
    ['whose answer logs an error', 'logs', /logged an error[^]*PredictionMismatch: the server/],
    ['whose answer throws', 'throws', /logged an error[^]*answered badly/],
  ])('refuses a write %s', async (_, write, message) => {
    await open(`?write=${write}`)
    await expect(Behaviors.optimistic(page, { act: add, shows: row(), ...timing })).rejects.toThrow(
      message,
    )
    await page.close()
  })

  it('reads a write taken back with stays: shown as not shown after its answer', async () => {
    await open('?write=revert')
    await expect(
      Behaviors.optimistic(page, { act: add, shows: row(), stays: 'shown', ...timing }),
    ).rejects.toThrow(/showed while the write was held, but not after/)
    await page.close()
  })

  it.each([
    ['the list around it', () => page.locator('#list')],
    ['nothing', () => 'shown' as const],
  ])('passes a row drawn again when what stays is %s', async (_, stays) => {
    await open('?write=redraw')
    await Behaviors.optimistic(page, { act: add, shows: row(), stays: stays(), ...timing })
    await page.close()
  })

  it('stops watching the page when a check fails before reading the watch', async () => {
    await open('?write=local')
    await expect(Behaviors.optimistic(page, { act: add, shows: row(), ...timing })).rejects.toThrow(
      /sent no Remote mutation/,
    )
    expect(
      await page.evaluate(() =>
        Object.keys(window).filter(key => key.startsWith('__foldkitStill')),
      ),
    ).toEqual([])
    await page.close()
  })

  it('refuses what stays when it matches nothing', async () => {
    await open('?write=optimistic')
    await expect(
      Behaviors.optimistic(page, {
        act: add,
        shows: row(),
        stays: page.locator('#none'),
        ...timing,
      }),
    ).rejects.toThrow(/what stays, matches nothing/)
    await page.close()
  })

  it('takes the page’s word that writes another way were answered', async () => {
    await open('?write=port')
    let asked = 0
    await expect(
      Behaviors.optimistic(page, {
        act: add,
        shows: row(),
        writes: {
          answered: async () => {
            asked += 1
            await page.locator('#waiting').waitFor({ state: 'hidden' })
          },
        },
      }),
    ).rejects.toThrow(/moved \d+px up/)
    expect(asked).toBe(1)
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

  it('lists an error diagnostic the default reporter logs, and not a warning (#272)', async () => {
    const built = await build({
      configFile: false,
      logLevel: 'silent',
      root: import.meta.dirname,
      plugins: [mutation()],
      resolve: { conditions: ['foldkit-plus:source'] },
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: resolve(import.meta.dirname, 'diagnosticsPage.ts') },
      },
    })
    const script = [built]
      .flat()
      .flatMap(result => ('output' in result ? result.output : []))
      .flatMap(output => (output.type === 'chunk' && output.isEntry ? [output.code] : []))
    expect(script).toHaveLength(1)

    page = await browser.newPage()
    await page.route(`${ORIGIN}/diagnostics`, route =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><button id="report">Report</button><script type="module">${script[0]}</script>`,
      }),
    )
    await page.goto(`${ORIGIN}/diagnostics`)
    const logged: Array<string> = []
    page.on('console', message => logged.push(message.text()))
    const errors = Behaviors.consoleErrors(page)
    await page.getByRole('button', { name: 'Report' }).click()

    await expect.poll(() => logged).toHaveLength(2)
    expect(logged[0]).toMatch(/WARN.*\[foldkit-test\] a probe was met$/)
    expect(errors()).toEqual([expect.stringMatching(/ERROR.*\[foldkit-test\] a probe broke$/)])
    await page.close()
  }, 60_000)
})
