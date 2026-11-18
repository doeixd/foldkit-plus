/**
 * An adorned Input in a real browser: the group is the one box (the control
 * inside has no border of its own), it rings while the control has focus,
 * a disabled field dims as a whole, and the underline and ghost variants
 * draw their own edges.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Input, InputSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const sheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(theme)),
)
const styles = {
  outline: Style.forSlots(InputSlots)(Recipes.Input({ variant: 'outline' })),
  underline: Style.forSlots(InputSlots)(Recipes.Input({ variant: 'underline' })),
  ghost: Style.forSlots(InputSlots)(Recipes.Input({ variant: 'ghost' })),
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    sheet +
    Object.values(styles)
      .map(each => each.css)
      .join('')
  document.head.append(style)
  const container = document.createElement('div')
  container.id = 'adorned'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: {}, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '1rem', width: '320px' })],
          (['outline', 'underline', 'ghost'] as const).flatMap(variant => [
            Input.view(
              {
                id: `${variant}-rest`,
                label: variant,
                start: h.span([], ['https://']),
                end: h.span([], ['.com']),
                style: styles[variant],
              },
              h,
            ),
            Input.view(
              {
                id: `${variant}-off`,
                label: `${variant} off`,
                disabled: true,
                start: h.span([], ['https://']),
                style: styles[variant],
              },
              h,
            ),
          ]),
        ),
    }),
  )
}

const control = (id: string) => document.getElementById(id) as HTMLInputElement
const group = (id: string) => control(id).parentElement!

test('the group is the box: it rings on focus, and the control has no border', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('outline-rest')).not.toBeNull())
    const box = group('outline-rest')
    expect(box.hasAttribute('data-field-group')).toBe(true)
    expect(getComputedStyle(control('outline-rest')).borderTopWidth).toBe('0px')
    expect(getComputedStyle(box).borderTopWidth).not.toBe('0px')
    expect(getComputedStyle(box).outlineStyle).toBe('none')
    await userEvent.tab()
    await vi.waitFor(() => expect(document.activeElement).toBe(control('outline-rest')))
    expect(getComputedStyle(box).outlineStyle).toBe('solid')
    expect(getComputedStyle(control('outline-rest')).outlineStyle).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a disabled field dims as a whole', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('outline-off')).not.toBeNull())
    expect(getComputedStyle(group('outline-off')).opacity).not.toBe('1')
    expect(getComputedStyle(group('outline-rest')).opacity).toBe('1')
  } finally {
    handle.dispose()
  }
})

test('underline draws only its bottom edge, ghost none until hovered', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('underline-rest')).not.toBeNull())
    const under = getComputedStyle(group('underline-rest'))
    expect(under.borderBottomColor).not.toBe(under.borderTopColor)
    expect(under.borderTopColor).toBe('rgba(0, 0, 0, 0)')
    const ghost = getComputedStyle(group('ghost-rest'))
    expect(ghost.borderTopColor).toBe('rgba(0, 0, 0, 0)')
    expect(ghost.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    await userEvent.hover(group('ghost-rest'))
    await vi.waitFor(() =>
      expect(getComputedStyle(group('ghost-rest')).backgroundColor).not.toBe('rgba(0, 0, 0, 0)'),
    )
  } finally {
    handle.dispose()
  }
})
