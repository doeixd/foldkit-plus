/**
 * A checkbox group on a real runtime, its checked values in the Model: a
 * press on an option's words toggles its box, and drawn as a `list`, checked
 * rows fill and merge where they stand together.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { CheckboxGroup, CheckboxGroupSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const list = Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({ variant: 'list' }))
const horizontal = Style.forSlots(CheckboxGroupSlots)(
  Recipes.CheckboxGroup({ orientation: 'horizontal' }),
)
const Model = Schema.Struct({ checked: Schema.Array(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly value: string }
const Toggled = (value: string): Message => ({ _tag: 'Toggled', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (checked: ReadonlyArray<string>, style: typeof list = list) => {
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

test('a horizontal group lays its options in a row', async () => {
  const handle = mount([], horizontal)
  try {
    await vi.waitFor(() => expect(box('Replies')).not.toBeNull())
    const mentions = row('Mentions').getBoundingClientRect()
    const replies = row('Replies').getBoundingClientRect()
    expect(Math.abs(replies.top - mentions.top)).toBeLessThan(1)
    expect(replies.left).toBeGreaterThan(mentions.right)
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
    // Flush: a gap would open the block the squared corners are one of.
    const mentions = row('Mentions').getBoundingClientRect()
    const replies = row('Replies').getBoundingClientRect()
    expect(Math.abs(replies.top - mentions.bottom)).toBeLessThan(0.5)
  } finally {
    handle.dispose()
  }
})

const plain = Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({}))
const Picked = defineMessageUnion({
  Toggled: { value: Schema.String },
  Set: { values: Schema.Array(Schema.String) },
})
type Picked = typeof Picked.Type

/** A plain group under a select-all row, its Offers disabled and checked. */
const mountAll = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + plain.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'checkbox-group-all'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { checked: ['Offers'] } }),
      update: (model: Model, message: Picked) => ({
        model: {
          checked: Picked.match(message, {
            Toggled: ({ value }) => CheckboxGroup.toggled(model.checked, value),
            Set: ({ values }) => values,
          }),
        },
      }),
      view: (model: Model, h: HtmlBuilder<Picked>) =>
        CheckboxGroup.view(
          {
            id: 'alerts',
            legend: 'Send me',
            options: [
              { value: 'Mentions', label: 'Mentions', description: 'When someone names you.' },
              { value: 'Replies', label: 'Replies' },
              { value: 'Digest', label: 'Digest' },
              { value: 'Offers', label: 'Offers', disabled: true },
            ],
            checked: model.checked,
            onToggle: value => Picked.Toggled({ value }),
            selectAll: { label: 'Every alert', onSet: values => Picked.Set({ values }) },
            style: plain,
          },
          h,
        ),
    }),
  )
}

const checkedNow = () =>
  ['Mentions', 'Replies', 'Digest', 'Offers'].filter(
    name => box(name).getAttribute('aria-checked') === 'true',
  )

test('select-all checks and clears every enabled option, and a disabled one keeps its state', async () => {
  const handle = mountAll()
  try {
    await vi.waitFor(() => expect(box('-all')).not.toBeNull())
    expect(box('-all').getAttribute('aria-checked')).toBe('false')
    box('-all').click()
    await vi.waitFor(() =>
      expect(checkedNow()).toEqual(['Mentions', 'Replies', 'Digest', 'Offers']),
    )
    expect(box('-all').getAttribute('aria-checked')).toBe('true')
    box('-all').click()
    await vi.waitFor(() => expect(checkedNow()).toEqual(['Offers']))
    box('Replies').click()
    await vi.waitFor(() => expect(box('-all').getAttribute('aria-checked')).toBe('mixed'))
  } finally {
    handle.dispose()
  }
})

test('the rows stand one gap apart, under the legend and in from the select-all box', async () => {
  const handle = mountAll()
  try {
    await vi.waitFor(() => expect(box('Offers')).not.toBeNull())
    const legend = document.querySelector('legend')!.getBoundingClientRect()
    // The words, not the rows: a row taller than its words would read as a wider gap.
    const words = ['-all', 'Mentions', 'Replies', 'Digest', 'Offers'].map(name => {
      const parts = Array.from(row(name).children)
        .filter(part => part !== box(name))
        .map(part => part.getBoundingClientRect())
      return {
        top: Math.min(...parts.map(part => part.top)),
        bottom: Math.max(...parts.map(part => part.bottom)),
      }
    })
    const gaps = [
      words[0]!.top - legend.bottom,
      ...words.slice(1).map((each, at) => each.top - words[at]!.bottom),
    ]
    expect(gaps[0]).toBeGreaterThan(0)
    for (const gap of gaps) expect(Math.abs(gap - gaps[0]!)).toBeLessThan(0.5)
    const all = box('-all').getBoundingClientRect()
    const mentions = box('Mentions').getBoundingClientRect()
    expect(mentions.left - all.left).toBeGreaterThanOrEqual(all.width)
  } finally {
    handle.dispose()
  }
})

test("a disabled option's words dim with its box, and an enabled one's do not", async () => {
  const handle = mountAll()
  try {
    await vi.waitFor(() => expect(box('Offers')).not.toBeNull())
    const opacity = (name: string) =>
      getComputedStyle(document.querySelector(`label[for="alerts-${name}"]`)!).opacity
    expect(opacity('Offers')).toBe('0.5')
    expect(opacity('Digest')).toBe('1')
  } finally {
    handle.dispose()
  }
})
