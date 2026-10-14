/**
 * The playground in a real Chromium: what only a browser shows. A click on a task's checkbox or
 * a toggle's arrow (an adornment, outside the editable text), a slash command typed and chosen,
 * an image file read from disk, a discussion started from selected text, and the handle beside
 * the block under the pointer.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'

let vite: ViteDevServer
let browser: Browser
let origin: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (address === null || typeof address !== 'object') throw new Error('Vite is not listening')
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const open = async (
  errors: Array<string>,
  viewport = { width: 1400, height: 900 },
): Promise<Page> => {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(origin)
  await page.waitForSelector('[contenteditable=true] h1', { timeout: 120_000 })
  return page
}

/** A new empty line after the last block, with the caret on it. */
const newLine = async (page: Page) => {
  await page.click('[contenteditable=true] > p:last-of-type')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
}

test('an adornment flips its block’s prop: a task’s checkbox, a toggle’s arrow', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const unticked = page.locator('[data-task=unchecked]')
  await expect.poll(() => unticked.count()).toBe(1)
  await unticked.locator('input').click()
  await expect.poll(() => unticked.count()).toBe(0)
  // The browser's own change is refused; the box shows what the document says.
  await expect.poll(() => page.locator('[data-task] input:checked').count()).toBe(2)

  const toggle = page.locator('[data-toggle]')
  const detail = toggle.locator('[data-block] ~ [data-block]')
  expect(await detail.isVisible()).toBe(false)
  await toggle.locator('[data-toggle-arrow]').click()
  await expect.poll(() => toggle.getAttribute('data-toggle')).toBe('open')
  await expect.poll(() => detail.isVisible()).toBe(true)
  expect(errors).toEqual([])
})

test('a slash command chosen with Enter inserts its block where the line was', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await newLine(page)
  await page.keyboard.type('/tab')
  await page.getByRole('menuitem', { name: 'Table', exact: true }).waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.type('First cell')
  const tables = page.locator('[contenteditable=true] > table')
  await expect.poll(() => tables.count()).toBe(2)
  expect(await tables.last().locator('td').first().textContent()).toBe('First cell')
  // The query is gone, and the blank line stays below the table to type on.
  expect(await page.locator('[contenteditable=true] > :last-child').evaluate(e => e.tagName)).toBe(
    'P',
  )
  expect(errors).toEqual([])
})

test('an image file is read into the document at its own width', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  // A 2×2 PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.setInputFiles('input[type=file]', {
    name: 'dot.png',
    mimeType: 'image/png',
    buffer: png,
  })
  const figure = page.locator('figure[data-image]').last()
  await expect.poll(() => figure.locator('img').getAttribute('alt')).toBe('dot')
  expect(await figure.getAttribute('style')).toBe('--image-width: 2px')

  await page.setInputFiles('input[type=file]', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await page.getByRole('alert').waitFor()
  expect(await page.getByRole('alert').textContent()).toContain('notes.txt is not a PNG')
  expect(errors).toEqual([])
})

test('selected text starts a discussion anchored to it', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.locator('[contenteditable=true] h1').evaluate(heading => {
    const text = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode()!
    getSelection()!.setBaseAndExtent(text, 2, text, 8)
  })
  // The toolbar over the selection offers the comment.
  const floating = page.getByRole('toolbar', { name: 'Selection' })
  await floating.waitFor()
  await floating.getByRole('button', { name: 'Comment', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Say something about the selection…' })
    .fill('Is little right?')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.locator('h1 [data-comment]').textContent()).toBe('little')
  await expect
    .poll(() => page.getByRole('complementary', { name: 'Discussions' }).textContent())
    .toContain('Is little right?')
  expect(errors).toEqual([])
})

test('the handle sits inside the page beside the hovered block, and clicked, opens its menu', async () => {
  const errors: Array<string> = []
  const page = await open(errors, { width: 1280, height: 720 })
  const quote = page.locator('[contenteditable=true] > blockquote')
  await quote.hover()
  const handle = page.getByRole('button', { name: 'Block handle' })
  await handle.waitFor()
  const [grip, block, surface] = await Promise.all([
    handle.boundingBox(),
    quote.boundingBox(),
    page.getByRole('region', { name: 'Editor' }).boundingBox(),
  ])
  // Left of the block, inside the editor's card, and level with the block's first line.
  expect(grip!.x + grip!.width).toBeLessThanOrEqual(block!.x)
  expect(grip!.x).toBeGreaterThanOrEqual(surface!.x)
  expect(Math.abs(grip!.y + grip!.height / 2 - (block!.y + 15))).toBeLessThan(10)

  await handle.click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect.poll(() => page.locator('[contenteditable=true] > blockquote').count()).toBe(2)
  expect(errors).toEqual([])
})

test('dragging the handle moves its block', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.locator('[contenteditable=true] > blockquote').hover()
  const grip = (await page.getByRole('button', { name: 'Block handle' }).boundingBox())!
  const heading = (await page.locator('[contenteditable=true] > h1').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++) {
    const y = grip.y + ((heading.y + 4 - grip.y) * step) / 10
    await page.mouse.move(grip.x + grip.width / 2, y)
  }
  await page.mouse.up()
  await expect
    .poll(() => page.locator('[contenteditable=true] > :first-child').evaluate(e => e.tagName))
    .toBe('BLOCKQUOTE')
  expect(errors).toEqual([])
})

test('Enter in code breaks the line, and on an empty last line leaves the block', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const code = page.locator('[contenteditable=true] > pre')
  // The code's last line, `})`: End is the end of the line clicked, not of the code.
  const box = (await code.boundingBox())!
  await code.click({ position: { x: 40, y: box.height - 30 } })
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('next')
  await expect.poll(() => page.locator('[contenteditable=true] > pre').count()).toBe(1)
  await expect.poll(() => code.textContent()).toContain('})\nnext')
  // A break at the end leaves an empty last line, and Enter there leaves the code.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('after')
  await expect.poll(() => code.evaluate(e => e.nextElementSibling?.textContent)).toBe('after')
  expect(errors).toEqual([])
})
