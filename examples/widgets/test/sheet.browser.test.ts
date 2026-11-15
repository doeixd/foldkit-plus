/**
 * The sheet section in a real browser: the opener's Enter opens it with focus
 * on the handle, whose arrows, Home and End move the sheet between its three
 * points and the text names the point; Escape closes it and focus goes back
 * to the opener; a drag lets go on the nearest point, a flick of a few pixels
 * goes on to the next, and a long drag down takes it away. The drags are
 * synthetic pointer events on the handle, as the Sheet's own browser tests
 * send them: nothing here moves the page's one real pointer.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/sheet/app.js'
import { island } from '../src/sheet/island.js'
import { OPENER_ID, SNAP_ID, SheetIsland } from '../src/sheet/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(island.style())
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'sheet'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: SheetIsland,
    }),
  ).dispose
}

const opener = () => document.getElementById(OPENER_ID)!
const panel = () => document.getElementById('sheet-sheet-panel')
const handle = () => panel()?.querySelector<HTMLElement>('[role="separator"]') ?? null
const said = () => document.getElementById(SNAP_ID)?.textContent?.split(' of the sheet')[0]
const status = () => document.querySelector('p[aria-live="polite"]')?.textContent

const SLOW = { timeout: 5000 }

/** Open and still: drawn, entered, and no longer sliding. */
const opened = async (open: () => Promise<void>) => {
  mount()
  await vi.waitFor(() => expect(opener()).not.toBeNull())
  await open()
  const drawn = await vi.waitFor(() => {
    const found = panel()
    expect(found).not.toBeNull()
    expect(found!.hasAttribute('data-closed')).toBe(false)
    return found!
  }, SLOW)
  await vi.waitFor(() => expect(drawn.getAnimations()).toEqual([]), SLOW)
  return drawn
}

/** How much of the panel shows, from the bottom of the window. */
const shown = (element: HTMLElement) => window.innerHeight - element.getBoundingClientRect().top

/** The panel is `md`'s 80% of the window tall, so a point is that share of 80%. */
const near = (element: HTMLElement, point: number) =>
  expect(Math.abs(shown(element) - window.innerHeight * 0.8 * point)).toBeLessThan(4)

test('Enter on the opener opens it on the handle, and the handle’s keys move it between points', async () => {
  const sheet = await opened(async () => {
    opener().focus()
    await userEvent.keyboard('{Enter}')
  })
  await vi.waitFor(() => expect(document.activeElement).toBe(handle()))
  expect(handle()?.getAttribute('aria-valuenow')).toBe('30')
  expect(said()).toBe('30%')
  expect(status()).toBe('Sheet open, 30% shown')
  near(sheet, 0.3)

  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() => expect(said()).toBe('60%'))
  expect(handle()?.getAttribute('aria-valuenow')).toBe('60')
  expect(status()).toBe('Sheet open, 60% shown')
  await vi.waitFor(() => near(sheet, 0.6), SLOW)

  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(said()).toBe('100%'))
  await vi.waitFor(() => near(sheet, 1), SLOW)
  // The ends stop it.
  await userEvent.keyboard('{ArrowUp}')
  expect(said()).toBe('100%')

  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(said()).toBe('60%'))
  await userEvent.keyboard('{Home}')
  await vi.waitFor(() => expect(said()).toBe('30%'))
  await vi.waitFor(() => near(sheet, 0.3), SLOW)
  expect(document.activeElement).toBe(handle())
})

test('Escape closes it and focus goes back to the opener', async () => {
  await opened(async () => {
    opener().focus()
    await userEvent.keyboard('{Enter}')
  })
  await vi.waitFor(() => expect(document.activeElement).toBe(handle()))
  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() => expect(said()).toBe('60%'))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(panel()).toBeNull(), SLOW)
  expect(status()).toBe('Sheet closed')
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()))
})

/** A touch pointer event `dy` pixels below the handle's middle. */
const touchOn = (grabber: HTMLElement) => {
  const box = grabber.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  return (type: string, dy: number) =>
    grabber.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 7,
        button: 0,
        pointerType: 'touch',
        clientX: x,
        clientY: y + dy,
      }),
    )
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Presses the handle, moves `by` pixels down in slow steps, rests, and lets go: no speed to read. */
const drag = async (grabber: HTMLElement, by: number) => {
  const at = touchOn(grabber)
  at('pointerdown', 0)
  for (let step = 1; step <= 8; step++) {
    await wait(16)
    at('pointermove', (by * step) / 8)
  }
  await wait(160)
  at('pointerup', by)
}

/**
 * The speed is read from the events' times over the last 100ms, so the waits
 * spin: a loaded machine stretched a `setTimeout(1)` past that window.
 */
const flick = (grabber: HTMLElement, by: number) => {
  const at = touchOn(grabber)
  const spin = (ms: number) => {
    const until = performance.now() + ms
    while (performance.now() < until) {}
  }
  at('pointerdown', 0)
  spin(4)
  at('pointermove', by / 2)
  spin(4)
  at('pointermove', by)
  at('pointerup', by)
}

const withHandle = () => {
  const found = handle()
  expect(found).not.toBeNull()
  return found!
}

test('a slow drag lets go on the nearest point, not where it was released', async () => {
  const sheet = await opened(() => userEvent.click(opener()))
  const full = sheet.getBoundingClientRect().height
  // Up a quarter of the panel: 0.45 of it is hidden, nearer 60% (0.4) than 30% (0.7).
  await drag(withHandle(), -0.25 * full)
  await vi.waitFor(() => expect(said()).toBe('60%'))
  await vi.waitFor(() => expect(sheet.hasAttribute('data-dragging')).toBe(false))
  await vi.waitFor(() => near(sheet, 0.6), SLOW)
  expect(handle()?.getAttribute('aria-valuenow')).toBe('60')
})

test('a flick of a few pixels goes on to the next point', async () => {
  const sheet = await opened(() => userEvent.click(opener()))
  flick(withHandle(), -40)
  await vi.waitFor(() => expect(said()).toBe('60%'))
  await vi.waitFor(() => near(sheet, 0.6), SLOW)
})

test('a drag too short to leave the lowest point comes back to it', async () => {
  const sheet = await opened(() => userEvent.click(opener()))
  await drag(withHandle(), 0.04 * sheet.getBoundingClientRect().height)
  await vi.waitFor(() => expect(sheet.hasAttribute('data-dragging')).toBe(false))
  expect(said()).toBe('30%')
  await vi.waitFor(() => near(sheet, 0.3), SLOW)
})

test('a long drag down closes it', async () => {
  const sheet = await opened(() => userEvent.click(opener()))
  await drag(withHandle(), 0.5 * sheet.getBoundingClientRect().height)
  await vi.waitFor(() => expect(panel()).toBeNull(), SLOW)
  expect(status()).toBe('Sheet closed')
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()))
})
