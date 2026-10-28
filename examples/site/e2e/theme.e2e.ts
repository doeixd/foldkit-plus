/**
 * A reader's theme end to end, on the Vite dev server in Chromium: every link
 * is a page load of its own, so the theme a link to `/create` carries is kept,
 * the component pages draw their previews in it and say so, and the way back
 * to the default holds on the next page. A kept theme is drawn before the
 * application starts at all: the head script draws the first frame.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { Theme } from 'foldkit-mixins/theme'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which compiles it and resolves the workspace sources:
// Vite loading the file itself hands `foldkit-ssr/vite` to Node, which finds
// only a build CI's e2e job never makes.
import config from '../vite.config.js'
import { defaults } from '../src/gallery/theme.js'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  const serving = await config({ command: 'serve', mode: 'development', isPreview: false })
  vite = await createServer(
    mergeConfig(serving, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const NOTICE = 'Previews are drawn in the theme you made.'

/** The accent hue the page's first preview is drawn with. */
const previewHue = (page: Page) =>
  page
    .locator('[data-size="page"]')
    .first()
    .evaluate(element => getComputedStyle(element).getPropertyValue('--fk-knob-accent-h').trim())

const DEFAULT_HUE = Theme.variables(Theme.make(defaults))['accent-h']

const open = async (page: Page, path: string) => {
  // A first load pre-bundles the workspace, which takes a while.
  await page.goto(`${url}${path}`, { timeout: 120_000 })
  await page.waitForSelector('[data-size="page"], [data-size="canvas"]', { timeout: 120_000 })
}

/** A colour's hue on the OKLCH wheel, in degrees, as the browser paints it. */
const hueOf = ([red, green, blue]: ReadonlyArray<number>): number => {
  const linear = (channel: number) => {
    const value = channel! / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [red!, green!, blue!].map(linear) as [number, number, number]
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const x = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const y = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * The Components canvas's Segmented preview: its fluid highlight and the
 * preview's accent ink, each painted as the browser draws it, so a test can
 * say whose ink the highlight is.
 */
const hoverFilm = (page: Page) =>
  page.locator('[data-size="canvas"]').evaluate(preview => {
    const group = preview.querySelector('[role="group"][aria-label="Range"]')
    if (group === null) throw new Error('the canvas draws no Segmented control')
    // The recipe draws the pressed pill, then the highlight that follows the pointer.
    const highlight = group.querySelectorAll('[aria-hidden="true"]')[1]
    if (!(highlight instanceof HTMLElement))
      throw new Error('the Segmented control has no highlight')
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')!
    const paint = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const [r, g, b, a] = paint(getComputedStyle(highlight).backgroundColor)
    // The default accent's ink lies outside sRGB, and painting clips it: its
    // painted hue is some 20 degrees off the knob's, so it is compared as painted.
    const swatch = document.createElement('div')
    swatch.style.background = 'var(--fk-accent-ink)'
    preview.append(swatch)
    const [inkR, inkG, inkB] = paint(getComputedStyle(swatch).backgroundColor)
    swatch.remove()
    return {
      rgb: [r!, g!, b!],
      alpha: a! / 255,
      opacity: getComputedStyle(highlight).opacity,
      accentInk: [inkR!, inkG!, inkB!],
      strength: getComputedStyle(preview).getPropertyValue('--fk-knob-state-hover').trim(),
    }
  })

test('a theme made on /create follows the reader to every component page', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))

  // A shared link's theme is the one kept.
  await open(page, '/create?accent.hue=30')
  await open(page, '/components/button')
  await expect.poll(() => previewHue(page), { timeout: 15_000 }).toBe('30')
  await expect(page.getByText(NOTICE).isVisible()).resolves.toBe(true)

  // A reload is another page load, which reads the kept theme again.
  await page.reload({ timeout: 120_000 })
  await page.waitForSelector('[data-size="page"]', { timeout: 60_000 })
  await expect.poll(() => previewHue(page), { timeout: 15_000 }).toBe('30')

  // The notice keeps its place once hidden, so the previews below it stay put.
  const previewTop = () =>
    page
      .locator('[data-size="page"]')
      .first()
      .evaluate(e => e.getBoundingClientRect().top)
  const top = await previewTop()
  await page.getByRole('button', { name: 'Use the default' }).click()
  await expect.poll(() => page.getByText(NOTICE).isVisible(), { timeout: 15_000 }).toBe(false)
  expect(await previewTop()).toBe(top)
  expect(await previewHue(page)).toBe(DEFAULT_HUE)

  // The default keeps nothing, so the next page has no theme to draw.
  const kept = () => page.evaluate(() => localStorage.getItem('foldkit-site-theme'))
  await expect.poll(kept, { timeout: 15_000 }).toBe(null)
  await open(page, '/components/badge')
  expect(await kept()).toBe(null)
  expect(await page.getByText(NOTICE).isVisible()).toBe(false)
  expect(errors).toEqual([])
  await context.close()
})

