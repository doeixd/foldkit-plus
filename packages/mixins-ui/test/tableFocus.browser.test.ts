/**
 * Focus stays on the same control when a sort moves the rows. A keyed row that moves is
 * taken out of the tree and put back, which blurs what was inside it; with
 * `FocusRecovery.behavior` on the table's frame, the control (marked a part, keyed by its
 * row) is found again at its new place.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { SlotView } from 'foldkit-mixins'
import { FOCUS_MARK } from 'foldkit-primitives/dom'
import { FocusRecovery } from 'foldkit-primitives/interaction'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Table } from '../src/index.js'

type Fruit = { readonly name: string; readonly price: number }
const fruit: ReadonlyArray<Fruit> = [
  { name: 'Cherry', price: 3 },
  { name: 'Apple', price: 2 },
  { name: 'Banana', price: 1 },
]

const Model = Schema.Struct({
  sorted: Schema.Boolean,
  expanded: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Sorted: {}, Toggled: { name: Schema.String } })
type Message = typeof Message.Type

afterEach(() => {
  document.body.replaceChildren()
})

const mount = (recover: boolean) => {
  const container = document.createElement('div')
  container.id = 'table-focus'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { sorted: false, expanded: [] } }),
      update: (model: Model, message: Message) => ({
        model: Message.match(message, {
          Sorted: () => ({ ...model, sorted: !model.sorted }),
          Toggled: ({ name }) => ({
            ...model,
            expanded: model.expanded.includes(name)
              ? model.expanded.filter(each => each !== name)
              : [...model.expanded, name],
          }),
        }),
      }),
      view: (model: Model, h: HtmlBuilder<Message>) => {
        const rows = model.sorted ? [...fruit].sort((a, b) => a.price - b.price) : fruit
        return Table.view(
          {
            columns: [
              {
                header: 'Name',
                sortKey: 'price',
                value: row =>
                  h.button(
                    [
                      h.Type('button'),
                      h.Id(`open-${row.name}`),
                      h.DataAttribute(FOCUS_MARK.part, 'control'),
                      h.DataAttribute(FOCUS_MARK.key, row.name),
                    ],
                    [row.name],
                  ),
              },
            ],
            rows,
            rowKey: row => row.name,
            sort: {
              by: Option.none(),
              onSort: () => Message.Sorted(),
            },
            expansion: {
              id: 'fruit',
              isExpanded: row => model.expanded.includes(row.name),
              onToggle: row => Message.Toggled({ name: row.name }),
              detail: row => h.div([], [row.name]),
            },
            mixins: recover
              ? [
                  FocusRecovery.behavior(Table.TableSlots)<undefined, Message>({
                    owner: 'frame',
                    parts: { control: ['same'], expandButton: ['same'], sortButton: ['same'] },
                  }).mixin,
                ]
              : [],
          },
          h,
        )
      },
    }),
  )
}

const byId = (id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`no #${id}`)
  return found
}
const heading = () => {
  const found = document.querySelector<HTMLElement>('thead button')
  if (found === null) throw new Error('no heading button')
  return found
}
const firstExpand = () => {
  const found = document.querySelector<HTMLElement>('tbody button[aria-expanded]')
  if (found === null) throw new Error('no expand button')
  return found
}

test('without recovery, a sort drops the focus of a control in a moved row', async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => byId('open-Cherry'))
    byId('open-Cherry').focus()
    heading().click()
    await vi.waitFor(() =>
      expect([...document.querySelectorAll('tbody th, tbody td')].length).toBeGreaterThan(0),
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(document.body))
  } finally {
    handle.dispose()
  }
})

test('a control the application draws keeps focus when a sort moves its row', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => byId('open-Cherry'))
    byId('open-Cherry').focus()
    heading().click()
    await vi.waitFor(() =>
      expect(document.querySelector('tbody tr:first-child')?.textContent).toContain('Banana'),
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(byId('open-Cherry')))
  } finally {
    handle.dispose()
  }
})

test('the open button of a moved row keeps focus', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => firstExpand())
    const rows = () => [...document.querySelectorAll<HTMLElement>('tbody tr')]
    rows()[0]?.querySelector<HTMLElement>('button[aria-expanded]')?.focus()
    heading().click()
    await vi.waitFor(() =>
      expect(document.querySelector('tbody tr:first-child')?.textContent).toContain('Banana'),
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        rows().at(-1)?.querySelector('button[aria-expanded]') ?? null,
      ),
    )
  } finally {
    handle.dispose()
  }
})

test('the heading keeps focus when it is the control pressed', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => heading())
    await userEvent.click(heading())
    await vi.waitFor(() =>
      expect(document.querySelector('tbody tr:first-child')?.textContent).toContain('Banana'),
    )
    expect(document.activeElement).toBe(heading())
  } finally {
    handle.dispose()
  }
})
