/**
 * The default theme's look, read from what the browser computed in both
 * schemes: a solid Button's words read on its fill, a TagsInput's chip is a
 * pill and a step off its field in the direction a raised neutral takes (lighter
 * in a dark scheme, darker in a light one), and a Menubar's bar is never
 * darker than the page in a dark scheme.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ButtonSlots, MenubarSlots, Recipes, TagsInputSlots } from '../src/index.js'

const buttonStyle = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const tagsStyle = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}))
const barStyle = Style.forSlots(MenubarSlots)(Recipes.Menubar({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

type Scheme = 'light' | 'dark'
const schemes = ['light', 'dark'] as const

const view = (_: unknown, h: HtmlBuilder<never>) => {
  const button = SlotView.buildersFor(ButtonSlots, [buttonStyle.mixin], { input: undefined, h })
  const tags = SlotView.buildersFor(TagsInputSlots, [tagsStyle.mixin], { input: undefined, h })
  const bar = SlotView.buildersFor(MenubarSlots, [barStyle.mixin], { input: undefined, h })
  return h.div(
    [h.AriaLabel('page'), h.Style({ background: 'var(--fk-surface-base)', padding: '16px' })],
    [
      h.button(button.button.attrs([h.AriaLabel('solid')]), ['Save']),
      h.div(tags.control.attrs([h.AriaLabel('field')]), [
        h.ul(tags.list.attrs([]), [
          h.li(tags.tag.attrs([h.AriaLabel('chip'), h.Style({ paddingBlock: '1rem' })]), [
            'foldkit',
          ]),
        ]),
      ]),
      h.div(bar.bar.attrs([h.AriaLabel('bar')]), ['Edit']),
    ],
  )
}

const mount = async (scheme: Scheme) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in(
        'theme',
        Theme.root(Theme.standard(Theme.make({})), { colorScheme: scheme }),
      ),
    ) +
    buttonStyle.css +
    tagsStyle.css +
    barStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'default-look'
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
  await vi.waitFor(() => expect(document.querySelector('[aria-label="solid"]')).toBeTruthy())
  return handle
}

const style = (label: string) =>
  getComputedStyle(document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!)
const box = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.getBoundingClientRect()
/** The lightness of a computed OKLab or OKLCH color, 0 to 1. */
const lightness = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

const canvas = document.createElement('canvas')
canvas.width = canvas.height = 1
const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })!
const painted = (color: string): ReadonlyArray<number> => {
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = '#123456'
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!]
}
const luminance = ([r, g, b]: ReadonlyArray<number>) => {
  const linear = (value: number) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!)
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(painted(a)), luminance(painted(b))].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe.each(schemes)('the default theme, %s', scheme => {
  test('a solid Button’s light words read on its fill at WCAG AA, and the fill stands off a dark page', async () => {
    const handle = await mount(scheme)
    try {
      const { color, backgroundColor } = style('solid')
      expect(contrast(color, backgroundColor)).toBeGreaterThanOrEqual(4.5)
      // Light words on a fill deep enough to stand off the dark page, as in a light scheme.
      expect(lightness(color)).toBeGreaterThan(0.9)
      if (scheme === 'dark') {
        expect(contrast(backgroundColor, style('page').backgroundColor)).toBeGreaterThanOrEqual(3)
      }
    } finally {
      handle.dispose()
    }
  })

  test('a tag chip is a pill, and a step off its field the way a raised neutral goes', async () => {
    const handle = await mount(scheme)
    try {
      const chip = style('chip')
      expect(Number.parseFloat(chip.borderTopLeftRadius)).toBeGreaterThanOrEqual(
        box('chip').height / 2,
      )
      const field = lightness(style('field').backgroundColor)
      const fill = lightness(chip.backgroundColor)
      if (scheme === 'dark') expect(fill).toBeGreaterThan(field + 0.02)
      else expect(fill).toBeLessThan(field - 0.02)
    } finally {
      handle.dispose()
    }
  })
})

test('in a dark scheme a Menubar’s bar is not darker than the page', async () => {
  const handle = await mount('dark')
  try {
    expect(lightness(style('bar').backgroundColor)).toBeGreaterThanOrEqual(
      lightness(style('page').backgroundColor),
    )
  } finally {
    handle.dispose()
  }
})

test('in a light scheme a Menubar’s bar is darker than the page', async () => {
  const handle = await mount('light')
  try {
    expect(lightness(style('bar').backgroundColor)).toBeLessThan(
      lightness(style('page').backgroundColor),
    )
  } finally {
    handle.dispose()
  }
})
