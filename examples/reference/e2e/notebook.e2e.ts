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

declare global {
  interface Window {
    /** The page's elements as the Worker sent them, before any script ran. */
    served?: ReadonlyArray<Element>
    /** The root's markup as the Worker sent it. */
    servedMarkup?: string
  }
}

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
  // Its author's count reads 2 until the resend is answered (#410).

  await context.unroute('**/remote', lost)
  await cameOnline(hopper)
  await hopper.getByText('not sent yet').waitFor({ state: 'detached', timeout: 30_000 })
  await hopper.reload()
  await row.waitFor()
  expect(await row.count()).toBe(1)
  await hopper.getByText('Hopper, you have written 1 note.').waitFor()

  // Remote reports the count it doubled (#410); this line
  // goes red once that is fixed, and is then `toEqual([])`.
  expect(errors().filter(unheld)).toEqual([
    expect.stringContaining('noteCount as 2 while it was pending, and the server answered 1'),
  ])
  await context.close()
})
