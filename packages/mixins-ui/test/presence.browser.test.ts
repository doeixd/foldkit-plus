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
import { DialogSlots, MenuSlots, Recipes, TooltipSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const menu = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const dialog = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
const tooltip = Style.forSlots(TooltipSlots)(Recipes.Tooltip({}))
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
    dialog.css +
    tooltip.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'presence-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const m = SlotView.buildersFor(MenuSlots, [menu.mixin], { input: undefined, h })
    const d = SlotView.buildersFor(DialogSlots, [dialog.mixin], { input: undefined, h })
    const t = SlotView.buildersFor(TooltipSlots, [tooltip.mixin], { input: undefined, h })
    const marks = (name: string, attributes: ReadonlyArray<readonly [string, string]>) => [
      h.AriaLabel(name),
      ...attributes.map(([key, value]) => h.Attribute(key, value)),
    ]
    return h.div(
      [],
      [
        ...states.flatMap(([name, attributes]) => [
          h.div(m.items.attrs(marks(`menu ${name}`, attributes)), []),
          h.div(d.panel.attrs(marks(`dialog ${name}`, attributes)), []),
          h.div(t.panel.attrs(marks(`tooltip ${name}`, attributes)), []),
        ]),
        // A dialog in a compact region, beside the open one on the page.
        h.div(
          [h.Style({ '--fk-knob-step': '1' })],
          [h.div(d.panel.attrs(marks('dialog compact', [])), [])],
        ),
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

test('a dialog in a compact region is one notch narrower', async () => {
  const handle = mount()
  try {
    await drawn()
    const width = (label: string) =>
      document.querySelector(`[aria-label="${label}"]`)!.getBoundingClientRect().width
    // The default size is 32rem, 512px; compact takes 10% off it.
    expect(width('dialog open')).toBe(512)
    expect(width('dialog compact')).toBeCloseTo(460.8, 1)
  } finally {
    handle.dispose()
  }
})

test('a tooltip slides 4px toward its trigger as it fades in', async () => {
  const handle = mount()
  try {
    await drawn()
    // Below its trigger it starts 4px up; above it, 4px down.
    expect(style('tooltip closed').translate).toBe('0px -4px')
    expect(style('tooltip above').translate).toBe('0px 4px')
    expect(style('tooltip leaving').transitionDuration).toBe('0.06s, 0.06s, 0.06s')
  } finally {
    handle.dispose()
  }
})
