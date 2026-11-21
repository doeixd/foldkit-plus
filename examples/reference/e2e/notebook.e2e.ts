/**
 * The notebook end to end: the page built by Vite, the Worker on a local
 * workerd from `wrangler.toml`, and Chromium as two members. Sign up; a
 * note shows while its write is held at the network and stays once it is
 * answered; a revisit and a reload never read "Loading…"; an edit and a
 * delete; another member's note joins the list live; sign out; and no page
 * logs an error.
 */
import { Behaviors } from 'foldkit-plus/testing/playwright'
import { type Browser, type Page, type Request, type Route, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildPage, startStack, type ReferenceStack } from '../src/stack.js'

let stack: ReferenceStack
let browser: Browser

beforeAll(async () => {
  await buildPage()
  stack = await startStack()
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await stack?.stop()
})

/** Signs a new member up from the sign-in page, and waits for the notebook. */
const signUp = async (page: Page, name: string) => {
  await page.goto(`${stack.origin}/`)
  await page.waitForURL(/\/sign-in\?returnTo=%2F$/)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}@example.invalid`)
  await page.getByLabel('Password', { exact: true }).fill(`${name} keeps a careful notebook`)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(`${stack.origin}/`)
  await page.getByText(`${name}, you have written 0 notes.`).waitFor()
}

const notes = (page: Page) => page.getByRole('region', { name: 'Notes' })

test('signing up, writing, editing and deleting notes, live across members', async () => {
  const ada = await browser.newPage()
  const adaErrors = Behaviors.consoleErrors(ada)
  await signUp(ada, 'Ada')
  await expect.poll(() => notes(ada).textContent()).toBe('No notes yet.')

  // Added: in the list before the server answers, and still there after.
  await ada.getByLabel('Title').fill('First light')
  await ada.getByLabel('Note', { exact: true }).fill('The engine weaves algebraic patterns.')
  const first = notes(ada).getByRole('link', { name: 'First light' })
  await Behaviors.neverShows(ada, {
    text: 'Loading…',
    during: () =>
      Behaviors.optimistic(ada, {
        act: () => ada.getByRole('button', { name: 'Add' }).click(),
        shows: first,
      }),
  })
  await ada.getByText('Ada, you have written 1 note.').waitFor()

  // Its page, then back: the list was read, so it never reads Loading again.
  await first.click()
  await ada.getByText('The engine weaves algebraic patterns.').waitFor()
  await Behaviors.neverShows(ada, {
    text: 'Loading…',
    during: async () => {
      await ada.getByRole('link', { name: 'All notes' }).click()
      await first.waitFor()
    },
  })
  // A reload is rendered by the Worker as Ada, with the notes already in it.
  await Behaviors.neverShows(ada, {
    text: 'Loading…',
    during: async () => {
      await ada.reload()
      await first.waitFor()
    },
  })

  // Another member's note joins Ada's list, with no reload.
  const grace = await browser.newContext().then(context => context.newPage())
  const graceErrors = Behaviors.consoleErrors(grace)
  await signUp(grace, 'Grace')
  await grace.getByLabel('Title').fill('A foot of wire')
  await grace.getByRole('button', { name: 'Add' }).click()
  await notes(ada).getByRole('link', { name: 'A foot of wire' }).waitFor({ timeout: 15_000 })
  expect(await notes(ada).getByRole('listitem').allTextContents()).toEqual([
    'A foot of wireby Grace',
    'First lightby Ada',
  ])
  // Grace may not edit Ada's note: the server says so, and the page draws no Edit.
  await notes(grace).getByRole('link', { name: 'First light' }).click()
  await grace.getByText('The engine weaves algebraic patterns.').waitFor()
  expect(await grace.getByRole('button', { name: 'Edit' }).count()).toBe(0)

  // Edited in place, shown before the answer.
  await first.click()
  await ada.getByRole('button', { name: 'Edit' }).click()
  await ada.getByLabel('Title').fill('First light, edited')
  await Behaviors.optimistic(ada, {
    act: () => ada.getByRole('button', { name: 'Save' }).click(),
    shows: ada.getByRole('heading', { name: 'First light, edited' }),
  })

  // Deleted: gone from the list while the write is held, and still gone after.
  const others = notes(ada).getByRole('link', { name: 'A foot of wire' })
  await Behaviors.optimistic(ada, {
    act: async () => {
      await ada.getByRole('button', { name: 'Delete' }).click()
      await others.waitFor()
      expect(
        await notes(ada)
          .getByRole('link', { name: /First light/ })
          .count(),
      ).toBe(0)
    },
    shows: others,
  })
  expect(
    await notes(ada)
      .getByRole('link', { name: /First light/ })
      .count(),
  ).toBe(0)

  await ada.getByRole('button', { name: 'Sign out' }).click()
  await ada.waitForURL(`${stack.origin}/sign-in`)
  await ada.goto(`${stack.origin}/`)
  await ada.waitForURL(/\/sign-in\?returnTo=%2F$/)

  expect(adaErrors()).toEqual([])
  expect(graceErrors()).toEqual([])
})

// #265: pressed on the note's own page, where no Surface reads the count, so
// only the write's own prediction tells the answer to read it back.
test('a deleted note leaves its author’s count', async () => {
  const page = await browser.newPage()
  await signUp(page, 'Barbara')
  await page.getByLabel('Title').fill('Liskov substitution')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('Barbara, you have written 1 note.').waitFor()
  await notes(page).getByRole('link', { name: 'Liskov substitution' }).click()
  await Behaviors.optimistic(page, {
    act: () => page.getByRole('button', { name: 'Delete' }).click(),
    shows: page.getByText('Barbara, you have written 0 notes.'),
  })
})

/** Not the browser's own line for an add these tests answer 503 on purpose. */
const unheld = (error: string) => !error.includes('status of 503')

/** Whether `request` is a page's add of a note, as Remote's HTTP client sends it. */
const isAdd = (request: Request): boolean => {
  const body = request.method() === 'POST' ? (request.postData() ?? '') : ''
  return body.includes('"operation":"mutate"') && body.includes('"AddNote"')
}

/** Whether `request` is a page's edit of a note, as Remote's HTTP client sends it. */
const isEdit = (request: Request): boolean => {
  const body = request.method() === 'POST' ? (request.postData() ?? '') : ''
  return body.includes('"operation":"mutate"') && body.includes('"EditNote"')
}

declare global {
  interface Window {
    /** The page's elements as the Worker sent them, before any script ran. */
    served?: ReadonlyArray<Element>
    /** The root's markup as the Worker sent it. */
    servedMarkup?: string
    /** What the page's headings and links said at each change since `recordTitles`, in order. */
    titlesShown?: Array<string>
  }
}

/**
 * Records what the page's headings and links say from now on (a note's title
 * is its page's heading and its link in the list): what a later look would miss.
 */
const recordTitles = (page: Page) =>
  page.evaluate(() => {
    const shown: Array<string> = []
    window.titlesShown = shown
    const read = () => {
      const text = [...document.querySelectorAll('h1, h2, h3, a')]
        .map(titled => titled.textContent ?? '')
        .join(' | ')
      if (shown.at(-1) !== text) shown.push(text)
    }
    read()
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })

/**
 * Keeps the elements of the page the Worker sends, as parsed and before any
 * script runs (a module script runs after the document turns interactive).
 */
const recordServed = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      const root = document.querySelector('[data-foldkit-app]')
      window.served = root === null ? [] : [root, ...root.querySelectorAll('*')]
      window.servedMarkup = root?.outerHTML ?? ''
    })
  })

/**
 * The served page's markup, and each of its elements no longer in the
 * document, outside the notes list (which the queue changes) and the sheets
 * (which hydration moves to the head, as they are). Foldkit adopts the
 * elements of a page whose first client view draws what the server drew,
 * and rebuilds those it does not: a production build says nothing of a
 * mismatch, so what it rebuilt is how one shows here.
 */
const adoption = (page: Page) =>
  page.evaluate(() => {
    const served = window.served ?? []
    return {
      served: window.servedMarkup ?? '',
      rebuilt: served
        .filter(element => !element.isConnected && element.tagName !== 'STYLE')
        .map(element => element.outerHTML.slice(0, 120)),
    }
  })

/**
 * The browser's word that the network is back, which the outbox sends on at
 * once rather than at its next retry. A real offline spell would also cut
 * the live stream and whatever else is in flight.
 */
const cameOnline = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')))

// #347: the page is the Worker's, which cannot read the browser's store; the
// queue joins it after the first client view, so nothing is drawn twice and
// hydration adopts every element. Checked by hand, since `pnpm mutate` runs
// no e2e file: a `prepare` in `client.ts` that draws (a notice), or that
// restores the queue before adoption, fails the `rebuilt` check.
test('a note added while the server is out of reach survives a reload, shows in a second tab, and is sent once', async () => {
  const context = await browser.newContext()
  const lovelace = await context.newPage()
  const errors = Behaviors.consoleErrors(lovelace)
  await signUp(lovelace, 'Lovelace')
  // One note the server has, so the list the Worker draws is the one the
  // queue adds to: every element it sent stays, unless hydration rebuilt it.
  await lovelace.getByLabel('Title').fill('Sent first')
  await Promise.all([
    lovelace.waitForResponse(response => isAdd(response.request())),
    lovelace.getByRole('button', { name: 'Add' }).click(),
  ])
  // Answered, and so gone from the queue the outbox stores.
  await expect
    .poll(() => lovelace.evaluate(() => Object.values(localStorage).join('')))
    .not.toContain('Sent first')

  // Every add answered as a server out of reach would: 503, no Remote answer.
  const unreachable = (route: Route) =>
    isAdd(route.request())
      ? route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'away' })
      : route.fallback()
  await context.route('**/remote', unreachable)

  const other = await context.newPage()
  const otherErrors = Behaviors.consoleErrors(other)
  await other.goto(`${stack.origin}/`)
  await other.getByText('Lovelace, you have written 1 note.').waitFor()

  await lovelace.getByLabel('Title').fill('Kept offline')
  await lovelace.getByRole('button', { name: 'Add' }).click()
  const kept = (page: Page) => notes(page).getByRole('link', { name: 'Kept offline' })
  await kept(lovelace).waitFor()
  // Whichever tab took the send lock says so once a send goes unanswered.
  await Promise.any([lovelace, other].map(page => page.getByText('1 note not sent yet').waitFor()))
  // The other tab reads the same queue, and shows the note too.
  await kept(other).waitFor()
  await other.getByText('Lovelace, you have written 2 notes.').waitFor()

  // A reload: the Worker renders what the server has, and the queue joins it.
  await recordServed(lovelace)
  await lovelace.reload()
  await kept(lovelace).waitFor()
  await lovelace.getByText('Lovelace, you have written 2 notes.').waitFor()
  expect(await kept(lovelace).count()).toBe(1)
  const { served, rebuilt } = await adoption(lovelace)
  expect(served).not.toContain('Kept offline')
  expect(rebuilt).toEqual([])

  // Back in reach: sent once, and both tabs settle with the server's answer.
  await context.unroute('**/remote', unreachable)
  for (const page of [lovelace, other]) await cameOnline(page)
  for (const page of [lovelace, other]) {
    await page.getByText('not sent yet').waitFor({ state: 'detached', timeout: 30_000 })
  }
  await lovelace.reload()
  await kept(lovelace).waitFor()
  await lovelace.getByText('Lovelace, you have written 2 notes.').waitFor()
  expect(await kept(lovelace).count()).toBe(1)

  expect(errors().filter(unheld)).toEqual([])
  expect(otherErrors().filter(unheld)).toEqual([])
  await context.close()
})

// The server ran the add and its answer was lost: the reload's page has the
// note from D1, and the queue that joins it is the same write, so the note is
// listed once, and the resend is answered from the ledger.
test('a note whose answer was lost is shown once after a reload, and written once', async () => {
  const context = await browser.newContext()
  const hopper = await context.newPage()
  const errors = Behaviors.consoleErrors(hopper)
  await signUp(hopper, 'Hopper')

  const lost = async (route: Route) => {
    if (!isAdd(route.request())) return route.fallback()
    await route.fetch()
    return route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'lost' })
  }
  await context.route('**/remote', lost)
  await hopper.getByLabel('Title').fill('Answer lost')
  await hopper.getByRole('button', { name: 'Add' }).click()
  const row = notes(hopper).getByRole('link', { name: 'Answer lost' })
  await hopper.getByText('1 note not sent yet').waitFor()

  await recordServed(hopper)
  await hopper.reload()
  await row.waitFor()
  const { served, rebuilt } = await adoption(hopper)
  expect(served).toContain('Answer lost')
  expect(rebuilt).toEqual([])
  // The queue has joined the page once a send of it goes unanswered again.
  await hopper.getByText('1 note not sent yet').waitFor()
  expect(await row.count()).toBe(1)
  // The server render counted it, so the restored create counts it no more (#410).
  await expect
    .poll(() => hopper.locator('#mine').textContent())
    .toBe('Hopper, you have written 1 note.')

  await context.unroute('**/remote', lost)
  await cameOnline(hopper)
  await hopper.getByText('not sent yet').waitFor({ state: 'detached', timeout: 30_000 })
  await hopper.reload()
  await row.waitFor()
  expect(await row.count()).toBe(1)
  await hopper.getByText('Hopper, you have written 1 note.').waitFor()

  expect(errors().filter(unheld)).toEqual([])
  await context.close()
})

/** The served document's head and body, as a crawler reads them: no script runs. */
const servedHalves = (html: string) => {
  const at = html.search(/<\/head>/i)
  return { head: html.slice(0, at), body: html.slice(at) }
}

const descriptionIn = (markup: string) =>
  [...markup.matchAll(/<meta[^>]*name="description"[^>]*content="([^"]*)"/g)].map(
    ([, content]) => content,
  )

test('each served page names itself in the head, and the running page keeps one', async () => {
  const babbage = await browser.newPage()
  const errors = Behaviors.consoleErrors(babbage)
  const signIn = await babbage.goto(`${stack.origin}/sign-in`)
  const signInHalves = servedHalves((await signIn?.text()) ?? '')
  expect(descriptionIn(signInHalves.head)).toEqual(['Sign in to your notebook.'])
  expect(signInHalves.body).not.toContain('name="description"')

  await signUp(babbage, 'Babbage')
  const notebook = await babbage.goto(`${stack.origin}/`)
  const notebookHalves = servedHalves((await notebook?.text()) ?? '')
  expect(descriptionIn(notebookHalves.head)).toEqual([
    'Your notes, kept in step across your devices.',
  ])
  expect(notebookHalves.body).not.toContain('name="description"')

  await babbage.getByText('Babbage, you have written 0 notes.').waitFor()
  expect(
    await babbage
      .locator('meta[name="description"]')
      .evaluateAll(metas =>
        metas.map(meta => [meta.parentElement?.tagName, meta.getAttribute('content')]),
      ),
  ).toEqual([['HEAD', 'Your notes, kept in step across your devices.']])
  expect(errors()).toEqual([])
  await babbage.close()
})

// #480: two edits of one note, stored in the order made, whose answers arrive
// in the other order. A page saves one edit at a time (its editor waits for
// the answer), so the second edit is another tab's. Once the second is saved
// its tab shows nothing else. The first tab shows its own edit while that is
// pending, and goes to the list after the second edit is stored: the list's
// read brings it the second. Its live stream is held unopened meanwhile (one
// opened after the second edit would have nothing to send, but would ask for
// the list once more, at a moment of its own), so that read is all the tab
// hears. The late answer disagrees with what the read brought, so the tab
// reads the note again, and from then shows the second and not the first.
// Broken by hand: with the first tab's reads aborted, it stays on the first
// edit; so it does on a client that keeps nothing of a read answered beside a
// pending write.
test('two edits of one note answered out of order keep the second edit throughout and after reload', async () => {
  const context = await browser.newContext()
  const turing1 = await context.newPage()
  const errors1 = Behaviors.consoleErrors(turing1)
  await signUp(turing1, 'Turing')

  await turing1.getByLabel('Title').fill('Original title')
  await turing1.getByLabel('Note', { exact: true }).fill('Body text.')
  await Promise.all([
    turing1.waitForResponse(response => isAdd(response.request())),
    turing1.getByRole('button', { name: 'Add' }).click(),
  ])
  await notes(turing1).getByRole('link', { name: 'Original title' }).click()
  await turing1.getByRole('heading', { name: 'Original title' }).waitFor()

  const noteUrl = turing1.url()
  const turing2 = await context.newPage()
  const errors2 = Behaviors.consoleErrors(turing2)
  await turing2.goto(noteUrl)
  await turing2.getByRole('heading', { name: 'Original title' }).waitFor()

  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>(r => {
      resolve = r
    })
    return { promise, resolve }
  }
  const firstCommitted = deferred()
  const releaseFirstAnswer = deferred()
  const firstDelivered = deferred()
  const secondAnswered = deferred()
  const openLive = deferred()

  await context.route('**/remote', async (route: Route) => {
    const req = route.request()
    if (req.frame().page() === turing1 && (req.postData() ?? '').includes('"operation":"live"')) {
      await openLive.promise
      // The page may have left by then, and its request with it.
      return route.fallback().catch(() => {})
    }
    if (!isEdit(req)) return route.fallback()
    const body = req.postData() ?? ''
    if (body.includes('First edit')) {
      const firstResponse = await route.fetch()
      firstCommitted.resolve()
      await releaseFirstAnswer.promise
      await route.fulfill({ response: firstResponse })
      firstDelivered.resolve()
      return
    }
    if (body.includes('Second edit')) {
      const secondResponse = await route.fetch()
      await route.fulfill({ response: secondResponse })
      secondAnswered.resolve()
      return
    }
    return route.fallback()
  })

  // What the first tab asks the server from here on: said when it never shows the second edit.
  const asked: Array<string> = []
  turing1.on('request', request => asked.push((request.postData() ?? request.url()).slice(0, 160)))

  // The first edit, from the first tab: stored, its answer held.
  await turing1.getByRole('button', { name: 'Edit' }).click()
  await turing1.getByLabel('Title').fill('First edit')
  await turing1.getByRole('button', { name: 'Save' }).click()
  await firstCommitted.promise
  await turing1.getByRole('heading', { name: 'First edit' }).waitFor()

  // The second edit, from the second tab: stored after the first, answered before it.
  await turing2.getByRole('button', { name: 'Edit' }).click()
  await turing2.getByLabel('Title').fill('Second edit')
  await turing2.getByRole('button', { name: 'Save' }).click()
  await turing2.getByRole('heading', { name: 'Second edit' }).waitFor()
  await recordTitles(turing2)
  await secondAnswered.promise

  // The first tab goes to the list, and the list's read brings it the second
  // edit under its own, still pending: drawn, a frame after the answer.
  const readSecond = turing1.waitForResponse(async response => {
    const sent = response.request().postData() ?? ''
    return sent.includes('"operation":"query"') && (await response.text()).includes('Second edit')
  })
  await turing1.getByRole('link', { name: 'All notes' }).click()
  await notes(turing1).getByRole('link', { name: 'First edit' }).waitFor()
  await recordTitles(turing1)
  await readSecond
  await turing1.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(true))))

  // The first edit's answer, late: the first tab reads the note again and shows the second.
  const before = asked.length
  releaseFirstAnswer.resolve()
  await firstDelivered.promise
  await notes(turing1)
    .getByRole('link', { name: 'Second edit' })
    .waitFor({ timeout: 15_000 })
    .catch(() => {
      throw new Error(
        `the first tab never showed the second edit; after the late answer it asked:\n${asked.slice(before).join('\n') || '(nothing)'}`,
      )
    })
  // The second edit shows once that read is answered, and nothing is asked after it: a frame.
  for (const tab of [turing1, turing2]) {
    await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(true))))
  }
  openLive.resolve()
  const shown = (tab: Page) => tab.evaluate(() => window.titlesShown ?? [])
  // The second tab showed the second edit and never the first.
  const second = await shown(turing2)
  expect(second.length).toBeGreaterThan(0)
  expect(second.filter(text => !text.includes('Second edit'))).toEqual([])
  // The first tab went from the first edit to the second, and not back.
  const first = await shown(turing1)
  const arrived = first.findIndex(text => text.includes('Second edit'))
  expect(arrived).toBeGreaterThan(0)
  expect(first.slice(arrived).filter(text => text.includes('First edit'))).toEqual([])
  expect(first.at(-1)).toContain('Second edit')

  // The server holds the second edit: both tabs show it after a reload.
  await turing1.reload()
  await notes(turing1).getByRole('link', { name: 'Second edit' }).waitFor()
  await turing2.reload()
  await turing2.getByRole('heading', { name: 'Second edit' }).waitFor()
  expect(errors1()).toEqual([])
  expect(errors2()).toEqual([])
  await context.close()
})
