/**
 * The page builder in the published demo's build mode (the server in a SharedWorker), driven with
 * a real pointer: at 1280px it has its three panels, a drag from the palette shows what it
 * carries and follows the pointer, Escape puts it down with the page untouched, and at 390px the
 * editor does not scroll sideways.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Locator, type Page, chromium } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, as `cms.e2e.ts` does.
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

/** The first page of the pages list, open in the builder. */
const openPage = async (page: Page) => {
  await page.goto(`${url}/pages?as=edda&reset`)
  const first = page.locator('#sitePages button').first()
  await first.waitFor({ timeout: 120_000 })
  await first.click()
  await page.getByRole('button', { name: 'Add Heading' }).waitFor({ timeout: 60_000 })
}

const layers = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-builder-row]'), row => row.textContent),
  )

test('at 1280px the builder has its three panels, and a drag shows what it carries and can be put down', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await openPage(page)

  // The palette, the layers and the inspector stand side by side (one panel at a time is the narrow layout).
  const tile = page.getByRole('button', { name: 'Add Heading' })
  expect(await page.locator('ul[aria-label="Layers"]').isVisible()).toBe(true)
  expect(await page.getByText('Select a block on the page').isVisible()).toBe(true)
  const before = await layers(page)

  const from = (await tile.boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const preview = page.locator('[popover]:popover-open')
  await page.mouse.move(start.x + 40, start.y + 60, { steps: 6 })
  await page.mouse.move(start.x + 200, start.y + 160, { steps: 8 })
  await expect.poll(() => preview.textContent()).toMatch(/Heading/)
  const near = (await preview.boundingBox())!
  // Beside the pointer, not under it.
  expect(near.x).toBeGreaterThan(start.x + 200)
  expect(near.x).toBeLessThan(start.x + 200 + 40)
  expect(near.y).toBeGreaterThan(start.y + 160)
  expect(near.y).toBeLessThan(start.y + 160 + 40)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-fk-drag'))).toBe(
    'mouse',
  )

  // It tracks the pointer.
  await page.mouse.move(start.x + 260, start.y + 100, { steps: 6 })
  const moved = (await preview.boundingBox())!
  expect(Math.abs(moved.x - near.x - 60)).toBeLessThan(4)
  expect(Math.abs(moved.y - near.y + 60)).toBeLessThan(4)

  // Escape puts it down: nothing is carried, and the page is as it was.
  await page.keyboard.press('Escape')
  await expect.poll(() => preview.count()).toBe(0)
  expect(
    await page.evaluate(() => document.documentElement.getAttribute('data-fk-drag')),
  ).toBeNull()
  await page.mouse.up()
  expect(await layers(page)).toEqual(before)
  expect(errors).toEqual([])
  await context.close()
})

type Point = { x: number; y: number }

/**
 * Presses at `from`, then walks to wherever `to` says at each of 14 steps, 35ms apart, as a hand does:
 * the target is measured again every step, since a panel that scrolls or a page that shifts moves it.
 * `release` runs while the button is still down.
 */
const drag = async (
  page: Page,
  from: Point,
  to: () => Promise<Point>,
  release: () => Promise<void>,
) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 14; step++) {
    const target = await to()
    await page.mouse.move(
      from.x + ((target.x - from.x) * step) / 14,
      from.y + ((target.y - from.y) * step) / 14,
    )
    await page.waitForTimeout(35)
  }
  // Held still a moment: what the drag shows is drawn for the place it is over.
  await page.waitForTimeout(150)
  await release()
  await page.mouse.up()
}

const middle = async (locator: Locator): Promise<Point> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A point `down` of the way down a locator's box. */
const within = async (locator: Locator, down: number): Promise<Point> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height * down }
}

const row = (page: Page, id: string) => page.locator(`[data-builder-row="${id}"]`)
const rowIds = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-builder-row]'), each =>
      each.getAttribute('data-builder-row'),
    ),
  )
/** Every live region's text: the studio draws several, and the Builder's is one of them. */
const announced = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live]'), each => each.textContent).join(' | '),
  )

const scheme = process.env['CMS_SCHEME'] === 'dark' ? 'dark' : 'light'

/** A screenshot of the drag under way, for a look at it: `CMS_SHOTS=<folder>`, `CMS_SCHEME=dark`. */
const shot = async (page: Page, name: string) => {
  const folder = process.env['CMS_SHOTS']
  if (folder !== undefined) await page.screenshot({ path: `${folder}/bdrag-${scheme}-${name}.png` })
}

