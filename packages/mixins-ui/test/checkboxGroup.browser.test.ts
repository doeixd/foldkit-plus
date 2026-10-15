/**
 * A checkbox group on a real runtime, its checked values in the Model: a
 * press on an option's words toggles its box, and drawn as a `list`, checked
 * rows fill and merge where they stand together.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { CheckboxGroup, CheckboxGroupSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({ variant: 'list' }))
const Model = Schema.Struct({ checked: Schema.Array(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly value: string }
const Toggled = (value: string): Message => ({ _tag: 'Toggled', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (checked: ReadonlyArray<string>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'checkbox-group'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    CheckboxGroup.view(
      {
        id: 'alerts',
        legend: 'Send me',
        options: ['Mentions', 'Replies', 'Digest', 'Offers'].map(value => ({
          value,
          label: value,
        })),
        checked: model.checked,
        onToggle: Toggled,
        style,
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { checked } }),
      update: (model: Model, message: Message) => ({
        model: { checked: CheckboxGroup.toggled(model.checked, message.value) },
      }),
      view,
    }),
  )
}

const box = (name: string) => document.getElementById(`alerts-${name}`)!
const row = (name: string) => box(name).parentElement!
const corners = (name: string) => {
  const style = getComputedStyle(row(name))
  return [style.borderStartStartRadius, style.borderEndStartRadius]
}

test("a press on an option's words toggles its box", async () => {
  const handle = mount([])
  try {
    await vi.waitFor(() => expect(box('Replies')).not.toBeNull())
    document.querySelector<HTMLLabelElement>('label[for="alerts-Replies"]')!.click()
    await vi.waitFor(() => expect(box('Replies').getAttribute('aria-checked')).toBe('true'))
    box('Replies').click()
    await vi.waitFor(() => expect(box('Replies').getAttribute('aria-checked')).toBe('false'))
  } finally {
    handle.dispose()
  }
})

test('checked rows in a list fill, and merge where they stand together', async () => {
  const handle = mount(['Mentions', 'Replies', 'Offers'])
  try {
    await vi.waitFor(() => expect(box('Offers')).not.toBeNull())
    const fill = (name: string) => getComputedStyle(row(name)).backgroundColor
    expect(fill('Mentions')).toBe(fill('Offers'))
    expect(fill('Digest')).not.toBe(fill('Mentions'))
    const [round] = corners('Offers')
    expect(round).not.toBe('0px')
    // Mentions and Replies are one block: square between them, round outside.
    expect(corners('Mentions')).toEqual([round, '0px'])
    expect(corners('Replies')).toEqual(['0px', round])
    expect(corners('Offers')).toEqual([round, round])
  } finally {
    handle.dispose()
  }
})
