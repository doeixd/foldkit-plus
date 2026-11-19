/**
 * The published sandbox end to end: built as it is deployed (`vite build
 * --mode sandbox`), served as static files, and driven in Chromium. Two
 * devices on one page, the server in a SharedWorker (or, without one, in the
 * top document): an edit in one shows in the other, and an edit that loses to
 * the other's later one is said.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { build, preview, type PreviewServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
let outDir: string
let server: PreviewServer
let browser: Browser
let url: string

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'registry-sandbox-'))
  await build({
    root,
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    mode: 'sandbox',
    logLevel: 'error',
    build: { outDir, emptyOutDir: true },
  })
  server = await onFreePort(() =>
    preview({
      root,
      configFile: false,
      logLevel: 'error',
      build: { outDir },
      preview: { port: 0 },
    }),
  )
  url = server.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await server?.close()
  if (outDir !== undefined) await rm(outDir, { recursive: true, force: true })
})

type Device = 'Device A' | 'Device B'
/** A device's page, in its frame. */
const pane = (page: Page, device: Device) => page.frameLocator(`iframe[title="${device}"]`)
const cell = (page: Page, device: Device, row: string, column: string) =>
  pane(page, device).locator(`[id="products:${row}:${column}"]`)

const editPrice = async (page: Page, device: Device, row: string, text: string) => {
  await cell(page, device, row, 'cents').click()
  await expect
    .poll(() => pane(page, device).locator('#products').getAttribute('aria-activedescendant'))
    .toBe(`products:${row}:cents`)
  await page.keyboard.press('Enter')
  await pane(page, device).locator('#products input').waitFor()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('two devices on one page, the server in the browser: an edit in one shows in the other', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  const row = 'p000002'
  await cell(page, 'Device A', row, 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'cents').waitFor({ timeout: 60_000 })

  await editPrice(page, 'Device A', row, '12.34')
  await expect.poll(() => cell(page, 'Device A', row, 'cents').textContent()).toBe('12.34')
  await expect
    .poll(() => cell(page, 'Device B', row, 'cents').textContent(), { timeout: 10_000 })
    .toBe('12.34')
  expect(errors).toEqual([])
  await page.close()
})

test('without SharedWorker, both frames meet the top document’s one server', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  // In every frame, before its scripts: a browser with no SharedWorker.
  await page.addInitScript(() => {
    Reflect.deleteProperty(globalThis, 'SharedWorker')
  })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  expect(await page.evaluate(() => typeof SharedWorker)).toBe('undefined')
  const row = 'p000003'
  await cell(page, 'Device A', row, 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'cents').waitFor({ timeout: 60_000 })

  await editPrice(page, 'Device A', row, '3.33')
  await expect
    .poll(() => cell(page, 'Device B', row, 'cents').textContent(), { timeout: 10_000 })
    .toBe('3.33')
  expect(errors).toEqual([])
  await page.close()
})

