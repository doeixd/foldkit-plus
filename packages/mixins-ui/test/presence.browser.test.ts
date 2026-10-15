/**
 * A popup's and a dialog's entrance and exit, on a real page, through the
 * states `@foldkit/ui` writes when animated: closed, the panel is gone and a
 * little smaller; a leave runs the quicker exit; a popup placed above its
 * trigger grows from its bottom edge.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
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

const states: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
  ['open', []],
  ['closed', [['data-closed', '']]],
  ['leaving', [['data-leave', '']]],
  [
    'above',
    [
      ['data-placement', 'top'],
      ['data-closed', ''],
    ],
  ],
]

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    menu.css +
    dialog.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'presence-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const m = SlotView.buildersFor(MenuSlots, [menu.mixin], { input: undefined, h })
    const d = SlotView.buildersFor(DialogSlots, [dialog.mixin], { input: undefined, h })
    const marks = (name: string, attributes: ReadonlyArray<readonly [string, string]>) => [
      h.AriaLabel(name),
      ...attributes.map(([key, value]) => h.Attribute(key, value)),
    ]
    return h.div(
      [],
      states.flatMap(([name, attributes]) => [
        h.div(m.items.attrs(marks(`menu ${name}`, attributes)), []),
        h.div(d.panel.attrs(marks(`dialog ${name}`, attributes)), []),
      ]),
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
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[aria-label="dialog above"]')).not.toBeNull())

test('closed, a popup is clear and a little smaller and higher; open, it is whole', async () => {
  const handle = mount()
  try {
    await drawn()
    expect([style('menu open').opacity, style('menu open').scale]).toEqual(['1', 'none'])
    expect([style('menu closed').opacity, style('menu closed').scale]).toEqual(['0', '1 0.96'])
    expect(style('menu closed').translate).toBe('0px -4px')
  } finally {
    handle.dispose()
  }
})

test('a leave is quicker than an entrance: the fast tier for a popup, the slow for a dialog', async () => {
  const handle = mount()
  try {
    await drawn()
    expect(style('menu open').transitionDuration).toBe('0.08s, 0.08s, 0.08s')
    expect(style('menu leaving').transitionDuration).toBe('0.06s, 0.06s, 0.06s')
    expect(style('dialog open').transitionDuration).toBe('0.24s, 0.24s, 0.24s')
    expect(style('dialog leaving').transitionDuration).toBe('0.16s, 0.16s, 0.16s')
    expect(style('dialog closed').scale).toBe('0.97')
  } finally {
    handle.dispose()
  }
})

test('a popup placed above its trigger grows from its bottom edge, rising into place', async () => {
  const handle = mount()
  try {
    await drawn()
    expect(style('menu closed').transformOrigin).toMatch(/ 0px$/)
    expect(style('menu above').transformOrigin).not.toBe(style('menu closed').transformOrigin)
    expect(style('menu above').translate).toBe('0px 4px')
  } finally {
    handle.dispose()
  }
})
