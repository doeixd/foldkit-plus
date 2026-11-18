/**
 * The sandbox end to end: the Vite dev server in the `sandbox` mode, so the journal runs in
 * a SharedWorker, and two tabs of one Chromium editing one page. Each tab's typing reaches
 * the other, and a reloaded tab reads it back from the journal the other kept alive.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    mode: 'sandbox',
    logLevel: 'error',
    server: { port: 0 },
  })
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/**
 * `expect.poll` with room for a loaded machine: its default second is less than one drawing of
 * the page takes under a 20x CPU throttle (Foldkit's own warning measured a view at 2s), which
 * is how the block handle test failed now and then while every step was right.
 */
const poll: typeof expect.poll = (read, options) =>
  expect.poll(read, { timeout: 15_000, ...options })

const body = (page: Page) => page.locator('#page-body [contenteditable]')
const openPage = async (page: Page, title: string) => {
  await page.getByRole('button', { name: title }).click({ timeout: 15_000 })
  await page.waitForSelector('#page-body')
}

test('two tabs of one browser edit one page through the journal in the browser', async () => {
  // One context: the tabs of one browser, which share its SharedWorker.
  const context = await browser.newContext()
  const errors: Array<string> = []
  const open = async () => {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(url)
    await page.waitForSelector('#new-page', { timeout: 120_000 })
    return page
  }
  const ada = await open()
  const ben = await open()
  await ada.click('#new-page')
  await ada.fill('#page-title', 'Groceries')
  await ada.press('#page-title', 'Enter')
  await body(ada).click()
  await ada.keyboard.type('Milk and eggs')

  await openPage(ben, 'Groceries')
  await poll(() => body(ben).textContent(), { timeout: 15_000 }).toBe('Milk and eggs')
  await body(ben).click()
  await ben.keyboard.press('End')
  await ben.keyboard.type(', and bread')
  await poll(() => body(ada).textContent(), { timeout: 15_000 }).toBe('Milk and eggs, and bread')

  await ben.reload()
  await ben.waitForSelector('#new-page', { timeout: 60_000 })
  await openPage(ben, 'Groceries')
  await poll(() => body(ben).textContent(), { timeout: 15_000 }).toBe('Milk and eggs, and bread')
  expect(errors).toEqual([])
  await context.close()
})

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)

test('focus follows a new page, Enter in its title, a delete, and its undo', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await poll(() => focused(page)).toBe('page-title')
  await page.keyboard.type('Plans')
  await poll(() => page.inputValue('#page-title')).toBe('Plans')
  await page.keyboard.press('Enter')
  await poll(() =>
    page.evaluate(() => document.activeElement?.closest('#page-body') !== null),
  ).toBe(true)
  await page.keyboard.type('Ship it')

  await page.click('#delete-page')
  await poll(() => focused(page)).toBe('undo-trash')
  await page.getByRole('status').filter({ hasText: 'moved to the trash' }).waitFor()
  await page.keyboard.press('Enter')
  await poll(() => focused(page)).toBe('page-title')
  await poll(() => body(page).textContent()).toBe('Ship it')
  await context.close()
})

test('the sidebar opens a second tab, and each tab then says the other is online', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const first = await context.newPage()
  await first.goto(url)
  await first.waitForSelector('#second-tab', { timeout: 120_000 })
  // Phone width: the link is shown, and nothing makes the page scroll sideways.
  expect(
    await first.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  const [second] = await Promise.all([context.waitForEvent('page'), first.click('#second-tab')])
  await second.waitForSelector('#new-page', { timeout: 60_000 })
  for (const tab of [first, second])
    await poll(() => tab.getByText('1 other online').count(), { timeout: 30_000 }).toBe(1)
  await context.close()
})

test('a keyboard reaches the block handle from the text, and its menu opens', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await poll(() => focused(page)).toBe('page-title')
  await page.keyboard.type('Notes')
  await page.keyboard.press('Enter')
  await poll(() =>
    page.evaluate(() => document.activeElement?.closest('#page-body') !== null),
  ).toBe(true)
  await page.keyboard.type('First')
  await page.getByRole('button', { name: 'Block handle' }).waitFor()
  await page.keyboard.press('Tab')
  await poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Block handle',
  )
  // A decoration refresh (presence redraws the carets) must not pull the focus back to the text.
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Block handle',
  )
  await page.keyboard.press('Enter')
  await page.getByRole('menu', { name: 'Block' }).waitFor()
  await context.close()
})

const PHONE = { width: 390, height: 800 }
const formattingBar = (page: Page) => page.locator('[role="toolbar"][aria-label="Formatting"]')
const selected = (page: Page) => page.evaluate(() => window.getSelection()?.toString())
const inText = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('#page-body') !== null)
/** The text the editor draws as selected while a control has the focus. */
const standIn = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#page-body [data-decoration="selection"]')]
      .map(element => element.textContent)
      .join(''),
  )

