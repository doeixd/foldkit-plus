/**
 * A segmented control drawn with its indicator and highlight, on a real
 * runtime: with `Segmented.fluid` the pill sits under the pressed option and
 * the hover lands on the option the pointer is on; without it the pressed
 * option fills itself and the pill shows nothing.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Segmented, SegmentedSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const Model = Schema.Struct({})
const transparent = 'rgba(0, 0, 0, 0)'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (fluid: boolean, direction: 'ltr' | 'rtl' = 'ltr') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'segmented-browser'
  document.body.dir = direction
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const slots = SlotView.buildersFor(
      SegmentedSlots,
      [style.mixin, ...(fluid ? Segmented.fluid : [])],
      { input: undefined, h },
    )
    return h.div(slots.group.attrs([h.Role('group'), h.AriaLabel('Range')]), [
      h.div(slots.indicator.attrs([h.AriaHidden(true)])),
      h.div(slots.highlight.attrs([h.AriaHidden(true)])),
      ...['Day', 'Week', 'Month'].map(label =>
        h.button(slots.option.attrs([h.Type('button'), h.AriaPressed(String(label === 'Week'))]), [
          label,
        ]),
      ),
    ])
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

const option = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('button')).find(
    each => each.textContent === name,
  )!
const part = (index: number) =>
  document.querySelector('[role="group"]')!.children[index] as HTMLElement
const spans = (over: HTMLElement, under: HTMLElement) => {
  const a = over.getBoundingClientRect()
  const b = under.getBoundingClientRect()
  return Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1
}

test('with Segmented.fluid the pill sits under the pressed option, and the hover follows', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => expect(spans(part(0), option('Week'))).toBe(true))
    expect(getComputedStyle(option('Week')).backgroundColor).toBe(transparent)
    await userEvent.hover(option('Month'))
    await vi.waitFor(() => expect(spans(part(1), option('Month'))).toBe(true))
  } finally {
    handle.dispose()
  }
})

test('without it the pressed option fills itself and the pill shows nothing', async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => expect(option('Week')).toBeTruthy())
    expect(getComputedStyle(option('Week')).backgroundColor).not.toBe(transparent)
    expect(getComputedStyle(part(0)).display).toBe('none')
    expect(getComputedStyle(part(1)).display).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('right to left, the pill still sits under the pressed option', async () => {
  const handle = mount(true, 'rtl')
  try {
    await vi.waitFor(() => expect(spans(part(0), option('Week'))).toBe(true))
  } finally {
    handle.dispose()
    document.body.dir = ''
  }
})
