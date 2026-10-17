/**
 * The Sheet on a real page: the open panel spans the edge it comes from,
 * bordered only on the side facing the page, its handle on that side; a drag
 * on the handle moves it with the pointer, a slow release past a quarter or a
 * flick takes it away and a shorter one brings it back; it rests at its
 * points, a press on the handle steps to the next, and a drag past fully
 * open gives only a little; under reduced motion it does not slide; and the
 * page behind steps back while it is open.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style, SlotView } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
// Not the index: a test loads only what it tests.
import { DialogSlots } from '../src/dialog.js'
import { Sheet as SheetRecipe, sheetPage } from '../src/recipes/sheet.js'
import * as Sheet from '../src/sheet.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
/** The application's page, which `sheetPage` steps back. */
const page = Style.slots({ page: sheetPage })

afterEach(async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

type Selection = Parameters<typeof SheetRecipe>[0]

/** An open Sheet of `config`, styled by the recipe's `selection`, with `lines` paragraphs in its panel. */
const open = async (
  config: Omit<Sheet.InitConfig, 'id'>,
  selection: Selection = {},
  options: {
    readonly lines?: number
    readonly scalesPage?: boolean
    readonly covered?: boolean
  } = {},
) => {
  const style = Style.forSlots(DialogSlots)(SheetRecipe(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css +
    page.style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'sheet-browser'
  document.body.appendChild(container)
  const view = (model: Sheet.Model, h: HtmlBuilder<Sheet.Message>) =>
    h.div(
      [],
      [
        // Beside the sheet, not around it: a scaled page would hold the
        // fixed dialog in its own box.
        h.div(
          SlotView.buildersFor(page.slots, [page.style.mixin], { input: undefined, h }).page.attrs([
            h.Id('page'),
          ]),
          [h.p([], ['The page.'])],
        ),
        Sheet.view(
          {
            model,
            onMessage: message => message,
            mixins: [style.mixin],
            scalesPage: options.scalesPage ?? false,
            covered: options.covered ?? false,
            draw: dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.div(dialog.handle),
                        h.h2(dialog.title, ['Filters']),
                        ...Array.from({ length: options.lines ?? 1 }, () =>
                          h.p([], ['Only what is in stock, nearest first.']),
                        ),
                      ]),
                    ]
                  : [],
              ),
          },
          h,
        ),
      ],
    )
  const opened = Sheet.open(Sheet.init({ id: 'edge', ...config }))
  // Releases the Sheet has handled, for a test to know its drag has landed.
  let releases = 0
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Sheet.Model,
      container,
      init: () => ({ model: opened.model, commands: opened.commands ?? [] }),
      update: (model: Sheet.Model, message: Sheet.Message) => {
        if (message._tag === 'Released') releases++
        const next = Sheet.update(model, message)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view,
    }),
  )
  const panel = await vi.waitFor(() => {
    const found = document.getElementById('edge-panel')
    expect(found).not.toBeNull()
    // Entered: drawn closed first, then let slide in.
    expect(found!.hasAttribute('data-closed')).toBe(false)
    return found!
  })
  await settled(panel)
  const grabber = panel.firstElementChild as HTMLElement
  // The handle's Swipe listens once its Mount has run, which a loaded machine
  // can leave until after the panel is drawn, and a press sent before is lost:
  // press until the drag shows, then cancel it, which moves nothing.
  const at = touchOn(grabber)
  // CI's runners have taken over the default second to start it.
  const startup = { timeout: 10_000 }
  await vi.waitFor(() => {
    at('pointerdown', 0)
    expect(panel.hasAttribute('data-dragging')).toBe(true)
  }, startup)
  at('pointercancel', 0)
  await vi.waitFor(() => expect(panel.hasAttribute('data-dragging')).toBe(false), startup)
  await settled(panel)
  return { panel, grabber, releases: () => releases, dispose: () => handle.dispose() }
}

/** Once nothing on the panel is still moving. */
const settled = (element: Element) =>
  vi.waitFor(() => expect(element.getAnimations({ subtree: false })).toEqual([]))

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Sends a touch pointer event `dy` pixels below the handle's middle. */
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

/**
 * Flicks the handle `by` pixels down in 8ms. The speed is read from the
 * events' times over the last 100ms, so the waits between them spin rather
 * than sleep: a loaded CI machine stretched even a 1ms `setTimeout` past
 * that window, and the flick read as a rest.
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

/**
 * Presses the handle at its middle, moves it `by` pixels down in `steps`
 * moves `pause` milliseconds apart, rests `rest`, and lets go.
 */
