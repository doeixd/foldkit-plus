/**
 * The popup rows menus, listboxes and comboboxes share, on a real page: the
 * row the keys are on is marked, and the focused panel draws no ring of its
 * own.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<never>) => {
  const slots = SlotView.buildersFor(MenuSlots, [style.mixin], { input: undefined, h })
  return h.div(
    [],
    [
      h.div(slots.items.attrs([h.Tabindex(0), h.AriaLabel('panel')]), [
        h.div(slots.item.attrs([h.AriaLabel('resting')]), ['Rename']),
        h.div(slots.item.attrs([h.AriaLabel('active'), h.DataAttribute('active', '')]), ['Move']),
      ]),
      // Where the pointer is put, away from the rows: a pointer an earlier test
      // left over a row would hover it.
      h.div([h.AriaLabel('elsewhere'), h.Style({ height: '40px', marginBlockStart: '200px' })], []),
    ],
  )
}

test('the active row is marked, and the focused panel draws no ring', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popup-browser'
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
  try {
    await vi.waitFor(() => expect(document.querySelector('[aria-label="panel"]')).toBeTruthy())
    await userEvent.hover(document.querySelector<HTMLElement>('[aria-label="elsewhere"]')!)
    const fill = (label: string) =>
      getComputedStyle(document.querySelector(`[aria-label="${label}"]`)!).backgroundColor
    expect(fill('resting')).toBe('rgba(0, 0, 0, 0)')
    expect(fill('active')).not.toBe('rgba(0, 0, 0, 0)')
    const panel = document.querySelector<HTMLElement>('[aria-label="panel"]')!
    // A keyboard focus, as the menu's own keys move it.
    panel.focus({ focusVisible: true })
    expect(panel.matches(':focus-visible')).toBe(true)
    expect(getComputedStyle(panel).outlineStyle).toBe('none')
  } finally {
    handle.dispose()
  }
})
