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
  // Named by its label, then the line under it.
  await page.getByRole('menuitem', { name: /^Table/ }).waitFor()
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

  expect(errors).toEqual([])
})

test('any other file becomes media or an attachment, and one too large is refused', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.setInputFiles('input[type=file]', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  const attachment = page.locator('[contenteditable=true] [data-attachment]').last()
  await expect.poll(() => attachment.textContent()).toBe('notes.txt5 B')
  expect(await attachment.getAttribute('href')).toBe('data:text/plain;base64,aGVsbG8=')
  await page.setInputFiles('input[type=file]', {
    name: 'tone.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFF'),
  })
  await expect
    .poll(() => page.locator('[contenteditable=true] audio').last().getAttribute('title'))
    .toBe('tone')
  await page.setInputFiles('input[type=file]', {
    name: 'huge.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(9 * 1024 * 1024),
  })
  await page.getByRole('alert').waitFor()
  expect(await page.getByRole('alert').textContent()).toContain('huge.bin is larger than 8 MB')
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
    .poll(() => page.getByRole('region', { name: 'Discussions' }).textContent())
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

test('dragging the handle shows where the block will land, and moves it there', async () => {
  const errors: Array<string> = []
  // Tall enough to show both blocks, so the drag stays clear of the edges, which scroll.
  const page = await open(errors, { width: 1400, height: 1800 })
  await page.locator('[contenteditable=true] > blockquote').hover()
  const grip = (await page.getByRole('button', { name: 'Block handle' }).boundingBox())!
  const heading = (await page.locator('[contenteditable=true] > h1').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  // Into the text, as a hand moves, with time for the page to draw between moves: the pointer
  // crosses other blocks, which must not take the handle, and the drag with it, away.
  for (let step = 1; step <= 20; step++) {
    const y = grip.y + ((heading.y + 4 - grip.y) * step) / 20
    await page.mouse.move(grip.x + grip.width / 2 + 15 * step, y)
    await page.waitForTimeout(30)
  }
  // While held: a line where it would land, and the block itself dimmed.
  const line = (await page.locator('[data-richtext-drop]').boundingBox())!
  expect(line.height).toBeGreaterThan(0)
  expect(Math.abs(line.y - heading.y)).toBeLessThan(4)
  expect(
    await page.locator('[data-richtext-dragging]').evaluate(e => getComputedStyle(e).opacity),
  ).toBe('0.4')
  await page.mouse.up()
  await expect
    .poll(() => page.locator('[contenteditable=true] > :first-child').evaluate(e => e.tagName))
    .toBe('BLOCKQUOTE')
  expect(await page.locator('[data-richtext-drop], [data-richtext-dragging]').count()).toBe(0)
  expect(errors).toEqual([])
})

test('Enter makes a new line you can see, however fast it is pressed', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.click('[contenteditable=true] > h1')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  const lines = page.locator('[contenteditable=true] > h1 + p, [contenteditable=true] > h1 + p + p')
  await expect.poll(() => lines.count()).toBe(2)
  for (const height of await lines.evaluateAll(all =>
    all.map(line => line.getBoundingClientRect().height),
  ))
    expect(height).toBeGreaterThan(20)
  await page.keyboard.type('typed')
  await expect
    .poll(() =>
      page.locator('[contenteditable=true] > h1 + p + p').evaluate(line => line.textContent),
    )
    .toBe('typed')
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

test('empty lines can be reached with the arrow keys, and a new callout has a line', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.click('[contenteditable=true] > p')
  await page.keyboard.press('End')
  for (let count = 0; count < 3; count++) await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('up')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('down')
  const texts = () =>
    page
      .locator('[contenteditable=true] > p')
      .evaluateAll(lines => lines.slice(1, 4).map(line => line.textContent))
  await expect.poll(texts).toEqual(['', 'up', 'down'])

  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Callout' }).click()
  const callout = page.locator('[contenteditable=true] > aside').first()
  const [box, icon] = await Promise.all([
    callout.boundingBox(),
    callout.locator('[data-callout-icon]').boundingBox(),
  ])
  expect(box!.height).toBeGreaterThan(40)
  expect(icon!.y).toBeGreaterThan(box!.y)
  expect(icon!.y + icon!.height).toBeLessThan(box!.y + box!.height)
  expect(errors).toEqual([])
})

test('a table has its toolbar, and Tab moves from cell to cell, adding a row at the end', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const cells = () =>
    page
      .locator('[contenteditable=true] > table tr')
      .evaluateAll(rows => rows.map(row => row.children.length))
  await page.click('[contenteditable=true] > table tr:last-child td:last-child')
  await page.getByRole('toolbar', { name: 'Table' }).waitFor()
  await page.click('[data-table="column-right"]')
  await expect.poll(cells).toEqual([3, 3, 3])
  await page.click('[data-table="delete-column"]')
  await expect.poll(cells).toEqual([2, 2, 2])
  await page.click('[contenteditable=true] > table tr:last-child td:last-child')
  await page.keyboard.press('Tab')
  await page.keyboard.type('next row')
  await expect.poll(cells).toEqual([2, 2, 2, 2])
  await expect
    .poll(() =>
      page.locator('[contenteditable=true] > table tr:last-child td').first().textContent(),
    )
    .toBe('next row')
  // Outside a table and code, Tab is not the editor's.
  await page.click('[contenteditable=true] > h1')
  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('contenteditable')),
  ).not.toBe('true')
  expect(errors).toEqual([])
})