const desktop = async (browser: Browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: scheme,
  })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await openPage(page)
  return { context, page, errors }
}

test('a tile dragged onto a layer row marks it, shows it can land, and adds the block there, three times over', async () => {
  const { context, page, errors } = await desktop(browser)
  const tile = page.getByRole('button', { name: 'Add Heading' })
  const preview = page.locator('[data-drag-source]')

  for (const [target, zone, down] of [
    ['image', 'before', 0.12],
    ['text', 'after', 0.9],
    ['columns', 'inside', 0.5],
  ] as const) {
    const before = await rowIds(page)
    const aimed = row(page, target)
    await drag(
      page,
      await middle(tile),
      () => within(aimed, down),
      async () => {
        // Where it would land is drawn on the row, and what is carried says it can land.
        await expect.poll(() => aimed.getAttribute('data-builder-drop')).toBe(zone)
        expect(await preview.getAttribute('data-drag-place')).toBe('here')
        expect(await page.locator('[data-builder-drop]').count()).toBe(1)
        await shot(page, `row-${zone}`)
      },
    )
    await expect.poll(async () => (await rowIds(page)).length).toBe(before.length + 1)
    const after = await rowIds(page)
    const added = after.find(id => !before.includes(id))!
    const at = after.indexOf(added)
    if (zone === 'before') expect(after[at + 1]).toBe(target)
    if (zone === 'after') expect(after[at - 1]).toBe(target)
    await expect.poll(() => announced(page)).toMatch(/Added/)
    // Nothing is left of the drag.
    expect(await preview.count()).toBe(0)
    expect(await page.locator('[data-builder-drop]').count()).toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.getAttribute('data-fk-drag')),
    ).toBeNull()
  }
  expect(errors).toEqual([])
  await context.close()
})

test('a tile dragged onto the canvas marks where it lands, in a node and at the end of the page', async () => {
  const { context, page, errors } = await desktop(browser)
  const tile = page.getByRole('button', { name: 'Add Heading' })
  const preview = page.locator('[data-drag-source]')
  const node = (id: string) => page.locator(`[data-composition-node="${id}"] > *`).first()

  const aims: Array<[string, () => Promise<Point>, () => Promise<void>]> = [
    [
      // A Text takes nothing inside it, so a drop in its middle lands after it, and says so.
      'the Text node',
      () => within(node('text'), 0.5),
      async () => {
        await expect
          .poll(() =>
            page.locator('[data-composition-drop="after"]').getAttribute('data-composition-node'),
          )
          .toBe('text')
      },
    ],
    [
      'the end of the page',
      // The gap under the Hero belongs to no node: a drop there lands last, which the frame marks.
      async () => {
        const hero = (await node('hero').boundingBox())!
        return { x: hero.x + hero.width / 2, y: hero.y + hero.height + 8 }
      },
      async () => {
        await expect
          .poll(() => page.locator('[data-builder-drop="end"]').count())
          .toBeGreaterThan(0)
      },
    ],
  ]
  for (const [name, to, shows] of aims) {
    const before = await rowIds(page)
    await drag(page, await middle(tile), to, async () => {
      await shows()
      expect(await preview.getAttribute('data-drag-place'), name).toBe('here')
      await shot(page, name.replaceAll(' ', '-'))
    })
    await expect
      .poll(async () => (await rowIds(page)).length, { message: name })
      .toBe(before.length + 1)
    await expect.poll(() => announced(page)).toMatch(/Added/)
  }
  expect(errors).toEqual([])
  await context.close()
})

test('a layer row dragged above another lands there, and a drag over nowhere says so and drops nothing', async () => {
  const { context, page, errors } = await desktop(browser)
  const preview = page.locator('[data-drag-source]')
  const before = await rowIds(page)
  expect(before.indexOf('quote')).toBeGreaterThan(before.indexOf('image'))

  await drag(
    page,
    await middle(row(page, 'quote')),
    () => within(row(page, 'image'), 0.12),
    async () => {
      await expect.poll(() => row(page, 'image').getAttribute('data-builder-drop')).toBe('before')
      expect(await preview.getAttribute('data-drag-place')).toBe('here')
    },
  )
  await expect.poll(async () => (await rowIds(page)).indexOf('quote')).toBe(before.indexOf('image'))
  await expect.poll(() => announced(page)).toMatch(/Moved/)

  // Over the studio's sidebar: nothing to land on, said by what is carried, and nothing moves.
  const settled = await rowIds(page)
  await drag(
    page,
    await middle(row(page, 'text')),
    async () => ({ x: 120, y: 400 }),
    async () => {
      await expect.poll(() => preview.getAttribute('data-drag-place')).toBe('nowhere')
      expect(await page.locator('[data-builder-drop]').count()).toBe(0)
      await shot(page, 'nowhere')
    },
  )
  expect(await rowIds(page)).toEqual(settled)
  await expect.poll(() => announced(page)).toMatch(/Not moved/)
  expect(errors).toEqual([])
  await context.close()
})

