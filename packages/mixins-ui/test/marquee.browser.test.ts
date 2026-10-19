/**
 * The marquee in a real browser: it measures its content and fills the
 * viewport with copies that meet without a seam, moves toward the start (the
 * right one right to left, up when vertical) at the speed asked, holds under
 * a pointer, under focus and by its pause press, and stands still, the
 * viewport scrolling over one copy, under reduced motion and with the
 * `motion` knob at 0.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import * as Marquee from '../src/marquee.js'
import { MarqueeSlots } from '../src/marquee.js'
import { Marquee as Recipe } from '../src/recipes/marquee.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(MarqueeSlots)(Recipe({}))

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

interface Options {
  readonly dir?: 'rtl'
  readonly side?: Marquee.MarqueeSide
  readonly speed?: number
  /** Set on the marquee's wrapper, as a theme would. */
  readonly knobs?: Readonly<Record<string, string>>
  /** The height of a box drawn around the marquee. */
  readonly within?: string
}

const mount = (options: Options = {}) => {
  if (options.dir !== undefined) document.documentElement.dir = options.dir
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'marquee-browser'
  document.body.append(container)
  const items = (h: HtmlBuilder<Marquee.Message>): ReadonlyArray<Html> =>
    ['Acme', 'Globex', 'Initech'].map(name =>
      h.a([h.Href('#'), h.Style({ display: 'block', inlineSize: '60px' })], [name]),
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model: Marquee.Model,
      container,
      init: () => ({ model: Marquee.init({ id: 'logos' }) }),
      update: Marquee.update,
      view: (model: Marquee.Model, h: HtmlBuilder<Marquee.Message>) =>
        h.div(
          [h.Style({ inlineSize: '600px', padding: '1rem', ...options.knobs })],
          [
            h.div([h.Id('away'), h.Style({ blockSize: '40px' })], []),
            h.div(
              [
                h.Id('box'),
                h.Style(options.within === undefined ? {} : { blockSize: options.within }),
              ],
              [
                Marquee.view(
                  {
                    model,
                    label: 'Customers',
                    items: items(h),
                    side: options.side,
                    speed: options.speed ?? 100,
                    onMessage: m => m,
                    style,
                  },
                  h,
                ),
              ],
            ),
          ],
        ),
    }),
  )
}

const region = () => document.querySelector<HTMLElement>('[aria-roledescription="marquee"]')
const copies = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[aria-roledescription] > div > div'))
const viewport = () => document.querySelector<HTMLElement>('[aria-roledescription] > div')!
const first = () => copies()[0]!
const box = (element: Element) => element.getBoundingClientRect()
const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/** Where the first copy is along the way it moves, in pixels. */
const offset = (axis: 'x' | 'y' = 'x') => (axis === 'x' ? box(first()).left : box(first()).top)
const park = () => userEvent.hover(document.getElementById('away')!)

/** Ready once measured: the viewport filled with copies, timed by the length. */
const ready = () =>
  vi.waitFor(() => {
    expect(region()).not.toBeNull()
    expect(region()!.style.getPropertyValue('--fk-marquee-duration')).not.toBe('')
  })

test('fills the viewport with copies that meet without a seam, timed by the length and speed', async () => {
  const handle = mount({ speed: 100 })
  try {
    await ready()
    const [one, two] = copies()
    const length = box(one!).width
    // Each copy: three 60px items, and the spacing after each.
    expect(copies().length).toBe(Math.ceil(box(region()!).width / length) + 1)
    expect(box(two!).left - box(one!).left).toBeCloseTo(length, 0)
    const gaps = Array.from(one!.children).map(item => box(item))
    expect(box(two!).left - gaps[2]!.right).toBeCloseTo(gaps[1]!.left - gaps[0]!.right, 0)
    expect(Number.parseFloat(getComputedStyle(one!).animationDuration)).toBeCloseTo(length / 100, 2)
  } finally {
    handle.dispose()
  }
})

test.each([
  [{}, 'x', -1],
  [{ dir: 'rtl' }, 'x', 1],
  [{ side: 'end' }, 'x', 1],
  [{ side: 'top' }, 'y', -1],
] as const)('moves the way asked (%j)', async (options, axis, sign) => {
  const handle = mount(options)
  try {
    await ready()
    await park()
    const from = offset(axis)
    await later(300)
    const moved = offset(axis) - from
    expect(Math.sign(moved)).toBe(sign)
    expect(Math.abs(moved)).toBeGreaterThan(5)
  } finally {
    handle.dispose()
  }
})

test('holds under a pointer, under focus, and by its pause press', async () => {
  const handle = mount()
  try {
    await ready()
    const playState = () => getComputedStyle(first()).animationPlayState
    await park()
    expect(playState()).toBe('running')
    // The region, not a copy: a copy never stands still for the pointer to land on.
    await userEvent.hover(region()!)
    await vi.waitFor(() => expect(playState()).toBe('paused'))
    await park()
    await vi.waitFor(() => expect(playState()).toBe('running'))
    first().querySelector('a')!.focus()
    await vi.waitFor(() => expect(playState()).toBe('paused'))
    const pause = document.querySelector<HTMLButtonElement>('button')!
    expect(pause.getAttribute('aria-label')).toBe('Pause')
    await userEvent.click(pause)
    await vi.waitFor(() => expect(pause.getAttribute('aria-label')).toBe('Play'))
    pause.blur()
    await park()
    expect(playState()).toBe('paused')
    const still = offset()
    await later(200)
    expect(offset()).toBe(still)
  } finally {
    handle.dispose()
  }
})

test('stands still under reduced motion, the viewport scrolling over one copy', async () => {
  await reduce('reduce')
  const handle = mount()
  try {
    await ready()
    await park()
    const shown = copies().filter(copy => getComputedStyle(copy).display !== 'none')
    expect(shown).toEqual([first()])
    expect(getComputedStyle(first().parentElement!).overflowX).toBe('auto')
    const from = offset()
    await later(200)
    expect(offset()).toBe(from)
  } finally {
    handle.dispose()
  }
})

test.each([['motion'], ['travel']])('stands still with the %s knob at 0', async knob => {
  const handle = mount({ knobs: { [`--fk-knob-${knob}`]: '0' } })
  try {
    await ready()
    await park()
    const from = offset()
    await later(200)
    expect(offset()).toBe(from)
    expect(box(first()).left).toBeCloseTo(box(first().parentElement!).left, 0)
  } finally {
    handle.dispose()
  }
})

test('a vertical marquee is measured and timed down its height', async () => {
  const handle = mount({ side: 'top', speed: 100 })
  try {
    await ready()
    const length = box(first()).height
    expect(Number.parseFloat(getComputedStyle(first()).animationDuration)).toBeCloseTo(
      length / 100,
      2,
    )
  } finally {
    handle.dispose()
  }
})

test.each([
  ['a box of its container', '100px', 100],
  ['its own height in a box of none', undefined, 256],
] as const)('a vertical marquee scrolls within %s', async (_, within, height) => {
  const handle = mount({ side: 'top', within })
  try {
    await ready()
    expect(box(region()!).height).toBeCloseTo(height, 0)
    expect(box(viewport()).height).toBeCloseTo(height, 0)
    expect(box(region()!).bottom).toBeCloseTo(box(document.getElementById('box')!).bottom, 0)
    expect(getComputedStyle(viewport()).overflow).toBe('hidden')
  } finally {
    handle.dispose()
  }
})