test('a code block has its toolbar: its language, and Tab indents', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const code = page.locator('[contenteditable=true] > pre')
  await code.locator('[data-run]').click()
  const toolbar = page.getByRole('toolbar', { name: 'Code' })
  await toolbar.waitFor()
  await toolbar.getByRole('combobox', { name: 'Language' }).selectOption('json')
  await expect.poll(() => code.getAttribute('data-language')).toBe('json')
  await code.locator('[data-run]').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Tab')
  await expect.poll(() => code.locator('[data-run]').textContent()).toMatch(/^ {2}\S/)
  expect(errors).toEqual([])
})

test('Ctrl+F finds in the document, marks the current match, and replaces', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const editor = page.locator('[contenteditable=true]')
  await editor.locator('h1').click()
  await page.keyboard.press('Control+f')
  const query = page.getByRole('searchbox', { name: 'Find' })
  await expect.poll(() => query.evaluate(field => field === document.activeElement)).toBe(true)
  await query.fill('the')
  const all = editor.locator('[data-decoration~="search"], [data-decoration~="search-current"]')
  const current = editor.locator('[data-decoration~="search-current"]')
  await expect.poll(() => all.count()).toBeGreaterThan(2)
  const total = await all.count()
  await expect.poll(() => current.count()).toBe(1)
  const count = page.getByRole('search').locator('[aria-live]')
  await expect.poll(() => count.textContent()).toBe(`1 of ${total}`)
  await query.press('Enter')
  await expect.poll(() => count.textContent()).toBe(`2 of ${total}`)
  await query.press('Shift+Enter')
  await query.press('Shift+Enter')
  await expect.poll(() => count.textContent()).toBe(`${total} of ${total}`)
  await page.getByRole('textbox', { name: 'Replace with' }).fill('THE')
  await page.getByRole('button', { name: 'Match case' }).click()
  await expect.poll(() => count.textContent()).toMatch(/ of /)
  await page.getByRole('button', { name: 'Replace all' }).click()
  await expect.poll(() => count.textContent()).toBe('No matches')
  await expect.poll(() => all.count()).toBe(0)
  await query.press('Escape')
  await expect.poll(() => page.getByRole('search').count()).toBe(0)
  expect(errors).toEqual([])
})

test('the contents list the headings, and one chosen takes the caret to it', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const contents = page.getByRole('navigation', { name: 'Contents' })
  const last = contents.getByRole('button').last()
  const name = (await last.textContent()) ?? ''
  await last.click()
  await page.keyboard.type('Now ')
  const heading = page.locator('[contenteditable=true] h2', { hasText: `Now ${name}` })
  await expect.poll(() => heading.count()).toBe(1)
  await expect.poll(() => last.getAttribute('aria-current')).toBe('location')
  expect(errors).toEqual([])
})

test('Export copies the document as Markdown to the clipboard', async () => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  try {
    const page = await context.newPage()
    await page.goto(origin)
    await page.waitForSelector('[contenteditable=true] h1', { timeout: 120_000 })
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click()
    await expect
      .poll(() => page.getByRole('status').textContent())
      .toMatch(/^Copied the document as Markdown/)
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/^# A little room to think\./)
  } finally {
    await context.close()
  }
})

test('a new empty line hints at the slash menu, until something is typed on it', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await page.click('[contenteditable=true] h1 + p')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const hinted = page.locator('[contenteditable=true] [data-hint]')
  await expect.poll(() => hinted.getAttribute('data-hint')).toBe('Type / for blocks')
  await page.keyboard.type('x')
  await expect.poll(() => hinted.count()).toBe(0)
  expect(errors).toEqual([])
})

test('a footnote is inserted from the slash menu, previewed at its reference, and visited both ways', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  await newLine(page)
  await page.keyboard.type('Claim /foot')
  await page.keyboard.press('Enter')
  // The caret is in the new note, which the editor drew last.
  await page.keyboard.type('Source')
  const notes = page.locator('[contenteditable=true] [data-footnote]')
  await expect.poll(() => notes.last().textContent()).toContain('Source')
  const reference = page.locator('[contenteditable=true] sup[data-footnote-ref="2"]')
  await reference.click()
  const card = page.getByRole('group', { name: 'Footnote 2' })
  await expect.poll(() => card.textContent()).toContain('Source')
  await card.getByRole('button', { name: 'Go to note' }).click()
  await page.keyboard.type('!')
  await expect.poll(() => notes.last().textContent()).toContain('!Source')
  await notes.last().getByRole('button', { name: 'Back to the reference' }).click()
  await page.keyboard.type('x')
  const paragraph = page.locator('[contenteditable=true] > p', { hasText: 'Claim' })
  await expect.poll(() => paragraph.textContent()).toBe('Claim 2x')
  // Typed after the reference, not into it.
  expect(await reference.textContent()).toBe('2')
  expect(errors).toEqual([])
})

test('a link is typed straight into the editor that opens, and writing goes on after it', async () => {
  const errors: Array<string> = []
  const page = await open(errors)
  const first = page.locator('[contenteditable=true] h1 + p [data-run]').first()
  await first.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page
    .getByRole('toolbar', { name: 'Selection' })
    .getByRole('button', { name: 'Link' })
    .click()
  // The field takes the focus as it opens, so a link can be pasted or typed at once.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-link')))
    .toBe('address')
  await page.keyboard.type('https://example.com')
  await page.keyboard.press('Enter')
  // One link, drawn as more than one element where the discussion's highlight crosses it.
  const link = page.locator('[contenteditable=true] h1 + p a[href="https://example.com"]')
  await expect.poll(() => link.count()).toBeGreaterThan(0)
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('contenteditable')))
    .toBe('true')
  expect(errors).toEqual([])
})
