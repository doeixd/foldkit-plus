/**
 * The studio's shell in the published demo's build mode: on a wide window it fills the window and
 * only its centre column scrolls, the sidebar and the settings panel standing for their full
 * height; on a phone the document scrolls.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import config from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer(
    mergeConfig(config, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      mode: 'sandbox',
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** The first post of the list, open in the editor. */
const openPost = async (page: Page) => {
  await page.goto(`${url}/?as=edda&reset`)
  const first = page.locator('#studio-main tbody button').first()
  await first.waitFor({ timeout: 120_000 })
  await first.click()
  await page.getByRole('complementary', { name: 'Post settings' }).waitFor({ timeout: 60_000 })
}

const wheelToEnd = async (page: Page, width: number, height: number) => {
  await page.mouse.move(width / 2, height / 2)
  for (let step = 0; step < 40; step++) {
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
}

test.each([
  [1280, 720],
  [1440, 900],
])(
  'at %ipx wide the window does not scroll: the centre column does, between a full-height sidebar and settings panel',
  async (width, height) => {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
    await openPost(page)
    await wheelToEnd(page, width, height)

    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const main = document.getElementById('studio-main')!
      const lastField = Array.from(main.querySelectorAll('input, textarea')).at(-1)!
      return {
        windowScroll: document.documentElement.scrollTop,
        windowOverflow: document.documentElement.scrollHeight - innerHeight,
        columnScrolled: main.scrollTop,
        sidebar: box('aside[aria-label="Studio"]'),
        settings: box('aside[aria-label="Post settings"]'),
        lastField: lastField.getBoundingClientRect(),
        innerHeight,
      }
    })
    expect(measured.windowScroll).toBe(0)
    expect(measured.windowOverflow).toBeLessThanOrEqual(0)
    expect(measured.columnScrolled).toBeGreaterThan(0)
    expect(measured.sidebar.top).toBe(0)
    expect(measured.sidebar.bottom).toBe(measured.innerHeight)
    // The panel's height is the window's less the bar in rem, which lands a fraction of a pixel short.
    expect(Math.abs(measured.settings.bottom - measured.innerHeight)).toBeLessThan(1)
    expect(measured.lastField.bottom).toBeLessThanOrEqual(measured.innerHeight)
    expect(measured.lastField.top).toBeGreaterThanOrEqual(0)
    await page.context().close()
  },
)

test('at 390px the editor spends little on chrome: one header row, one bar, a toolbar that fits and a page that does not scroll sideways', async () => {
  const page = await (
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage()
  await openPost(page)
  const measured = await page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]')!
    const root = document.documentElement
    return {
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarOverflow: toolbar.scrollWidth - toolbar.clientWidth,
      // The layout viewport, which a phone's zoom-to-fit does not hide an overflow from.
      sideways: root.scrollWidth - root.clientWidth,
      header: document.querySelector('aside[aria-label="Studio"]')!.getBoundingClientRect().height,
    }
  })
  expect(measured.toolbarTop).toBeLessThanOrEqual(120)
  expect(measured.toolbarOverflow).toBeLessThanOrEqual(0)
  expect(measured.sideways).toBeLessThanOrEqual(0)
  expect(measured.header).toBeLessThanOrEqual(52)

  // The document ends past the settings with the pill's room, not under it, and with no band.
  await page.waitForTimeout(3_000) // a pushed entry's scroll is held at the top for 2s
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const end = await page.evaluate(() => {
    const controls = document.querySelectorAll('aside[aria-label="Post settings"] :is(button, a)')
    return {
      last: controls[controls.length - 1]!.getBoundingClientRect().bottom,
      pill: document.querySelector('details')!.getBoundingClientRect().top,
      settings: document.querySelector('aside[aria-label="Post settings"]')!.getBoundingClientRect()
        .bottom,
      inner: innerHeight,
    }
  })
  expect(end.last).toBeLessThanOrEqual(end.pill)
  expect(Math.abs(end.settings - end.inner)).toBeLessThan(1)
  await page.context().close()
})

const column = (page: Page) => page.locator('#studio-main')
const offset = (page: Page) => column(page).evaluate(element => element.scrollTop)
/** Scrolled by the wheel, as a reader does: a programmatic scroll is not an act that ends a held restore. */
const scrollTo = async (page: Page, top: number) => {
  await page.mouse.move(700, 250)
  for (let step = 0; step < 40 && (await offset(page)) < top; step++) {
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
}

test('the centre column keeps its scroll across navigations: Back and Forward return, a pushed entry starts at the top, a reload returns', async () => {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 500 } })
  ).newPage()
  await page.goto(`${url}/?as=edda`)
  const first = page.locator('#studio-main tbody button').first()
  await first.waitFor({ timeout: 120_000 })
  await page.waitForTimeout(500)
  const room = (target: Page) =>
    column(target).evaluate(element => element.scrollHeight - element.clientHeight)
  expect(await room(page)).toBeGreaterThan(40)

  // The list, scrolled; opening a post is a pushed entry, which starts at the top.
  await scrollTo(page, 60)
  const list = await offset(page)
  expect(list).toBeGreaterThan(40)
  await first.click()
  await page.getByRole('complementary', { name: 'Post settings' }).waitFor({ timeout: 60_000 })
  await expect.poll(() => offset(page), { timeout: 5_000 }).toBe(0)

  // The post's body is drawn after the screen: scroll once it is tall.
  await expect.poll(() => room(page), { timeout: 20_000 }).toBeGreaterThan(700)
  await scrollTo(page, 600)
  const post = await offset(page)
  expect(post).toBeGreaterThan(500)

  // Back: the list where it was left, though the post's taller screen was drawn first.
  await page.goBack()
  await page.locator('#studio-main tbody button').first().waitFor()
  await expect
    .poll(async () => Math.abs((await offset(page)) - list), { timeout: 10_000 })
    .toBeLessThan(4)

  // Forward: the post where it was left.
  await page.goForward()
  await page.getByRole('complementary', { name: 'Post settings' }).waitFor({ timeout: 60_000 })
  await expect
    .poll(async () => Math.abs((await offset(page)) - post), { timeout: 10_000 })
    .toBeLessThan(4)

  // A reload of a scrolled entry returns to where it was.
  await page.reload()
  await page.getByRole('complementary', { name: 'Post settings' }).waitFor({ timeout: 60_000 })
  await expect
    .poll(async () => Math.abs((await offset(page)) - post), { timeout: 10_000 })
    .toBeLessThan(4)

  // A link followed from a scrolled screen starts the next at the top.
  await page.getByRole('link', { name: 'Pages' }).click()
  await page.locator('#sitePages button').first().waitFor({ timeout: 60_000 })
  await expect.poll(() => offset(page), { timeout: 5_000 }).toBe(0)
  await page.context().close()
})
