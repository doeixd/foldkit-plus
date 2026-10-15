/**
 * The surface ladder on a real page: a popup sits two levels above what
 * holds it, so one opened in a dialog (four up) lands at seven and one on
 * the page at three. In a dark scheme each level is lighter, so the two
 * popups differ and the dialog sits between the page and its popup; in a
 * light scheme every level from three up is the same flat surface, and the
 * shadow carries the elevation.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { DialogSlots, MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const menu = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const dialog = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const panel = (h: HtmlBuilder<never>, label: string): Html => {
  const m = SlotView.buildersFor(MenuSlots, [menu.mixin], { input: undefined, h })
  return h.div(m.items.attrs([h.AriaLabel(label), h.Role('menu')]), [
    h.button(m.item.attrs([h.Role('menuitem')]), ['Rename']),
  ])
}

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: scheme })),
    ) +
    menu.css +
    dialog.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'raise-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const d = SlotView.buildersFor(DialogSlots, [dialog.mixin], { input: undefined, h })
    return h.div(
      [],
      [
        panel(h, 'on the page'),
        h.div(d.panel.attrs([h.AriaLabel('dialog')]), [panel(h, 'in the dialog')]),
      ],
    )
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

const style = (label: string) =>
  getComputedStyle(document.querySelector(`[aria-label="${label}"]`)!)
/** The lightness of a computed OKLab or OKLCH color, 0 to 1 (a mix computes to OKLab). */
const lightness = (label: string) =>
  Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(style(label).backgroundColor)![1])
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[aria-label="in the dialog"]')).not.toBeNull())

test('in a dark scheme a popup in a dialog is lighter than the dialog, which is lighter than one on the page', async () => {
  const handle = mount('dark')
  try {
    await drawn()
    expect(lightness('dialog')).toBeGreaterThan(lightness('on the page'))
    expect(lightness('in the dialog')).toBeGreaterThan(lightness('dialog'))
    // The shadow is pinned, so a popup reads as one however deep it opens.
    expect(style('in the dialog').boxShadow).toBe(style('on the page').boxShadow)
  } finally {
    handle.dispose()
  }
})

test('in a light scheme every raised level is the same flat surface', async () => {
  const handle = mount('light')
  try {
    await drawn()
    expect(lightness('in the dialog')).toBe(lightness('on the page'))
    expect(lightness('dialog')).toBe(lightness('on the page'))
  } finally {
    handle.dispose()
  }
})