const drag = async (
  grabber: HTMLElement,
  by: number,
  { steps = 8, pause = 16, rest = 0 }: { steps?: number; pause?: number; rest?: number } = {},
) => {
  const at = touchOn(grabber)
  at('pointerdown', 0)
  for (let step = 1; step <= steps; step++) {
    if (pause > 0) await wait(pause)
    at('pointermove', (by * step) / steps)
  }
  if (rest > 0) await wait(rest)
  at('pointerup', by)
}

test('a right sheet spans the right edge, bordered on its left, its handle standing there', async () => {
  const { panel, grabber, dispose } = await open({ side: 'right' })
  try {
    const box = panel.getBoundingClientRect()
    expect(Math.abs(box.right - document.documentElement.clientWidth)).toBeLessThan(1)
    expect(box.top).toBeLessThan(1)
    expect(Math.abs(box.bottom - window.innerHeight)).toBeLessThan(1)
    // `min(24rem, 75%)` at 1440px, its padding and border inside it.
    expect(box.width).toBeCloseTo(384, 0)
    const look = getComputedStyle(panel)
    expect(look.borderLeftWidth).toBe('1px')
    expect(look.borderTopWidth).toBe('0px')
    expect(grabber.getAttribute('aria-hidden')).toBe('true')
    const bar = grabber.getBoundingClientRect()
    expect(bar.width).toBeCloseTo(6, 0)
    expect(bar.height).toBeCloseTo(100, 0)
    expect(bar.left - box.left).toBeLessThan(box.width / 4)
    expect(Math.abs(bar.top + bar.height / 2 - (box.top + box.height / 2))).toBeLessThan(1)
  } finally {
    dispose()
  }
})

test('without a bar the handle is hidden and the corners square', async () => {
  const { panel, grabber, dispose } = await open({ side: 'bottom' }, { handle: 'none' })
  try {
    expect(getComputedStyle(grabber).display).toBe('none')
    expect(getComputedStyle(panel).borderTopLeftRadius).toBe('0px')
  } finally {
    dispose()
  }
})

test('a bottom sheet rounds its top corners, its handle centred above the title', async () => {
  const { panel, grabber, dispose } = await open({ side: 'bottom' })
  try {
    const box = panel.getBoundingClientRect()
    expect(Math.abs(box.bottom - window.innerHeight)).toBeLessThan(1)
    expect(box.left).toBeLessThan(1)
    const look = getComputedStyle(panel)
    expect(look.borderTopWidth).toBe('1px')
    expect(look.borderTopLeftRadius).not.toBe('0px')
    expect(look.borderBottomLeftRadius).toBe('0px')
    const bar = grabber.getBoundingClientRect()
    expect(bar.height).toBeCloseTo(6, 0)
    expect(bar.width).toBeCloseTo(100, 0)
    expect(Math.abs(bar.left + bar.width / 2 - (box.left + box.width / 2))).toBeLessThan(1)
    expect(bar.bottom).toBeLessThanOrEqual(panel.querySelector('h2')!.getBoundingClientRect().top)
    // A thumb a little off the 6px bar still lands on the handle.
    expect(document.elementFromPoint(bar.left + 4, bar.top - 8)).toBe(grabber)
  } finally {
    dispose()
  }
})

test('a top sheet draws its handle below the title', async () => {
  const { panel, grabber, dispose } = await open({ side: 'top' })
  try {
    const title = panel.querySelector('h2')!.getBoundingClientRect()
    expect(grabber.getBoundingClientRect().top).toBeGreaterThanOrEqual(title.bottom)
  } finally {
    dispose()
  }
})

test('the panel follows a drag on its handle, then comes back from a short slow one', async () => {
  const { panel, grabber, dispose } = await open(
    { side: 'bottom', isAnimated: false },
    {},
    { lines: 8 },
  )
  try {
    const top = panel.getBoundingClientRect().top
    const height = panel.getBoundingClientRect().height
    const box = grabber.getBoundingClientRect()
    const press = (type: string, dy: number) =>
      grabber.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          button: 0,
          clientX: box.left + box.width / 2,
          clientY: box.top + dy,
        }),
      )
    press('pointerdown', 0)
    press('pointermove', 30)
    await vi.waitFor(() => expect(panel.getBoundingClientRect().top - top).toBeCloseTo(30, 0))
    // Under a quarter of its height, let go after resting: it comes back.
    press('pointermove', height * 0.2)
    await wait(160)
    press('pointerup', height * 0.2)
    await vi.waitFor(() => expect(panel.hasAttribute('data-dragging')).toBe(false))
    await settled(panel)
    expect(panel.getBoundingClientRect().top).toBeCloseTo(top, 0)
    expect(document.getElementById('edge-panel')).not.toBeNull()
  } finally {
    dispose()
  }
})

