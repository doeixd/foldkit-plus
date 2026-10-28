/**
 * On a touch screen, in the `browser-touch` project, a control is as large as a finger
 * needs, 44px, and a region set compact stays so; with a mouse they keep the ladder's 36px
 * (`ladder.browser.test.ts`).
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, it, vi } from 'vitest'
import { ButtonSlots, InputSlots, Recipes, ToastSlots } from '../src/index.js'
import { unitKnobs } from './fixture.js'

// At unit knobs: the ladder's rung is its nominal 36px, which the floor of 0 keeps.
const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const icon = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'icon' }))
const input = Style.forSlots(InputSlots)(Recipes.Input({}))
const toast = Style.forSlots(ToastSlots)(Recipes.Toast({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (floor: 'kept' | 'none') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    button.css +
    icon.css +
    input.css +
    toast.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'touch-target'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) => {
        const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
        const g = SlotView.buildersFor(ButtonSlots, [icon.mixin], { input: undefined, h })
        const i = SlotView.buildersFor(InputSlots, [input.mixin], { input: undefined, h })
        const t = SlotView.buildersFor(ToastSlots, [toast.mixin], { input: undefined, h })
        return h.div(
          [h.Style(floor === 'none' ? { '--fk-touch-floor': '0px' } : {})],
          [
            h.button(b.button.attrs([h.Id('save')]), ['Save']),
            h.button(g.button.attrs([h.Id('close'), h.AriaLabel('Close')]), ['×']),
            h.input(i.input.attrs([h.Id('name'), h.AriaLabel('Name')])),
            h.div(
              [h.Style({ padding: '40px' })],
              [h.button(t.close.attrs([h.Id('dismiss'), h.AriaLabel('Dismiss')]), [])],
            ),
          ],
        )
      },
    }),
  )
}

const box = (id: string) => document.getElementById(id)!.getBoundingClientRect()

it('draws a control a finger can hit, an icon one square', async () => {
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  const handle = mount('kept')
  try {
    await vi.waitFor(() => expect(document.getElementById('name')).not.toBeNull())
    expect(box('save').height).toBe(44)
    expect(box('name').height).toBe(44)
    expect([box('close').width, box('close').height]).toEqual([44, 44])
  } finally {
    handle.dispose()
  }
})

it('lets a finger find a toast’s small close button past its edges', async () => {
  const handle = mount('kept')
  try {
    await vi.waitFor(() => expect(document.getElementById('dismiss')).not.toBeNull())
    const close = box('dismiss')
    // It is drawn 24px; 18px from its center is outside it, and still on it.
    expect(close.width).toBe(24)
    const x = close.left + close.width / 2 + 18
    const y = close.top + close.height / 2
    expect(document.elementFromPoint(x, y)?.id).toBe('dismiss')
  } finally {
    handle.dispose()
  }
})

it('keeps the ladder in a region that sets the floor to 0', async () => {
  const handle = mount('none')
  try {
    await vi.waitFor(() => expect(document.getElementById('name')).not.toBeNull())
    expect(box('save').height).toBe(36)
    expect([box('close').width, box('close').height]).toEqual([36, 36])
  } finally {
    handle.dispose()
  }
})