/** A new page with `text` typed and selected by Shift+Home, as the Model has it once drawn. */
const pageWithSelection = async (viewport: { width: number; height: number }, text: string) => {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await poll(() => focused(page)).toBe('page-title')
  await body(page).click()
  await page.keyboard.type(text)
  await poll(() => body(page).textContent()).toBe(text)
  await page.keyboard.press('Shift+Home')
  await poll(() => selected(page)).toBe(text)
  // The bar's marks are available once the Model has the range.
  await poll(() =>
    formattingBar(page).locator('[data-item="link"]').getAttribute('aria-disabled'),
  ).toBe('false')
  return { context, page }
}

test('on a phone the formatting bar is one row of the controls that fit, one tab stop the arrows walk', async () => {
  const context = await browser.newContext({ viewport: PHONE })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await poll(() => focused(page)).toBe('page-title')
  const bar = formattingBar(page)
  const drawn = await bar
    .locator('button')
    .evaluateAll(buttons => buttons.map(button => button.getAttribute('data-item')))
  expect(drawn).toEqual([
    'undo',
    'redo',
    'style',
    'mark-Bold',
    'mark-Italic',
    'link',
    'insert',
    'more',
  ])
  // One row: the bar is as high as one control and its padding (43px), where three rows were 145px.
  const height = await bar.evaluate(element => element.getBoundingClientRect().height)
  expect(height).toBeGreaterThan(38)
  expect(height).toBeLessThan(48)
  const tops = await bar
    .locator('button')
    .evaluateAll(buttons => [
      ...new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))),
    ])
  expect(tops).toHaveLength(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)

  // Tab from the title lands on the bar's one stop; the arrows visit exactly what is drawn, an
  // unavailable control (nothing to undo) included, and wrap.
  expect(await bar.locator('button[tabindex="0"]').count()).toBe(1)
  await page.keyboard.press('Tab')
  const visited: Array<string | undefined> = []
  for (const item of drawn) {
    await poll(() => focused(page)).toBe(`bar-${item}`)
    visited.push(await focused(page))
    // The stop follows focus a frame later: a key before that moves from the old position.
    await poll(() => bar.locator('button[tabindex="0"]').getAttribute('id')).toBe(`bar-${item}`)
    await page.keyboard.press('ArrowRight')
  }
  expect(visited).toEqual(drawn.map(item => `bar-${item}`))
  await poll(() => focused(page)).toBe('bar-undo')
  expect(await bar.locator('[data-item="undo"]').getAttribute('aria-disabled')).toBe('true')
  await poll(() => bar.locator('button[tabindex="0"]').getAttribute('id')).toBe('bar-undo')
  await page.keyboard.press('End')
  await poll(() => focused(page)).toBe('bar-more')

  // Redo has nothing to redo: a press on it changes nothing.
  expect(await bar.locator('[data-item="redo"]').getAttribute('aria-disabled')).toBe('true')
  await bar.locator('[data-item="redo"]').dispatchEvent('click')
  expect(await bar.locator('[data-item="undo"]').getAttribute('aria-disabled')).toBe('true')
  await context.close()
})

test('a wide window draws every control of the bar', async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await poll(() => formattingBar(page).locator('button').count()).toBe(15)
  // Narrowed, the low controls go (to More, which is one more button); widened again, they come back.
  await page.setViewportSize(PHONE)
  await poll(() => formattingBar(page).locator('button').count()).toBe(8)
  await page.setViewportSize({ width: 1100, height: 800 })
  await poll(() => formattingBar(page).locator('button').count()).toBe(15)
  await context.close()
})