test('the later of two edits wins, the device whose edit lost is told, and an offline edit survives a reload', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  const row = 'p000005'
  await cell(page, 'Device A', row, 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'cents').waitFor({ timeout: 60_000 })
  const goOffline = (device: Device) =>
    pane(page, device).getByRole('button', { name: 'Go offline' })
  const goOnline = (device: Device) => pane(page, device).getByRole('button', { name: 'Go online' })
  const mark = (device: Device) => cell(page, device, row, 'cents').getAttribute('data-mark')

  // A commits first; B, offline, edits the same price and commits when back.
  await goOffline('Device B').click()
  // Working offline pauses B's exchange, not its live reads of the table: B
  // showing A's price is the sign A's edit is committed, so B's is the later.
  await editPrice(page, 'Device A', row, '1.11')
  await expect
    .poll(() => cell(page, 'Device B', row, 'cents').textContent(), { timeout: 10_000 })
    .toBe('1.11')
  await editPrice(page, 'Device B', row, '2.22')
  await expect.poll(() => mark('Device B')).toBe('pending')
  await goOnline('Device B').click()
  await expect
    .poll(() => cell(page, 'Device A', row, 'cents').textContent(), { timeout: 10_000 })
    .toBe('2.22')
  await expect.poll(() => mark('Device A')).toBe('replaced')
  expect(await pane(page, 'Device A').locator('#replaced li').first().textContent()).toContain(
    'Device B’s later edit replaced yours (1.11)',
  )
  expect(await mark('Device B')).not.toBe('replaced')

  // B offline again, an edit, and B's page reloaded: the edit is still on the device,
  // and goes once B is back (a reload starts online).
  await goOffline('Device B').click()
  await editPrice(page, 'Device B', 'p000006', '6.66')
  await expect
    .poll(() => cell(page, 'Device B', 'p000006', 'cents').getAttribute('data-mark'))
    .toBe('pending')
  // The cell is marked as soon as the edit is made, and the edit is written to
  // the device a moment later; the replica's own count says when it has been.
  // Reloading in that moment lost the edit, which no person types fast enough
  // to do, and CI sometimes did.
  await expect
    .poll(() => pane(page, 'Device B').locator('#exchange').textContent())
    .toBe('Offline: 1 edit waiting to sync')
  const frameB = page.frames().find(frame => frame.url().includes('pane=device-b'))!
  await frameB.goto(frameB.url())
  // The reloaded device starts its database and connection again, which the
  // first load is given a minute for.
  await expect
    .poll(() => cell(page, 'Device A', 'p000006', 'cents').textContent(), { timeout: 60_000 })
    .toBe('6.66')
  expect(errors).toEqual([])
  await page.close()
})

test('where a device is shows on the other, and its card says when it is offline', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  const row = 'p000007'
  await cell(page, 'Device A', row, 'line').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'line').waitFor({ timeout: 60_000 })

  // A focuses a cell; B draws A there, in A's colour, and says who.
  await cell(page, 'Device A', row, 'line').click()
  await expect
    .poll(() => cell(page, 'Device B', row, 'line').getAttribute('data-mark'), { timeout: 10_000 })
    .toBe('peer')
  expect(await cell(page, 'Device B', row, 'line').getAttribute('aria-description')).toBe(
    'Device A is here',
  )

  // B's card: synced, then offline, then synced again; A offline leaves presence.
  const badge = (device: Device) =>
    page.locator('section', { has: page.locator(`iframe[title="${device}"]`) }).getByRole('status')
  await expect.poll(() => badge('Device B').textContent()).toBe('Online · in sync')
  await pane(page, 'Device B').getByRole('button', { name: 'Go offline' }).click()
  await expect.poll(() => badge('Device B').textContent()).toBe('Offline')
  await pane(page, 'Device B').getByRole('button', { name: 'Go online' }).click()
  await expect
    .poll(() => badge('Device B').textContent(), { timeout: 10_000 })
    .toBe('Online · in sync')
  await pane(page, 'Device A').getByRole('button', { name: 'Go offline' }).click()
  await expect
    .poll(() => cell(page, 'Device B', row, 'line').getAttribute('data-mark'), { timeout: 10_000 })
    .toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('on a phone one device shows at a time, both stay mounted, and the page does not scroll sideways', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  const row = 'p000004'
  // Both devices run while only one is shown: the hidden one has its grid too.
  await cell(page, 'Device A', row, 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'cents').waitFor({ state: 'attached', timeout: 60_000 })
  const shown = (device: Device) => page.locator(`iframe[title="${device}"]`).isVisible()
  expect([await shown('Device A'), await shown('Device B')]).toEqual([true, false])

  const switcher = page.getByRole('radiogroup', { name: 'Device shown' })
  await switcher.getByRole('radio', { name: 'Device B' }).click()
  await expect.poll(() => shown('Device B')).toBe(true)
  expect(await shown('Device A')).toBe(false)

  // The switch is a radio group: an arrow moves the choice and the focus, which shows a ring.
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => shown('Device A')).toBe(true)
  expect(
    await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!)
      return (
        document.activeElement?.getAttribute('role') === 'radio' &&
        (style.outlineStyle !== 'none' || style.boxShadow !== 'none')
      )
    }),
  ).toBe(true)

  // Layout viewport, not `innerWidth`: a phone zooms out to fit an overflowing page.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
  await context.close()
})

