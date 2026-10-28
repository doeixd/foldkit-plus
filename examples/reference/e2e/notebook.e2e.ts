/**
 * The notebook end to end: the page built by Vite, the Worker on a local
 * workerd from `wrangler.toml`, and Chromium as two members. Sign up; a
 * note shows while its write is held at the network and stays once it is
 * answered; a revisit and a reload never read "Loading…"; an edit and a
 * delete; another member's note joins the list live; sign out; and no page
 * logs an error.
 */
import { Behaviors } from 'foldkit-plus/testing/playwright'
import { type Browser, type Page, chromium } from 'playwright'
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

// #265: the count is predicted one lower while the delete is held, and reads
// one too high once it is answered. Red once that is fixed: make it a `test`.
test.fails('a deleted note leaves its author’s count', async () => {
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
