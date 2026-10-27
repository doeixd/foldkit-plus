/**
 * Controls inside a padded container take a corner concentric with its
 * corner, on a real page: a button and a field outside one are `md`; inside
 * a Card the corner is the card's less its padding, never sharper than `sm`
 * nor rounder than `md`; and `control-round` still makes the button a pill.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import {
  AlertSlots,
  ButtonSlots,
  Card,
  CardSlots,
  DialogSlots,
  InputCopySlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
  ToastSlots,
} from '../src/index.js'
import { unitKnobs } from './fixture.js'

// At unit knobs: what is measured here is the scale's nominal size or time.
const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const input = Style.forSlots(InputSlots)(Recipes.Input({}))
const card = Style.forSlots(CardSlots)(Recipes.Card({}))
const dialog = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
const toast = Style.forSlots(ToastSlots)(Recipes.Toast({}))
const alert = Style.forSlots(AlertSlots)(Recipes.Alert({}))
const tray = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ tray: 'tray' }))
const copy = Style.forSlots(InputCopySlots)(Recipes.InputCopy({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('style')
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    button.css +
    input.css +
    card.css +
    dialog.css +
    toast.css +
    alert.css +
    tray.css +
    copy.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'concentric-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const controls = (prefix: string) => [
      h.button(
        SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h }).button.attrs([
          h.Type('button'),
          h.Id(`${prefix}-button`),
        ]),
        ['Save'],
      ),
      h.input(
        SlotView.buildersFor(InputSlots, [input.mixin], { input: undefined, h }).input.attrs([
          h.Id(`${prefix}-field`),
        ]),
      ),
    ]
    return h.div(
      [],
      [
        h.div([], controls('bare')),
        Card.view(
          {
            title: 'Profile',
            content: h.div(
              [],
              [
                ...controls('card'),
                // Controls that nest parts of their own, which still read the card's corner.
                h.div(
                  SlotView.buildersFor(SegmentedSlots, [tray.mixin], {
                    input: undefined,
                    h,
                  }).group.attrs([h.Id('card-tray')]),
                  [],
                ),
                h.div(
                  SlotView.buildersFor(InputCopySlots, [copy.mixin], {
                    input: undefined,
                    h,
                  }).group.attrs([h.Id('card-copy')]),
                  [],
                ),
              ],
            ),
            style: card,
          },
          h,
        ),
        // The other padded containers' own Slots, each holding the controls directly.
        h.div(
          SlotView.buildersFor(DialogSlots, [dialog.mixin], { input: undefined, h }).panel.attrs(),
          controls('dialog'),
        ),
        h.div(
          SlotView.buildersFor(ToastSlots, [toast.mixin], { input: undefined, h }).entry.attrs(),
          controls('toast'),
        ),
        h.div(
          SlotView.buildersFor(AlertSlots, [alert.mixin], { input: undefined, h }).root.attrs(),
          controls('alert'),
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

const element = (id: string) => document.getElementById(id)!
const corner = (id: string) => parseFloat(getComputedStyle(element(id)).borderTopLeftRadius)
const knob = (name: string, value: string) =>
  document.documentElement.style.setProperty(`--fk-knob-${name}`, value)
/** The card's corner less its padding: what a corner concentric with it is. */
const inCard = () => {
  const box = getComputedStyle(element('card-button').closest('[data-selected]')!)
  return parseFloat(box.borderTopLeftRadius) - parseFloat(box.paddingTop)
}

test('outside a container a control is md; in a card, sm where its padding is deep', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('card-field')).not.toBeNull())
    expect(corner('bare-button')).toBe(6)
    expect(corner('bare-field')).toBe(6)
    // The card's 8px corner less 16px of padding would square it off.
    expect(inCard()).toBeLessThan(3)
    expect(corner('card-button')).toBe(3)
    expect(corner('card-field')).toBe(3)
  } finally {
    handle.dispose()
  }
})

test('in a rounder card the corner is the card’s less its padding, and a pill stays a pill', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('card-field')).not.toBeNull())
    knob('radius-factor', '4')
    // Between sm (12px) and md (24px) here: the card's 32px less its 16px.
    expect(inCard()).toBe(16)
    expect(corner('card-button')).toBe(16)
    expect(corner('card-field')).toBe(16)
    expect(corner('card-tray')).toBe(16)
    expect(corner('card-copy')).toBe(16)
    expect(corner('bare-button')).toBe(24)
    knob('control-round', '1')
    const height = element('card-button').getBoundingClientRect().height
    expect(corner('card-button')).toBeGreaterThanOrEqual(height / 2)
    expect(corner('card-field')).toBe(16)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['a dialog', 'dialog'],
  ['a toast', 'toast'],
  ['an alert', 'alert'],
])('in %s the corner is its own inside its border, less its padding', async (_, name) => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById(`${name}-field`)).not.toBeNull())
    knob('radius-factor', '8')
    const box = getComputedStyle(element(`${name}-button`).parentElement!)
    const expected =
      parseFloat(box.borderTopLeftRadius) -
      parseFloat(box.paddingTop) -
      parseFloat(box.borderTopWidth)
    // Clear of the bounds, so the corner is the container's and not a clamp's.
    expect(expected).toBeGreaterThan(24)
    expect(expected).toBeLessThan(48)
    expect(corner(`${name}-button`)).toBeCloseTo(expected, 1)
    expect(corner(`${name}-field`)).toBeCloseTo(expected, 1)
  } finally {
    handle.dispose()
  }
})