test('on a desktop both devices show and there is no switch', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(url)
  await cell(page, 'Device A', 'p000004', 'cents').waitFor({ timeout: 60_000 })
  expect(await page.getByRole('radiogroup', { name: 'Device shown' }).isVisible()).toBe(false)
  expect(await page.locator('iframe[title="Device B"]').isVisible()).toBe(true)
  await page.close()
})

test('with the keyboard alone, Tab goes through Device A, then Device B, each button shows a focus ring, and the grid does not trap Tab', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(url)
  await cell(page, 'Device A', 'p000004', 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', 'p000004', 'cents').waitFor({ timeout: 60_000 })
  // Where focus is, by frame: the frame that has it names its element.
  const focused = async () => {
    for (const frame of page.frames().slice(1)) {
      const found = await frame.evaluate(() =>
        document.hasFocus() && document.activeElement !== document.body
          ? {
              label: (document.activeElement?.textContent ?? '').trim().slice(0, 30),
              id: document.activeElement?.id ?? '',
              outline:
                getComputedStyle(document.activeElement!).outlineStyle !== 'none' ||
                getComputedStyle(document.activeElement!).boxShadow !== 'none',
            }
          : null,
      )
      if (found !== null) return { frame: frame.url().includes('device-a') ? 'A' : 'B', ...found }
    }
    return null
  }
  await page.locator('body').press('Tab')
  const seen: Array<string> = []
  const rings = new Map<string, boolean>()
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press('Tab')
    const now = await focused()
    if (now === null) continue
    const key = `${now.frame}:${now.id || now.label}`
    seen.push(key)
    if (now.label === 'Go offline') rings.set(now.frame, now.outline)
    if (rings.size === 2) break
  }
  // A's button before B's, with A's grid between them left by Tab alone.
  expect(rings.get('A')).toBe(true)
  expect(rings.get('B')).toBe(true)
  const firstB = seen.findIndex(entry => entry.startsWith('B:'))
  expect(firstB).toBeGreaterThan(0)
  expect(seen.slice(0, firstB).every(entry => entry.startsWith('A:'))).toBe(true)
  await page.close()
})

test('the guide pill covers no control or grid cell, at rest and scrolled to the end, on a desktop and a phone', async () => {
  // Both devices' pages are frames, so their controls are measured in each frame and placed by its box.
  const overlaps = async (page: Page) => {
    const pill = await page.locator('details[data-corner] > summary').boundingBox()
    if (pill === null) throw new Error('the guide pill is not drawn')
    const hits: Array<string> = []
    const targets = 'button, a[href], input, [role="gridcell"]'
    const boxes = await page.locator(targets).evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect()
        return { label: el.tagName.toLowerCase(), x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
    for (const device of ['Device A', 'Device B'] as const) {
      const frame = await page.locator(`iframe[title="${device}"]`).boundingBox()
      if (frame === null) continue
      const inner = await pane(page, device)
        .locator(targets)
        .evaluateAll(els =>
          els.map(el => {
            const r = el.getBoundingClientRect()
            return { label: el.tagName.toLowerCase(), x: r.x, y: r.y, w: r.width, h: r.height }
          }),
        )
      for (const box of inner)
        boxes.push({
          ...box,
          label: `${device} ${box.label}`,
          x: box.x + frame.x,
          y: box.y + frame.y,
        })
    }
    const view = page.viewportSize()
    if (view === null) throw new Error('no viewport')
    for (const box of boxes) {
      // Only what the viewport shows can sit under the pill.
      if (box.w === 0 || box.h === 0) continue
      if (box.x >= view.width || box.x + box.w <= 0 || box.y >= view.height || box.y + box.h <= 0)
        continue
      const intersects =
        box.x < pill.x + pill.width &&
        pill.x < box.x + box.w &&
        box.y < pill.y + pill.height &&
        pill.y < box.y + box.h
      if (intersects) hits.push(box.label)
    }
    return hits
  }

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 800 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto(url)
    await cell(page, 'Device A', 'p000002', 'cents').waitFor({ timeout: 60_000 })
    expect(await overlaps(page), `at ${viewport.width}x${viewport.height}`).toEqual([])
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect
      .poll(() => overlaps(page), {
        timeout: 5_000,
        message: `scrolled, at ${viewport.width}x${viewport.height}`,
      })
      .toEqual([])
    await page.close()
  }
})
