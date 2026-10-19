/**
 * A one-time code on a real runtime: a press on a cell lands in the input
 * laid over them, and what is typed there shows in the cells, kept to digits.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { OtpField, OtpFieldSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(OtpFieldSlots)(Recipes.OtpField({}))
const Model = Schema.Struct({ code: Schema.String })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Typed'; readonly code: string }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'otp-field'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    OtpField.view<Message>(
      {
        label: 'Sign-in code',
        value: model.code,
        onChange: code => ({ _tag: 'Typed', code }),
        groups: [3, 3],
        style,
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { code: '' } }),
      update: (_model: Model, message: Message) => ({ model: { code: message.code } }),
      view,
    }),
  )
}

const cells = () => [...document.querySelectorAll<HTMLElement>('[data-filled]')]

test('a press on a cell lands in the input, and typing fills the cells', async () => {
  const handle = mount()
  try {
    const input = await vi.waitFor(() => {
      const found = document.querySelector<HTMLInputElement>('input')
      expect(found).not.toBeNull()
      return found!
    })
    // Where the third cell is drawn; the press must reach the input, not stop at the cell.
    const box = input.getBoundingClientRect()
    const cell = cells()[2]!.getBoundingClientRect()
    await userEvent.click(input, {
      position: { x: cell.left - box.left + cell.width / 2, y: box.height / 2 },
    })
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('12a3')
    await vi.waitFor(() =>
      expect(cells().map(cell => cell.textContent)).toEqual(['1', '2', '3', '', '', '']),
    )
    expect(input.value).toBe('123')
  } finally {
    handle.dispose()
  }
})
