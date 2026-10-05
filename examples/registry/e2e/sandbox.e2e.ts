/**
 * The published sandbox end to end: built as it is deployed (`vite build
 * --mode sandbox`), served as static files, and driven in Chromium. Two
 * devices on one page, the server in a SharedWorker: an edit in one shows in
 * the other, and an edit that loses to the other's later one is said.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { build, preview, type PreviewServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'

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
  server = await preview({
    root,
    configFile: false,
    logLevel: 'error',
    build: { outDir },
    preview: { port: 0 },
  })
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

test('the later of two edits wins, the device whose edit lost is told, and an offline edit survives a reload', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  const row = 'p000005'
  await cell(page, 'Device A', row, 'cents').waitFor({ timeout: 60_000 })
  await cell(page, 'Device B', row, 'cents').waitFor({ timeout: 60_000 })
  const offline = (device: Device) =>
    pane(page, device).getByRole('checkbox', { name: 'Work offline' })
  const mark = (device: Device) => cell(page, device, row, 'cents').getAttribute('data-mark')

  // A commits first; B, offline, edits the same price and commits when back.
  await offline('Device B').check()
  await editPrice(page, 'Device A', row, '1.11')
  await expect.poll(() => cell(page, 'Device B', row, 'cents').textContent()).not.toBe('1.11')
  await editPrice(page, 'Device B', row, '2.22')
  await expect.poll(() => mark('Device B')).toBe('pending')
  await offline('Device B').uncheck()
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
  await offline('Device B').check()
  await editPrice(page, 'Device B', 'p000006', '6.66')
  await expect
    .poll(() => cell(page, 'Device B', 'p000006', 'cents').getAttribute('data-mark'))
    .toBe('pending')
  const frameB = page.frames().find(frame => frame.url().includes('pane=device-b'))!
  await frameB.goto(frameB.url())
  await expect
    .poll(() => cell(page, 'Device A', 'p000006', 'cents').textContent(), { timeout: 15_000 })
    .toBe('6.66')
  expect(errors).toEqual([])
  await page.close()
})
