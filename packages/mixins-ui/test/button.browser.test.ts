/**
 * The Button's icon in a real browser: the icon variant hides the words by a
 * font size of zero, and the icon still stands at the ladder's icon size in
 * the middle of its square, an SVG with no size of its own and a glyph
 * drawn as text alike.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Button, ButtonSlots, Recipes } from '../src/index.js'

const L = Layers.standard
const Model = Schema.Struct({})
const iconOnly = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'icon' }))
const worded = Style.forSlots(ButtonSlots)(Recipes.Button({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const glyph = (h: HtmlBuilder<never>): Html =>
  h.svg(
    [h.ViewBox('0 0 16 16')],
    [h.path([h.Attribute('d', 'M3 8.5l3 3 7-7'), h.Attribute('stroke', 'currentColor')], [])],
  )

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [],
    [
      h.div([h.Id('alone')], [Button.view({ label: 'Save', icon: glyph(h), style: iconOnly }, h)]),
      h.div([h.Id('beside')], [Button.view({ label: 'Save', icon: glyph(h), style: worded }, h)]),
      h.div(
        [h.Id('text')],
        [Button.view({ label: 'More', icon: h.span([], ['⋯']), style: iconOnly }, h)],
      ),
    ],
  )

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('tokens', Theme.root(Theme.tokens))) +
    [iconOnly, worded].map(style => style.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'button-icon'
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
  await vi.waitFor(() => expect(document.getElementById('beside')).not.toBeNull())
  return handle
}

const parts = (id: string) => {
  const button = document.getElementById(id)!.querySelector('button')!
  return [button.getBoundingClientRect(), button.querySelector('svg')!.getBoundingClientRect()]
}

test('an icon-only button shows its icon, centred in its square', async () => {
  const handle = await mount()
  try {
    const [button, icon] = parts('alone')
    expect(button!.width).toBe(button!.height)
    expect(icon!.width).toBe(16)
    expect(icon!.height).toBe(16)
    expect(icon!.left - button!.left).toBe(button!.right - icon!.right)
    expect(icon!.top - button!.top).toBe(button!.bottom - icon!.bottom)
  } finally {
    handle.dispose()
  }
})

test('beside words, the icon keeps the same size and comes first', async () => {
  const handle = await mount()
  try {
    const [button, icon] = parts('beside')
    expect(icon!.width).toBe(16)
    expect(button!.width).toBeGreaterThan(icon!.width + 20)
  } finally {
    handle.dispose()
  }
})

test('a glyph drawn as text shows in an icon-only button too', async () => {
  const handle = await mount()
  try {
    const words = document.createRange()
    words.selectNodeContents(document.getElementById('text')!.querySelector('button span span')!)
    expect(words.getBoundingClientRect().width).toBeGreaterThan(8)
  } finally {
    handle.dispose()
  }
})
