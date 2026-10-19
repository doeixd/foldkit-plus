/**
 * A number field on a real runtime, its value in the Model: the arrow keys
 * step it within its bounds, a typed number commits on change, text that is
 * no number leaves the value, and the steppers step it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { NumberField, NumberFieldSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(NumberFieldSlots)(Recipes.NumberField({}))
const Model = Schema.Struct({ value: Schema.Number })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Changed'; readonly value: number }
const Changed = (value: number): Message => ({ _tag: 'Changed', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (value: number) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'number-field'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value } }),
      update: (_: Model, message: Message) => ({ model: { value: message.value } }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        NumberField.view(
          {
            id: 'servings',
            label: 'Servings',
            value: model.value,
            onChange: Changed,
            min: 1,
            max: 12,
            style,
          },
          h,
        ),
    }),
  )
}

const input = () => document.querySelector<HTMLInputElement>('input')!
const shown = () => input().getAttribute('aria-valuenow')

test('the arrow keys step it, and stop at the bounds', async () => {
  const handle = mount(11)
  try {
    await vi.waitFor(() => expect(shown()).toBe('11'))
    input().focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await vi.waitFor(() => expect(shown()).toBe('12'))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(shown()).toBe('1'))
  } finally {
    handle.dispose()
  }
})

test('a typed number commits on change, settled; text that is none leaves it', async () => {
  const handle = mount(3)
  try {
    await vi.waitFor(() => expect(shown()).toBe('3'))
    await userEvent.fill(input(), '40')
    input().blur()
    await vi.waitFor(() => expect(shown()).toBe('12'))
    await userEvent.fill(input(), 'many')
    input().blur()
    await vi.waitFor(() => expect(input().value).toBe('12'))
    expect(shown()).toBe('12')
  } finally {
    handle.dispose()
  }
})

test('the steppers step it', async () => {
  const handle = mount(3)
  try {
    await vi.waitFor(() => expect(shown()).toBe('3'))
    document.querySelector<HTMLButtonElement>('button[aria-label="Increase"]')!.click()
    await vi.waitFor(() => expect(shown()).toBe('4'))
    document.querySelector<HTMLButtonElement>('button[aria-label="Decrease"]')!.click()
    await vi.waitFor(() => expect(shown()).toBe('3'))
  } finally {
    handle.dispose()
  }
})