const phone = async (browser: Browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: scheme,
  })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await openPage(page)
  // The studio draws its page's history row late and moves the panels down by its height.
  await page.waitForTimeout(1500)
  // The palette shows first; the page is under it, reached by scrolling, as a thumb would.
  await page.locator('[data-builder-canvas]').scrollIntoViewIfNeeded()
  return { context, page, errors }
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('at 390px the selected node has a finger-sized grip whose commands work and are announced', async () => {
  const { context, page, errors } = await phone(browser)
  await page.locator('[data-composition-node="text"] > *').first().tap()
  const grip = page.locator('[data-builder-handle]')
  const box = (await grip.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  // The commands are closed until the grip opens them.
  const menu = page.locator('[role="group"][popover]')
  expect(await menu.isVisible()).toBe(false)
  await grip.tap()
  const items = menu.getByRole('button')
  await expect.poll(() => items.count()).toBeGreaterThan(5)
  expect(await menu.isVisible()).toBe(true)
  for (const item of await items.all())
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const before = await rowIds(page)
  await menu.getByRole('button', { name: 'Duplicate' }).tap()
  await expect.poll(async () => (await rowIds(page)).length).toBe(before.length + 1)
  await expect.poll(() => announced(page)).toMatch(/Duplicated|Added/)
  expect(await sideways(page)).toBe(true)
  expect(errors).toEqual([])
  await context.close()
})

test('at 390px a held finger on the grip drags the node: the preview is above the finger, a place is marked, and it lands', async () => {
  const { context, page, errors } = await phone(browser)
  const node = (id: string) => page.locator(`[data-composition-node="${id}"] > *`).first()
  await node('text').tap()
  const grip = page.locator('[data-builder-handle]')
  // The grip is placed over the node from where the node is measured, a frame or two after the
  // tap. A node scrolled to the top edge has its grip under the studio's sticky header: bring the
  // grip to under the header with the nodes below it on screen, where a thumb has it.
  await page.waitForTimeout(400)
  await grip.evaluate(each => window.scrollBy(0, each.getBoundingClientRect().top - 150))
  await page.waitForTimeout(200)
  const from = await middle(grip)
  const session = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', at: Point) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: at.x, y: at.y, id: 1 }],
    })
  const before = await rowIds(page)
  await touch('touchStart', from)
  // Held still until the hold is up: the drag starts, with nothing under the finger yet.
  await page.waitForTimeout(600)
  const preview = page.locator('[data-drag-source]')
  await expect.poll(() => preview.count()).toBe(1)
  let to = await within(node('image'), 0.9)
  for (let step = 1; step <= 12; step++) {
    to = await within(node('image'), 0.9)
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * step) / 12,
      y: from.y + ((to.y - from.y) * step) / 12,
    })
    await page.waitForTimeout(35)
  }
  await page.waitForTimeout(200)
  await expect
    .poll(() =>
      page.locator('[data-composition-drop="after"]').getAttribute('data-composition-node'),
    )
    .toBe('image')
  expect(await preview.getAttribute('data-drag-place')).toBe('here')
  // Lifted above the finger, not under it.
  const lifted = (await preview.boundingBox())!
  expect(lifted.y + lifted.height).toBeLessThanOrEqual(to.y)
  expect(await sideways(page)).toBe(true)
  await shot(page, 'phone-drag')
  await touch('touchEnd', to)
  await expect
    .poll(async () => (await rowIds(page)).indexOf('text'))
    .toBeGreaterThan(before.indexOf('text'))
  expect(await page.locator('[data-drag-source]').count()).toBe(0)
  await expect.poll(() => announced(page)).toMatch(/Moved/)
  expect(errors).toEqual([])
  await context.close()
})

test('at 390px the page editor does not scroll sideways, and its panels are reachable', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await openPage(page)
  // The layout viewport: a phone zooms out to fit a page that overflows, so `innerWidth` would lie.
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scroll).toBeLessThanOrEqual(client)
  for (const name of ['Add', 'Layers', 'Settings'])
    expect(await page.getByRole('button', { name, exact: true }).isVisible()).toBe(true)
  await context.close()
})
