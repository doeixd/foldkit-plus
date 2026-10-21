/// <reference types="@vitest/browser-playwright" />
/**
 * A disabled control fades by the theme's `state.disabledOpacity`: the default
 * half, or what a theme sets. Read as computed opacity, since the rule could
 * name the token and a later layer could still overrule it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ButtonSlots, Recipes } from '../src/index.js'

const Model = Schema.Struct({})
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** A disabled button over a sheet of `theme`, drawn at `#disabled-target`. */
const mount = (theme: ReturnType<typeof Theme.standard>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + button.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'disabled-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
    return h.div(
      [],
      [
        h.button(b.button.attrs([h.Type('button'), h.Id('disabled-target'), h.Disabled(true)]), [
          'Save',
        ]),
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

const opacityOf = () =>
  vi.waitFor(() => {
    const element = document.getElementById('disabled-target')
    expect(element).not.toBeNull()
    return Number(getComputedStyle(element!).opacity)
  })

test('a disabled button fades to the default half', async () => {
  const handle = mount(Theme.standard(Theme.make({})))
  try {
    expect(await opacityOf()).toBe(0.5)
  } finally {
    handle.dispose()
  }
})

test('a theme sets how far a disabled button fades', async () => {
  const handle = mount(Theme.standard(Theme.make({ state: { disabledOpacity: 0.7 } })))
  try {
    expect(await opacityOf()).toBe(0.7)
  } finally {
    handle.dispose()
  }
})
