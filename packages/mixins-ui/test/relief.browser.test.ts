/// <reference types="@vitest/browser-playwright" />
/**
 * A theme's relief on real controls: flat by default; with a `shadow.relief`, a
 * faced button stands off the page, a held or toggled-on one is pressed in, a
 * ghost button stays flat as text does, and a field sinks into the page.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ButtonSlots, InputSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'
import { force, nodeOf } from './pseudoState.js'

const accent = { hue: 265, chroma: 0.16 }
// At unit knobs: a control's corner is `md`'s nominal 6px.
const palette = Theme.standard(Theme.make({ ...unitKnobs, accent }))
const relieved = (relief: 'bevel' | 'hard') =>
  Theme.standard(Theme.make({ accent, shadow: { relief } }))
const solid = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const ghost = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'ghost' }))
const input = Style.forSlots(InputSlots)(Recipes.Input({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (theme: typeof palette) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    solid.css +
    ghost.css +
    input.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'relief-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const button = (style: typeof solid, id: string, pressed?: boolean) =>
      h.button(
        SlotView.buildersFor(ButtonSlots, [style.mixin], { input: undefined, h }).button.attrs([
          h.Type('button'),
          h.Id(id),
          ...(pressed === undefined ? [] : [h.AriaPressed(String(pressed))]),
        ]),
        ['Save'],
      )
    const field = SlotView.buildersFor(InputSlots, [input.mixin], { input: undefined, h })
    return h.div(
      [],
      [
        button(solid, 'solid'),
        button(solid, 'on', true),
        button(ghost, 'ghost'),
        h.input(field.input.attrs([h.Id('field')])),
      ],
    )
  }
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

/** The computed shadow of the element `id`, once it is drawn. */
const shadowOf = (id: string) =>
  vi.waitFor(() => {
    const found = document.getElementById(id)
    expect(found).not.toBeNull()
    return getComputedStyle(found!).boxShadow
  })

const FLAT = /^(none|rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)$/
/** The offsets of each layer of a computed shadow, `inset` marked. */
const offsets = (shadow: string) =>
  Array.from(
    shadow.matchAll(/\) (-?\d+)px (-?\d+)px 0px 0px( inset)?/g),
    ([, x, y, inset]) => `${inset === undefined ? '' : 'inset '}${x} ${y}`,
  )

test('by default every control is flat', async () => {
  mount(palette)
  for (const id of ['solid', 'on', 'ghost', 'field']) expect(await shadowOf(id)).toMatch(FLAT)
})

test('beveled, a faced button stands out, pressed in when held or on, and a field sinks', async () => {
  mount(relieved('bevel'))
  // Raised, the outer ring lies outside the border, which carries the fill.
  const out = ['1 1', '-1 -1', 'inset -1 -1', 'inset 1 1']
  const sunk = ['inset 1 1', 'inset -1 -1', 'inset 2 2', 'inset -2 -2']
  expect(offsets(await shadowOf('solid'))).toEqual(out)
  expect(offsets(await shadowOf('on'))).toEqual(sunk)
  expect(offsets(await shadowOf('field'))).toEqual(sunk)
  expect(await shadowOf('ghost')).toMatch(FLAT)
  const target = await nodeOf('#solid')
  // The shadow transitions: wait for where it ends, not its first frame.
  await force(target, ['active'])
  await vi.waitFor(async () => expect(offsets(await shadowOf('solid'))).toEqual(sunk))
  await force(target, [])
  await vi.waitFor(async () => expect(offsets(await shadowOf('solid'))).toEqual(out))
})

test('hard, a faced button and a field drop a solid copy, and a press brings it closer', async () => {
  mount(relieved('hard'))
  expect(offsets(await shadowOf('solid'))).toEqual(['2 2'])
  expect(offsets(await shadowOf('on'))).toEqual(['1 1'])
  expect(offsets(await shadowOf('field'))).toEqual(['2 2'])
  expect(await shadowOf('ghost')).toMatch(FLAT)
})

test('control-round rounds a button and the control token to a pill; a field keeps its corner', async () => {
  mount(palette)
  const radius = async (id: string) => {
    await shadowOf(id)
    return Number.parseFloat(getComputedStyle(document.getElementById(id)!).borderTopLeftRadius)
  }
  expect(await radius('solid')).toBe(6)
  // On the root, where the radius tokens are declared and resolved.
  document.documentElement.style.setProperty('--fk-knob-control-round', '1')
  // An application's own control drawn on the token rounds with the buttons.
  const own = document.createElement('div')
  own.style.borderRadius = 'var(--fk-radius-control)'
  document.body.append(own)
  try {
    expect(await radius('solid')).toBeGreaterThan(1000)
    expect(await radius('field')).toBe(6)
    expect(Number.parseFloat(getComputedStyle(own).borderTopLeftRadius)).toBeGreaterThan(1000)
  } finally {
    own.remove()
    document.documentElement.style.removeProperty('--fk-knob-control-round')
  }
})
