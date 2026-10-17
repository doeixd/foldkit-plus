/// <reference types="@vitest/browser-playwright" />
/**
 * Spinners in a real browser over the shipped palette: each kind draws with
 * the parts it says (a ring's sides, three dots or bars in turn, a disc, one
 * dot on its track); the movement takes a travel's time, so no travel holds
 * it; reduced motion holds it; sizes and tones apply; the accent reads on both schemes' pages; and words beside it sit on
 * the wheel's line.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { Recipes, Spinner, SpinnerSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const Model = Schema.Struct({})
const kinds = ['ring', 'dots', 'bars', 'pulse', 'orbit'] as const
const styles = Object.fromEntries(
  kinds.map(kind => [kind, Style.forSlots(SpinnerSlots)(Recipes.Spinner({ kind }))]),
)
const large = Style.forSlots(SpinnerSlots)(Recipes.Spinner({ size: 'lg', tone: 'current' }))

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1rem', padding: '16px', justifyItems: 'start' })],
    [
      ...kinds.map(kind => Spinner.view({ label: kind, style: styles[kind] }, h)),
      h.div(
        [h.Id('held'), h.Attribute('style', '--fk-knob-travel: 0')],
        [Spinner.view({ label: 'held', style: styles['ring'] }, h)],
      ),
      h.div(
        [h.Style({ color: 'rgb(200, 0, 0)' })],
        [Spinner.view({ label: 'large', style: large }, h)],
      ),
      Spinner.view({ label: 'Saving', showLabel: true, style: styles['ring'] }, h),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      L.declare,
      L.in('reset', Defaults.reset),
      L.in('theme', Theme.root(theme, { colorScheme: scheme })),
    ) +
    Object.values(styles)
      .map(style => style.css)
      .join('') +
    large.css
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `spinner-${scheme}`
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(wheel('large')).not.toBeNull())
  return handle
}

const wheel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
const parts = (label: string) =>
  Array.from(wheel(label).querySelectorAll<HTMLElement>(':scope > *'))
const shown = (element: Element) => getComputedStyle(element).display !== 'none'
const box = (element: Element) => element.getBoundingClientRect()

test('each kind draws with the parts it says', async () => {
  const handle = await mount('light')
  try {
    const ring = getComputedStyle(wheel('ring'))
    expect(ring.borderTopColor).not.toBe(ring.borderBottomColor)
    expect(parts('ring').some(shown)).toBe(false)
    for (const kind of ['dots', 'bars'] as const) {
      const [a, b, c] = parts(kind)
      expect(
        [a, b, c].every(part => shown(part!)),
        kind,
      ).toBe(true)
      expect(box(b!).left, kind).toBeGreaterThan(box(a!).right)
      expect(box(c!).left, kind).toBeGreaterThan(box(b!).right)
      // In turn: each a different way through the cycle.
      const delays = new Set([a, b, c].map(part => getComputedStyle(part!).animationDelay))
      expect(delays.size, kind).toBe(3)
    }
    // Its own height, not the frame of the moment its scale draws.
    expect(parts('bars')[0]!.offsetHeight).toBe(24)
    expect(getComputedStyle(wheel('pulse')).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(parts('pulse').some(shown)).toBe(false)
    const [dot, ...rest] = parts('orbit')
    expect(rest.some(shown)).toBe(false)
    const [track, mark] = [box(wheel('orbit')), box(dot!)]
    // Centred on the track at the top, in the middle of its 2px line.
    expect(Math.abs(mark.left + mark.width / 2 - (track.left + track.width / 2))).toBeLessThan(0.5)
    expect(Math.abs(mark.top + mark.height / 2 - (track.top + 1))).toBeLessThan(0.5)
  } finally {
    handle.dispose()
  }
})

test('the movement takes a travel’s time, and none with no travel', async () => {
  const handle = await mount('light')
  try {
    expect(parseFloat(getComputedStyle(wheel('ring')).animationDuration)).toBeGreaterThan(0.5)
    expect(parseFloat(getComputedStyle(wheel('held')).animationDuration)).toBe(0)
  } finally {
    handle.dispose()
  }
})

test('under reduced motion every kind holds still', async () => {
  await reduce('reduce')
  const handle = await mount('light')
  try {
    for (const kind of kinds) {
      expect(getComputedStyle(wheel(kind)).animationName, kind).toBe('none')
      for (const part of parts(kind))
        expect(getComputedStyle(part).animationName, kind).toBe('none')
    }
  } finally {
    handle.dispose()
  }
})

test('a size and a tone apply, and words beside it sit on its line', async () => {
  const handle = await mount('light')
  try {
    expect([box(wheel('large')).width, box(wheel('large')).height]).toEqual([32, 32])
    expect(getComputedStyle(wheel('large')).borderTopColor).toBe('rgb(200, 0, 0)')
    const status = document.querySelector('[role="status"]:not([aria-label])')!
    const [mark, words] = Array.from(status.children).map(box)
    expect(words!.left).toBeGreaterThan(mark!.right)
    expect(Math.abs(words!.top + words!.height / 2 - (mark!.top + mark!.height / 2))).toBeLessThan(
      1,
    )
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the accent reads on the page',
  async scheme => {
    const handle = await mount(scheme)
    try {
      const lightnessOf = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])
      const page = lightnessOf(getComputedStyle(document.body).backgroundColor)
      expect(
        Math.abs(lightnessOf(getComputedStyle(wheel('ring')).borderTopColor) - page),
      ).toBeGreaterThan(0.2)
    } finally {
      handle.dispose()
    }
  },
)
