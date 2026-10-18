/// <reference types="@vitest/browser-playwright" />
/**
 * What a notch, rounded corners and the home indicator take from the screen, as Chrome
 * emulates them: a toast stack and a full Dialog keep clear of each edge they sit at.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, it, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { DialogSlots, Recipes, ToastSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const toast = Style.forSlots(ToastSlots)(Recipes.Toast({}))
const dialog = Style.forSlots(DialogSlots)(Recipes.Dialog({ size: 'full' }))
const Model = Schema.Struct({})

/** A phone on its side: the notch at the left, rounded corners right, the indicator below. */
const insets = { top: 20, right: 30, bottom: 21, left: 47 }

const emulate = (to: typeof insets) =>
  cdp().send('Emulation.setSafeAreaInsetsOverride', { insets: to })

afterEach(async () => {
  await emulate({ top: 0, right: 0, bottom: 0, left: 0 })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
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
    toast.css +
    dialog.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'safe-area'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) => {
        const t = SlotView.buildersFor(ToastSlots, [toast.mixin], { input: undefined, h })
        const d = SlotView.buildersFor(DialogSlots, [dialog.mixin], { input: undefined, h })
        return h.div(
          [],
          [
            h.div(t.container.attrs([h.Id('stack'), h.DataAttribute('position', 'bottom-end')]), [
              h.div([h.Style({ blockSize: '3rem' })], ['Saved']),
            ]),
            // What upstream's dialog element is while open: the screen, a grid that centers.
            h.div(
              [
                h.Style({
                  position: 'fixed',
                  inset: '0',
                  display: 'grid',
                  placeItems: 'center',
                  padding: '0',
                }),
              ],
              [h.div(d.panel.attrs([h.Id('panel')]), ['Filters'])],
            ),
          ],
        )
      },
    }),
  )
}

const clearance = (selector: string) => {
  const box = document.querySelector(selector)!.getBoundingClientRect()
  return {
    top: box.top,
    right: window.innerWidth - box.right,
    bottom: window.innerHeight - box.bottom,
    left: box.left,
  }
}

it('keeps a toast stack and a full Dialog off each edge the screen takes', async () => {
  await emulate(insets)
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('panel')).not.toBeNull())
    const stack = clearance('#stack')
    expect(stack.bottom).toBeGreaterThanOrEqual(insets.bottom + 16)
    // Inline edges keep clear of the larger side, whichever way the text runs.
    expect(stack.right).toBeGreaterThanOrEqual(Math.max(insets.left, insets.right) + 16)
    const panel = clearance('#panel')
    expect(panel.top).toBeGreaterThanOrEqual(insets.top)
    expect(panel.right).toBeGreaterThanOrEqual(insets.right)
    expect(panel.bottom).toBeGreaterThanOrEqual(insets.bottom)
    expect(panel.left).toBeGreaterThanOrEqual(insets.left)
    // And it still fills what is left, less its margin.
    expect(window.innerWidth - panel.left - panel.right).toBeGreaterThan(window.innerWidth / 2)
  } finally {
    handle.dispose()
  }
})

it('stands a full Dialog above the on-screen keyboard Dialog.keyboard measures', async () => {
  const handle = mount()
  try {
    const panel = await vi.waitFor(() => {
      const found = document.getElementById('panel')
      expect(found).not.toBeNull()
      return found!
    })
    panel.style.setProperty('--fk-keyboard-inset', '300px')
    expect(clearance('#panel').bottom).toBeGreaterThanOrEqual(300)
    expect(clearance('#panel').top).toBeGreaterThanOrEqual(0)
  } finally {
    handle.dispose()
  }
})