for (const [name, viewport] of [
  ['a phone', PHONE],
  ['a desk', { width: 1100, height: 800 }],
] as const) {
  test(`on ${name}, pressing Bold and then Italic marks the same text, which stays selected, and typing replaces it`, async () => {
    const { context, page } = await pageWithSelection(viewport, 'Milk')
    const control = (item: string) => formattingBar(page).locator(`[data-item="${item}"]`)
    await control('mark-Bold').click()
    await poll(() => control('mark-Bold').getAttribute('aria-pressed')).toBe('true')
    expect(await selected(page)).toBe('Milk')
    expect(await inText(page)).toBe(true)
    await control('mark-Italic').click()
    await poll(() => control('mark-Italic').getAttribute('aria-pressed')).toBe('true')
    expect(await control('mark-Bold').getAttribute('aria-pressed')).toBe('true')
    expect(await selected(page)).toBe('Milk')
    expect(await inText(page)).toBe(true)
    expect(await body(page).locator('strong').textContent()).toBe('Milk')
    expect(await body(page).locator('em').textContent()).toBe('Milk')
    await page.keyboard.type('Oat')
    await poll(() => body(page).textContent()).toBe('Oat')
    await context.close()
  })

  test(`on ${name}, Bold and then Italic from the keyboard mark the same text, which stays drawn as selected, and Escape returns to it`, async () => {
    const { context, page } = await pageWithSelection(viewport, 'Milk')
    const control = (item: string) => formattingBar(page).locator(`[data-item="${item}"]`)
    // Back from the text is the bar's one stop, where the focus is by design.
    await page.keyboard.press('Shift+Tab')
    await poll(() => focused(page)).toBe('bar-undo')
    await poll(() => standIn(page)).toBe('Milk')
    for (const item of ['redo', 'style', 'mark-Bold']) {
      await poll(() =>
        formattingBar(page).locator('button[tabindex="0"]').getAttribute('id'),
      ).not.toBe(`bar-${item}`)
      await page.keyboard.press('ArrowRight')
      await poll(() => focused(page)).toBe(`bar-${item}`)
      await poll(() => formattingBar(page).locator('button[tabindex="0"]').getAttribute('id')).toBe(
        `bar-${item}`,
      )
    }
    await page.keyboard.press('Enter')
    await poll(() => control('mark-Bold').getAttribute('aria-pressed')).toBe('true')
    expect(await focused(page)).toBe('bar-mark-Bold')
    await poll(() => standIn(page)).toBe('Milk')
    await page.keyboard.press('ArrowRight')
    await poll(() => focused(page)).toBe('bar-mark-Italic')
    await page.keyboard.press('Enter')
    await poll(() => control('mark-Italic').getAttribute('aria-pressed')).toBe('true')
    expect(await control('mark-Bold').getAttribute('aria-pressed')).toBe('true')
    expect(await focused(page)).toBe('bar-mark-Italic')
    await poll(() => standIn(page)).toBe('Milk')
    await page.keyboard.press('Escape')
    await poll(() => inText(page)).toBe(true)
    await poll(() => selected(page)).toBe('Milk')
    expect(await standIn(page)).toBe('')
    await page.keyboard.type('Oat')
    await poll(() => body(page).textContent()).toBe('Oat')
    await context.close()
  })

  test(`on ${name}, the style menu, the insert menu and the link control act on the selection that was in the text`, async () => {
    const { context, page } = await pageWithSelection(viewport, 'Milk')
    const control = (item: string) => formattingBar(page).locator(`[data-item="${item}"]`)
    // The style menu, with the pointer: the block of the selection becomes a heading.
    await control('style').click()
    await formattingBar(page).locator('[data-style="heading-2"]').click()
    await poll(() => body(page).locator('h2').textContent()).toBe('Milk')
    expect(await selected(page)).toBe('Milk')
    expect(await inText(page)).toBe(true)

    // The link control opens the link editor for the selected text; its address lands on it.
    await control('link').click()
    await poll(() => focused(page)).toBe('INPUT')
    await poll(() => standIn(page)).toBe('Milk')
    await page.keyboard.type('https://example.com')
    await page.keyboard.press('Enter')
    await poll(() => body(page).locator('a[href="https://example.com"]').textContent()).toBe('Milk')
    await poll(() => inText(page)).toBe(true)

    // The style menu, by key: back to the bar, to its trigger, into the menu, Enter on a style.
    await page.keyboard.press('Shift+Tab')
    await poll(() => focused(page)).toBe('bar-undo')
    for (const item of ['redo', 'style']) {
      await page.keyboard.press('ArrowRight')
      await poll(() => focused(page)).toBe(`bar-${item}`)
      await poll(() => formattingBar(page).locator('button[tabindex="0"]').getAttribute('id')).toBe(
        `bar-${item}`,
      )
    }
    await page.keyboard.press('ArrowDown')
    await poll(() => control('style').getAttribute('aria-expanded')).toBe('true')
    await page.keyboard.press('ArrowDown')
    await poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe(
      'menuitemradio',
    )
    await formattingBar(page).locator('[data-style="heading-3"]').focus()
    await page.keyboard.press('Enter')
    await poll(() => body(page).locator('h3').textContent()).toBe('Milk')

    // The insert menu puts its block at the caret that was in the text: after this heading.
    await body(page).locator('h3').click()
    await page.keyboard.press('End')
    await control('insert').click()
    await formattingBar(page).locator('[data-insert="divider"]').click()
    await poll(() => body(page).locator('h3 + hr, h3 + [data-block] hr, h3 ~ hr').count()).toBe(1)
    await context.close()
  })
}

test('the sidebar’s field narrows the page list to the titles that have it', async () => {
  const context = await browser.newContext({ viewport: PHONE })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  for (const title of ['Groceries', 'Trip plans']) {
    await page.click('#new-page')
    await poll(() => focused(page)).toBe('page-title')
    await page.keyboard.type(title)
    await poll(() => page.inputValue('#page-title')).toBe(title)
  }
  const listed = () => page.locator('nav[aria-label="Pages"] ul button').allTextContents()
  await poll(listed).toEqual(['Groceries', 'Trip plans'])
  await page.fill('#page-filter', 'trip')
  await poll(listed).toEqual(['Trip plans'])
  await page.fill('#page-filter', 'nothing like it')
  await poll(listed).toEqual([])
  await page.getByText('No page has that in its title.').waitFor()
  await page.fill('#page-filter', '')
  await poll(listed).toEqual(['Groceries', 'Trip plans'])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  await context.close()
})