test('a kept theme is drawn in the first frame, before the application starts', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await open(page, '/create?accent.hue=30')
  const knobs = () => page.evaluate(() => localStorage.getItem('foldkit-site-knobs'))
  await expect.poll(knobs, { timeout: 15_000 }).not.toBe(null)

  // The application's script answered with nothing: no Model, no Command, only the head.
  await page.route('**/src/entry.ts*', route =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  )
  await open(page, '/components/button')
  expect(await previewHue(page)).toBe('30')

  // Nothing kept, the head draws nothing over the default. (The dev server
  // styles the page from its script, which is blocked, so only the build's
  // first frame has the default theme to show.)
  await page.evaluate(() => localStorage.clear())
  await open(page, '/components/badge')
  expect(await page.locator('style[data-fk-knobs]').count()).toBe(0)
  expect(await previewHue(page)).not.toBe('30')
  await context.close()
})

test('the hover knobs reach a fluid highlight in the preview', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  // The application's own diagnostics, a resume that could not replay above
  // all; a dev server's notices are not this page's.
  page.on('console', message => {
    const text = message.text()
    if (text.includes('[foldkit-')) errors.push(`${message.type()}: ${text}`)
  })

  const week = page
    .locator('[data-size="canvas"] [role="group"][aria-label="Range"]')
    .getByRole('button', { name: 'Week' })
  const lit = () => hoverFilm(page)
  const shown = async () => (await lit()).opacity

  // Hover = accent: the fluid highlight is the hover, painted in the accent's hue.
  await open(page, '/create?surface.hover=accent')
  // The panes offer both knobs: the hover's strength beside Hover, the fade in Shape.
  await page.getByRole('tab', { name: 'Color' }).click()
  await expect
    .poll(() => page.locator('#knob-surface-hoverStrength-value').isVisible(), { timeout: 15_000 })
    .toBe(true)
  await page.getByRole('tab', { name: 'Shape' }).click()
  await expect
    .poll(() => page.locator('#knob-state-disabledOpacity-value').isVisible(), { timeout: 15_000 })
    .toBe(true)
  await week.hover()
  await expect.poll(shown, { timeout: 15_000 }).toBe('1')
  const hovered = await lit()
  expect(hovered.strength).toBe('12%')
  expect(hovered.alpha).toBeGreaterThan(0)
  // Within the wheel's rounding: the highlight is painted in the accent's ink.
  expect(Math.abs(hueOf(hovered.rgb) - hueOf(hovered.accentInk))).toBeLessThan(5)

  // Hover strength: the same ink, more of it.
  await open(page, '/create?surface.hover=accent&surface.hoverStrength=24')
  await expect.poll(async () => (await lit()).strength, { timeout: 15_000 }).toBe('24%')
  await week.hover()
  await expect.poll(shown, { timeout: 15_000 }).toBe('1')
  const deeper = await lit()
  expect(deeper.alpha).toBeGreaterThan(hovered.alpha)
  expect(errors).toEqual([])
  await context.close()
})