test('a slow drag past a quarter of the panel takes it away', async () => {
  const { panel, grabber, dispose } = await open(
    { side: 'bottom', isAnimated: false },
    {},
    { lines: 8 },
  )
  try {
    await drag(grabber, panel.getBoundingClientRect().height * 0.4, { rest: 160 })
    await vi.waitFor(() => expect(document.getElementById('edge-panel')).toBeNull())
  } finally {
    dispose()
  }
})

test('a flick takes it away though it moved only a little', async () => {
  const { grabber, dispose } = await open({ side: 'bottom', isAnimated: false }, {}, { lines: 8 })
  try {
    flick(grabber, 40)
    await vi.waitFor(() => expect(document.getElementById('edge-panel')).toBeNull())
  } finally {
    dispose()
  }
})

test('a sheet that may not be dismissed comes back from any drag', async () => {
  const { panel, grabber, releases, dispose } = await open(
    { side: 'bottom', isAnimated: false, dismissible: false },
    {},
    { lines: 8 },
  )
  try {
    const before = releases()
    flick(grabber, 60)
    await vi.waitFor(() => expect(releases()).toBe(before + 1))
    // Drawn after the release: a dismissed panel would be gone by now.
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    expect(panel.isConnected).toBe(true)
    expect(document.getElementById('edge-panel')).not.toBeNull()
  } finally {
    dispose()
  }
})

test('with points it opens at the lowest; a press steps up, a flick down rests at the lowest again', async () => {
  const { panel, grabber, dispose } = await open(
    { side: 'bottom', points: [0.5, 1] },
    { size: 'full' },
    // Taller than the viewport, so a full panel fills it: a point is a share of the panel.
    { lines: 80 },
  )
  try {
    const shown = () => window.innerHeight - panel.getBoundingClientRect().top
    expect(shown()).toBeCloseTo(window.innerHeight / 2, 0)
    await drag(grabber, 0, { steps: 1, pause: 0 })
    await vi.waitFor(() => expect(shown()).toBeCloseTo(window.innerHeight, 0))
    flick(grabber, 60)
    // The flick lands within a frame or two, and the panel slides down from full.
    await vi.waitFor(() => expect(shown()).toBeCloseTo(window.innerHeight / 2, 0))
    await settled(panel)
    expect(shown()).toBeCloseTo(window.innerHeight / 2, 0)
  } finally {
    dispose()
  }
})

test('a drag past fully open gives only a little', async () => {
  const { panel, grabber, dispose } = await open(
    { side: 'bottom', isAnimated: false },
    {},
    { lines: 8 },
  )
  try {
    const top = panel.getBoundingClientRect().top
    const box = grabber.getBoundingClientRect()
    const press = (type: string, dy: number) =>
      grabber.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          button: 0,
          clientX: box.left + box.width / 2,
          clientY: box.top + dy,
        }),
      )
    press('pointerdown', 0)
    press('pointermove', -100)
    await vi.waitFor(() => expect(panel.hasAttribute('data-dragging')).toBe(true))
    const lifted = top - panel.getBoundingClientRect().top
    // vaul's damping: 8 * (ln(101) - 2), about 21px.
    expect(lifted).toBeGreaterThan(15)
    expect(lifted).toBeLessThan(30)
    press('pointerup', -100)
  } finally {
    dispose()
  }
})

test('under reduced motion it fades in without sliding', async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const { panel, dispose } = await open({ side: 'bottom' })
  try {
    const look = getComputedStyle(panel)
    const properties = look.transitionProperty.split(', ')
    const durations = look.transitionDuration.split(', ')
    expect(durations[properties.indexOf('translate')]).toBe('0s')
    expect(durations[properties.indexOf('opacity')]).not.toBe('0s')
  } finally {
    dispose()
  }
})

test('the page behind steps back while a sheet that scales it is open', async () => {
  const { dispose } = await open({ side: 'bottom' }, {}, { scalesPage: true })
  try {
    const behind = document.getElementById('page')!
    await vi.waitFor(() => expect(getComputedStyle(behind).scale).toBe('0.95'))
  } finally {
    dispose()
  }
})

test('a sheet that does not scale the page leaves it', async () => {
  const { dispose } = await open({ side: 'bottom' })
  try {
    await wait(50)
    expect(getComputedStyle(document.getElementById('page')!).scale).toBe('none')
  } finally {
    dispose()
  }
})

test('a sheet under one opened from it steps back, smaller and up from its edge', async () => {
  const { panel, dispose } = await open({ side: 'bottom' }, {}, { covered: true })
  try {
    expect(getComputedStyle(panel).scale).toBe('0.95')
    // Up 1rem, and shrunk about its middle: its bottom clears the edge by more.
    expect(window.innerHeight - panel.getBoundingClientRect().bottom).toBeGreaterThan(16)
  } finally {
    dispose()
  }
})
