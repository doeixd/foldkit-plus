/// <reference types="@vitest/browser-playwright" />
/**
 * Toggle buttons on a real page: a button that is on (`aria-pressed="true"`)
 * shows it in every variant, resting, hovered and held, with its text
 * readable on its fill throughout; and a segmented control with several
 * options pressed, a toggle group, fills each of them. Hover and press are
 * forced through Chrome, since the test files share one real pointer.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Button, ButtonSlots, Recipes, Segmented, SegmentedSlots } from '../src/index.js'
import { force, nodeOf } from './pseudoState.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const variants = ['ghost', 'outline', 'icon', 'solid'] as const
const tones = ['accent', 'neutral'] as const
const cases = variants.flatMap(variant =>
  tones.map(tone => ({
    variant,
    tone,
    style: Style.forSlots(ButtonSlots)(Recipes.Button({ variant, tone })),
  })),
)
const segmented = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const Model = Schema.Struct({})
type Message = { readonly _tag: 'Pressed' }
const Pressed: Message = { _tag: 'Pressed' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (scheme: 'light' | 'dark' = 'light') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: scheme })),
    ) +
    cases.map(each => each.style.css).join('') +
    segmented.css +
    // Still, so a forced state reads where it ends rather than mid-fade.
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toggle-buttons'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Id('page'), h.Style({ padding: '40px', background: 'var(--fk-surface-base)' })],
      [
        ...cases.flatMap(({ variant, tone, style }) =>
          [true, false].map(pressed =>
            h.div(
              [h.DataAttribute('case', `${variant} ${tone} ${pressed}`)],
              [Button.view({ label: 'Bold', pressed, style }, h)],
            ),
          ),
        ),
        Segmented.view(
          {
            label: 'Text style',
            options: ['Bold', 'Italic', 'Strike'].map(value => ({ value, label: value })),
            pressed: ['Bold', 'Italic'],
            onPress: () => Pressed,
            style: segmented,
          },
          h,
        ),
        // Somewhere empty, away from the controls, to leave the pointer.
        h.div([h.Id('park'), h.Style({ blockSize: '200px' })], []),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: Message) => ({ model }),
      view,
    }),
  )
}

const drawn = async () => {
  await vi.waitFor(() => expect(document.querySelector('#park')).not.toBeNull())
  await userEvent.hover(document.querySelector('#park')!)
}

const buttonOf = (variant: string, tone: string, pressed: boolean) =>
  document.querySelector<HTMLElement>(`[data-case="${variant} ${tone} ${pressed}"] button`)!

const canvas = document.createElement('canvas')
canvas.width = 1
canvas.height = 1
const paint = canvas.getContext('2d', { willReadFrequently: true })!

/** The sRGB pixel of `layers` painted in order, as the page composites them. */
const pixelOf = (...layers: ReadonlyArray<string>) => {
  paint.clearRect(0, 0, 1, 1)
  for (const layer of layers) {
    paint.fillStyle = layer
    paint.fillRect(0, 0, 1, 1)
  }
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!] as const
}
const luminanceOf = ([r, g, b]: readonly [number, number, number]) => {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
/** WCAG's contrast ratio of two pixels. */
const contrast = (a: readonly [number, number, number], b: readonly [number, number, number]) => {
  const [light, dark] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

type State = ReadonlyArray<'hover' | 'active'>
const states: ReadonlyArray<State> = [[], ['hover'], ['active'], ['hover', 'active']]

/** The button's fill over the page and its text color, with `state` forced. */
const lookOf = async (element: HTMLElement, nodeId: number, state: State) => {
  await force(nodeId, state)
  const style = getComputedStyle(element)
  const page = getComputedStyle(document.querySelector('#page')!).backgroundColor
  return { fill: pixelOf(page, style.backgroundColor), text: pixelOf(style.color) }
}

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a toggle that is on keeps its text readable and its color, hovered or held',
  async scheme => {
    const handle = mount(scheme)
    try {
      await drawn()
      for (const { variant, tone } of cases) {
        const element = buttonOf(variant, tone, true)
        const nodeId = await nodeOf(`[data-case="${variant} ${tone} true"] button`)
        const looks: Array<Awaited<ReturnType<typeof lookOf>>> = []
        for (const state of states) {
          const look = await lookOf(element, nodeId, state)
          const label = `${variant} ${tone} [${state.join(', ')}]`
          expect(contrast(look.fill, look.text), label).toBeGreaterThan(3)
          looks.push(look)
        }
        await force(nodeId, [])
        // The text keeps one color under the pointer: an icon's glyph once
        // turned from the fill's text to the page's.
        looks.forEach(look => expect(look.text, `${variant} ${tone}`).toEqual(looks[0]!.text))
      }
    } finally {
      handle.dispose()
    }
  },
)

test.each(variants)('hovered, a %s toggle that is on still looks on', async variant => {
  const handle = mount()
  try {
    await drawn()
    const look = async (pressed: boolean) => {
      const element = buttonOf(variant, 'accent', pressed)
      const nodeId = await nodeOf(`[data-case="${variant} accent ${pressed}"] button`)
      const result = await lookOf(element, nodeId, ['hover'])
      await force(nodeId, [])
      return result.fill
    }
    expect(await look(true)).not.toEqual(await look(false))
  } finally {
    handle.dispose()
  }
})

test.each(variants)('a %s button that is on looks it, and not like one hovered', async variant => {
  const handle = mount()
  try {
    await drawn()
    const on = getComputedStyle(buttonOf(variant, 'accent', true)).backgroundColor
    expect(on).not.toBe(getComputedStyle(buttonOf(variant, 'accent', false)).backgroundColor)
    const off = buttonOf(variant, 'accent', false)
    const nodeId = await nodeOf(`[data-case="${variant} accent false"] button`)
    await force(nodeId, ['hover'])
    expect(on).not.toBe(getComputedStyle(off).backgroundColor)
    await force(nodeId, [])
  } finally {
    handle.dispose()
  }
})

test.each(['ghost', 'outline', 'icon'] as const)(
  'held, a %s button that is off grounds deeper than its hover',
  async variant => {
    const handle = mount()
    try {
      await drawn()
      const element = buttonOf(variant, 'accent', false)
      const nodeId = await nodeOf(`[data-case="${variant} accent false"] button`)
      const hovered = await lookOf(element, nodeId, ['hover'])
      const held = await lookOf(element, nodeId, ['hover', 'active'])
      await force(nodeId, [])
      // On the light page, deeper is darker.
      expect(luminanceOf(held.fill)).toBeLessThan(luminanceOf(hovered.fill))
    } finally {
      handle.dispose()
    }
  },
)

test('a toggle group fills every pressed option, and not the others', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="group"] button')).toHaveLength(3),
    )
    const [bold, italic, strike] = Array.from(
      document.querySelectorAll<HTMLElement>('[role="group"] button'),
      button => getComputedStyle(button).backgroundColor,
    )
    expect(bold).toBe(italic)
    expect(bold).not.toBe(strike)
  } finally {
    handle.dispose()
  }
})