test('the fluid and reading knobs reach the Typography canvas', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    const text = message.text()
    if (text.includes('[foldkit-')) errors.push(`${message.type()}: ${text}`)
  })

  const typeTab = page.getByRole('tab', { name: 'Typography' })
  const shown = async () => {
    await typeTab.click()
    const h1 = page.locator('[data-size="specimen"] h1').first()
    const display = page.locator('[data-size="specimen"] p', { hasText: '1,284 orders' }).first()
    const body = page
      .locator('[data-size="specimen"] p', { hasText: 'Your card is charged' })
      .first()
    return {
      size: await h1.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)),
      displaySize: await display.evaluate(element =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
      container: await page
        .locator('[data-size="specimen"]')
        .evaluate(element => getComputedStyle(element).containerType),
      wrap: await h1.evaluate(element => getComputedStyle(element).textWrap),
      bodyWrap: await body.evaluate(element => getComputedStyle(element).textWrap),
      measure: await body.evaluate(element =>
        getComputedStyle(element).getPropertyValue('max-inline-size'),
      ),
      align: await body.evaluate(element => getComputedStyle(element).textAlign),
    }
  }

  // A still theme: the reading measure, wrap and alignment still apply.
  await open(
    page,
    '/create?type.fluid=0&reading.measure=40&reading.align=center&reading.headingWrap=pretty&reading.bodyWrap=wrap',
  )
  await page.getByRole('tab', { name: 'Type' }).click()
  for (const id of ['type-fluid', 'type-viewportMin', 'type-viewportMax']) {
    await expect
      .poll(() => page.locator(`#knob-${id}-value`).isVisible(), { timeout: 15_000 })
      .toBe(true)
  }
  await expect
    .poll(() => page.locator('#knob-reading-measure-value').getAttribute('aria-valuetext'), {
      timeout: 15_000,
    })
    .toBe('40ch')
  const still = await shown()
  expect(still.container).toBe('inline-size')
  expect(still.wrap).toBe('pretty')
  expect(still.bodyWrap).toBe('wrap')
  expect(still.align).toBe('center')
  expect(still.measure).not.toBe('none')

  // A fluid theme grows the same heading at this window.
  await open(
    page,
    '/create?type.fluid=1&reading.measure=40&reading.align=center&reading.headingWrap=pretty&reading.bodyWrap=wrap',
  )
  const fluid = await shown()
  expect(fluid.size).toBeGreaterThan(still.size)
  expect(fluid.displaySize).toBeGreaterThan(still.displaySize)
  expect(fluid.wrap).toBe('pretty')
  expect(fluid.bodyWrap).toBe('wrap')
  expect(fluid.align).toBe('center')

  expect(errors).toEqual([])
  await context.close()
})

test('the icon knobs restroke the pack on the preview and in the specimen', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    const text = message.text()
    if (text.includes('[foldkit-')) errors.push(`${message.type()}: ${text}`)
  })

  // The pack's mask, as the preview declares it: the icon stroke baked into the drawing.
  const mask = () =>
    page
      .locator('[data-size="canvas"]')
      .evaluate(canvas => getComputedStyle(canvas).getPropertyValue('--fk-icon-search').trim())

  // The specimen's drawings, beside the knobs: every stroke width it sets.
  const specimen = () =>
    page.evaluate(() => {
      const widths = new Set<string>()
      for (const svg of Array.from(document.querySelectorAll('aside svg'))) {
        const own = svg.getAttribute('stroke-width')
        if (own !== null) widths.add(own)
        for (const node of Array.from(svg.querySelectorAll('[stroke-width]')))
          widths.add(node.getAttribute('stroke-width') ?? '')
      }
      return [...widths].filter(Boolean).sort()
    })

  await open(page, '/create?icon.stroke=3')
  await expect.poll(mask, { timeout: 15_000 }).toContain('stroke-width=%223%22')
  await page.getByRole('tab', { name: 'Icons' }).click()
  await expect.poll(specimen, { timeout: 15_000 }).toEqual(['3'])

  await open(page, '/create?icon.stroke=1')
  await expect.poll(mask, { timeout: 15_000 }).toContain('stroke-width=%221%22')
  await page.getByRole('tab', { name: 'Icons' }).click()
  await expect.poll(specimen, { timeout: 15_000 }).toEqual(['1'])

  expect(errors).toEqual([])
  await context.close()
})
