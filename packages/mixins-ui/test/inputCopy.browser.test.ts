/**
 * InputCopy in a real browser: the input and the button round their outer
 * corners to the group's corner inside its border, so the rings drawn inset
 * on them follow the curve the group clips to.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { InputCopy, InputCopySlots, Recipes } from '../src/index.js'
import { message, type TestMessage } from './fixture.js'

const Model = Schema.Struct({})
// A palette too: a border in a color the page lacks is invalid, and draws nothing.
const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const named = Style.forSlots(InputCopySlots)(Recipes.InputCopy({}))

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    named.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'input-copy-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: TestMessage) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<TestMessage>) =>
        InputCopy.view(
          {
            id: 'token',
            label: 'Token',
            value: 'sk-1234',
            copied: false,
            onCopy: message('Clicked'),
            style: named,
          },
          h,
        ),
    }),
  )
}

const px = (value: string) => parseFloat(value)

test("the input's and the button's outer corners are the group's, less its border", async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('token-input')).not.toBeNull())
    const input = getComputedStyle(document.getElementById('token-input')!)
    const button = getComputedStyle(document.getElementById('token-button')!)
    const group = getComputedStyle(document.getElementById('token-input')!.parentElement!)
    const inner = px(group.borderTopLeftRadius) - px(group.borderTopWidth)
    expect(inner).toBeGreaterThan(0)
    for (const corner of [
      input.borderStartStartRadius,
      input.borderEndStartRadius,
      button.borderStartEndRadius,
      button.borderEndEndRadius,
    ]) {
      expect(px(corner)).toBeCloseTo(inner, 1)
    }
    // The corners between them meet square.
    expect(px(input.borderStartEndRadius)).toBe(0)
    expect(px(button.borderStartStartRadius)).toBe(0)
  } finally {
    handle.dispose()
  }
})
