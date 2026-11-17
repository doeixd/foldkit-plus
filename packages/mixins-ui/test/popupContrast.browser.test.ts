/**
 * A lit row reads on the surface it is on: in a menu's panel under every
 * `menu` option, and on the page's own surface, where an inline Command draws
 * its rows. Contrast is measured on what the browser painted, the row's
 * translucent fill composited over its panel and the page, in both schemes.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme, type Standard, type Values } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CommandSlots, MenuSlots, Recipes } from '../src/index.js'

const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const commandStyle = Style.forSlots(CommandSlots)(Recipes.Command({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

type Scheme = 'light' | 'dark'
type Menu = NonNullable<Values<Standard>['menu']>

const view = (_: unknown, h: HtmlBuilder<never>) => {
  const menu = SlotView.buildersFor(MenuSlots, [menuStyle.mixin], { input: undefined, h })
  const command = SlotView.buildersFor(CommandSlots, [commandStyle.mixin], { input: undefined, h })
  return h.div(
    [h.AriaLabel('page'), h.Style({ background: 'var(--fk-surface-base)', padding: '16px' })],
    [
      h.div(menu.items.attrs([h.Tabindex(0), h.AriaLabel('menu')]), [
        h.div(menu.item.attrs([h.AriaLabel('menu resting')]), ['Rename']),
        h.div(menu.item.attrs([h.AriaLabel('menu lit'), h.DataAttribute('active', '')]), ['Move']),
      ]),
      h.div(command.root.attrs([h.AriaLabel('command')]), [
        h.div(command.list.attrs([]), [
          h.div(command.item.attrs([h.AriaLabel('command resting')]), ['Save']),
          h.div(command.item.attrs([h.AriaLabel('command lit'), h.DataAttribute('active', '')]), [
            'Open file',
          ]),
        ]),
      ]),
      // Where the pointer is parked: one an earlier test left over a row would hover it.
      h.div([h.AriaLabel('elsewhere'), h.Style({ height: '40px', marginBlockStart: '200px' })], []),
    ],
  )
}

const mount = async (menu: Menu, scheme: Scheme) => {
  const palette = Theme.standard(Theme.make({ menu }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(palette, { colorScheme: scheme })),
    ) +
    menuStyle.css +
    commandStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popup-contrast'
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
  await vi.waitFor(() => expect(document.querySelector('[aria-label="menu"]')).toBeTruthy())
  await userEvent.hover(document.querySelector<HTMLElement>('[aria-label="elsewhere"]')!)
  return handle
}

const el = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
const style = (label: string) => getComputedStyle(el(label))
/** The lightness of a computed OKLab or OKLCH color, 0 to 1. */
const lightness = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

const canvas = document.createElement('canvas')
canvas.width = canvas.height = 1
const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })!

/** The sRGB the browser paints when the colors are laid over each other, first at the back. */
const painted = (...layers: ReadonlyArray<string>): ReadonlyArray<number> => {
  context.clearRect(0, 0, 1, 1)
  for (const layer of layers) {
    context.fillStyle = '#123456'
    context.fillStyle = layer
    if (context.fillStyle === '#123456') throw new Error(`The canvas cannot read ${layer}`)
    context.fillRect(0, 0, 1, 1)
  }
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

const contrast = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/** A row's text against what is under it: its own fill over the surfaces it sits on. */
const rowContrast = (row: string, surfaces: ReadonlyArray<string>) => {
  const page = style('page').backgroundColor
  const under = surfaces.map(label => style(label).backgroundColor)
  const background = painted(page, ...under, style(row).backgroundColor)
  return contrast(painted(page, ...under, style(row).backgroundColor, style(row).color), background)
}

const panels = ['default', 'inverted', 'translucent', 'inverted-translucent'] as const
const accents = ['subtle', 'bold'] as const
const schemes = ['light', 'dark'] as const
const combinations = panels.flatMap(panel =>
  accents.flatMap(highlight => schemes.map(scheme => ({ panel, highlight, scheme }))),
)

describe('a row reads on its surface', () => {
  test.each(combinations)('$panel panel, $highlight accent, $scheme', async option => {
    const handle = await mount({ panel: option.panel, highlight: option.highlight }, option.scheme)
    try {
      const minimum = 4.5
      for (const row of ['menu resting', 'menu lit']) {
        expect(rowContrast(row, ['menu']), row).toBeGreaterThanOrEqual(minimum)
      }
      for (const row of ['command resting', 'command lit']) {
        expect(rowContrast(row, ['command']), row).toBeGreaterThanOrEqual(minimum)
      }
    } finally {
      handle.dispose()
    }
  })
})

test('by default a dark page’s menu panel stays dark, nearer the page than white', async () => {
  const handle = await mount({}, 'dark')
  try {
    const page = lightness(style('page').backgroundColor)
    const panel = lightness(style('menu').backgroundColor)
    expect(Math.abs(panel - page)).toBeLessThan(Math.abs(1 - panel))
    expect(panel).toBeLessThan(0.5)
  } finally {
    handle.dispose()
  }
})
