/**
 * The calendar recipe on a real page: a day is one step of the size ladder,
 * the chosen day fills with the accent, and a day outside the month is
 * quieter than one in it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style, type NamedStyle } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CalendarSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const week = (style: NamedStyle<typeof CalendarSlots>) => (_: unknown, h: HtmlBuilder<never>) => {
  const slots = SlotView.buildersFor(CalendarSlots, [style.mixin], { input: undefined, h })
  const day = (label: string, state: 'selected' | 'outside-month' | 'plain') =>
    h.span(
      slots.dayCell.attrs([
        h.Role('gridcell'),
        ...(state === 'plain' ? [] : [h.DataAttribute(state, 'true')]),
      ]),
      [h.button(slots.dayButton.attrs([h.Type('button'), h.AriaLabel(label)]), [label])],
    )
  return h.div(slots.root.attrs(), [
    h.div(slots.grid.attrs([h.Role('grid'), h.AriaRowcount(1)]), [
      h.div(slots.weekRow.attrs([h.Role('row')]), [
        day('30', 'outside-month'),
        day('1', 'plain'),
        day('2', 'selected'),
      ]),
    ]),
  ])
}

const mount = (style: NamedStyle<typeof CalendarSlots>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'calendar-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: week(style),
    }),
  )
}

const day = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!

test.each([
  ['sm', 28],
  ['md', 36],
] as const)('a %s day is %ipx square', async (size, pixels) => {
  const handle = mount(Style.forSlots(CalendarSlots)(Recipes.Calendar({ size })))
  try {
    await vi.waitFor(() => expect(day('1')).toBeTruthy())
    const box = day('1').getBoundingClientRect()
    expect(box.width).toBeCloseTo(pixels, 0)
    expect(box.height).toBeCloseTo(pixels, 0)
  } finally {
    handle.dispose()
  }
})

test('the chosen day fills, and a day outside the month is quieter', async () => {
  const handle = mount(Style.forSlots(CalendarSlots)(Recipes.Calendar({})))
  try {
    await vi.waitFor(() => expect(day('2')).toBeTruthy())
    // A pointer an earlier test left over a day would hover it.
    await userEvent.hover(document.body, { position: { x: 600, y: 600 } })
    expect(getComputedStyle(day('1')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(day('2')).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(day('30')).color).not.toBe(getComputedStyle(day('1')).color)
  } finally {
    handle.dispose()
  }
})
