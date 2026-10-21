/// <reference types="@vitest/browser-playwright" />
/**
 * A hover is a film of the state ink, measured on a real page. On a bold
 * error band, a hovered action films the band's own fill, so the film has
 * the error hue at the fill's chroma (filming the pale on-fill text read as
 * grey). On a subtle band it films the band's ink, which shows on the tint.
 * A neutral ghost button on a bold band films the theme's ink, not the
 * band's; with `surface.hover: 'accent'`, that is the accent's ink.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Schema } from 'effect'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Alert, AlertSlots, Button, ButtonSlots, Recipes } from '../src/index.js'
import { force, nodeOf } from './pseudoState.js'

type Message = { readonly _tag: 'Dismissed' }

const themeOf = (hover?: 'accent') =>
  Theme.standard(
    Theme.make({
      accent: { hue: 265, chroma: 0.16 },
      surface: hover === undefined ? {} : { hover },
    }),
  )
const alertOf = (emphasis: 'subtle' | 'bold') =>
  Style.forSlots(AlertSlots)(Recipes.Alert({ tone: 'error', emphasis }))
const ghost = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'ghost' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (
  scheme: 'light' | 'dark',
  css: string,
  view: (h: HtmlBuilder<Message>) => Html,
  hover?: 'accent',
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('tokens', Theme.root(Theme.tokens, { colorScheme: scheme })),
      Layers.standard.in(
        'theme',
        Theme.root(themeOf(hover), { omit: Theme.tokens, colorScheme: scheme }),
      ),
    ) + css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'state-ink-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: { readonly [key: string]: never }) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Message>) => view(h),
    }),
  )
}

const mountAlert = (scheme: 'light' | 'dark', emphasis: 'subtle' | 'bold') => {
  const style = alertOf(emphasis)
  return mount(scheme, style.css, h =>
    Alert.view(
      {
        layout: 'banner',
        label: 'Outage',
        title: 'The API is down.',
        actions: [{ label: 'Status', href: '#status' }],
        onDismiss: { _tag: 'Dismissed' },
        style,
      },
      h,
    ),
  )
}

/** Lightness (0–100), chroma, hue and alpha of a computed `oklab()` or `oklch()` color. */
const colorOf = (color: string) => {
  const match = /^(oklab|oklch)\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*(?:\/\s*([\d.]+))?/.exec(
    color,
  )
  if (match === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  const [l, x, y] = [match[2], match[3], match[4]].map(Number) as [number, number, number]
  const alpha = match[5] === undefined ? 1 : Number(match[5])
  return match[1] === 'oklch'
    ? { lightness: l * 100, chroma: x, hue: y, alpha }
    : {
        lightness: l * 100,
        chroma: Math.hypot(x, y),
        hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
        alpha,
      }
}
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

const drawn = (selector: string) =>
  vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>(selector)
    expect(found).not.toBeNull()
    return found!
  })

/** The settled film on `selector` with `:hover` forced on it. */
const filmOf = async (selector: string) => {
  const element = await drawn(selector)
  // Forcing the pseudo state and reading the film race the hover's own
  // 80ms fade: force again until the film reads settled.
  return vi.waitFor(
    async () => {
      await force(await nodeOf(selector), ['hover'])
      expect(element.matches(':hover')).toBe(true)
      const settled = colorOf(getComputedStyle(element).backgroundColor)
      // The film fades in to 12%; mid-fade reads are thinner.
      expect(settled.alpha).toBeGreaterThan(0.11)
      return settled
    },
    { timeout: 10000 },
  )
}

const actions = ['[aria-label="Dismiss Outage"]', 'a']

// The error fill the bold band paints, per scheme: lightness 60/64, chroma
// 0.2, hue 25. The film is the fill at 12%, so it agrees on all three.
test.each([
  ['light', 60],
  ['dark', 64],
] as const)(
  'in a %s scheme, a bold band hovers in its own fill, not in its pale text',
  async (scheme, lightness) => {
    const handle = mountAlert(scheme, 'bold')
    try {
      for (const selector of actions) {
        const film = await filmOf(selector)
        expect(distance(film.hue, 25), selector).toBeLessThan(6)
        expect(film.chroma, selector).toBeGreaterThan(0.15)
        expect(Math.abs(film.lightness - lightness), selector).toBeLessThan(4)
      }
    } finally {
      handle.dispose()
    }
  },
)

// Filmed in its own tint, a subtle band's hover composites to the band: no
// hover at all. Filmed in its ink, it is far from the tint in lightness.
test.each(['light', 'dark'] as const)(
  'in a %s scheme, a subtle band hovers in its ink, which shows on the tint',
  async scheme => {
    const handle = mountAlert(scheme, 'subtle')
    try {
      const band = colorOf(getComputedStyle(await drawn('[data-layout="banner"]')).backgroundColor)
      for (const selector of actions) {
        const film = await filmOf(selector)
        expect(Math.abs(film.lightness - band.lightness), selector).toBeGreaterThan(25)
        expect(distance(film.hue, 25), selector).toBeLessThan(15)
      }
    } finally {
      handle.dispose()
    }
  },
)

// The neutral tone names the theme's ink back, so `surface.hover: 'accent'`
// reaches it: the film has the accent's hue at a chroma the grey text has not.
test.each(['light', 'dark'] as const)(
  'in a %s scheme with accent state hues, a neutral ghost button hovers in the accent',
  async scheme => {
    const handle = mount(
      scheme,
      ghost.css,
      h => Button.view({ label: 'Edit', style: ghost }, h),
      'accent',
    )
    try {
      const film = await filmOf('button')
      expect(distance(film.hue, 265)).toBeLessThan(10)
      expect(film.chroma).toBeGreaterThan(0.08)
    } finally {
      handle.dispose()
    }
  },
)

// The band names its fill for its own actions; a neutral control drawn on it
// names the theme's ink back, or it would film the band's red.
test('on a bold band, a neutral ghost button hovers in the text, not in the band', async () => {
  const band = alertOf('bold')
  const handle = mount('light', band.css + ghost.css, h => {
    const slots = SlotView.buildersFor(AlertSlots, [band.mixin], { input: undefined, h })
    return h.div(slots.root.attrs([]), [Button.view({ label: 'Edit', style: ghost }, h)])
  })
  try {
    const film = await filmOf('button')
    expect(film.chroma).toBeLessThan(0.05)
  } finally {
    handle.dispose()
  }
})
