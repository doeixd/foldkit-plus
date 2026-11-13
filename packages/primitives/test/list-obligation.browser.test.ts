/**
 * Arrows, activation, focus and a disabled option in a browser.
 * The obligation check is not this test: a published attribute is not a provider.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ListNavigation } from '../src/interaction/index.js'

const fruits = [
  { id: 'apple', label: 'Apple', disabled: false },
  { id: 'apricot', label: 'Apricot', disabled: true },
  { id: 'banana', label: 'Banana', disabled: false },
] as const

const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Model = Schema.Struct({ ...Nav.fields, chosen: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Nav.cases, Activated: { id: Schema.String } })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Nav, {
  args: { orientation: 'vertical', loop: false, virtual: false, timeoutMs: 500, page: 2 },
})
const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Interactive, events: [] }),
  option: Slot.make({ capability: Capability.Focusable }),
})
interface Input extends Model {
  readonly fruits: typeof fruits
}
const described = Behaviors.Collection.of(fruits, {
  id: fruit => fruit.id,
  disabled: fruit => fruit.disabled,
})
const navigation = ListNavigation.behavior(Nav, {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 2,
})(ListSlots)<Input, Message>({
  container: 'list',
  item: 'option',
  items: () => described,
  text: (_input, index) => fruits[index]?.label ?? '',
  commit: (_input, id) => Message.Activated({ id }),
})

const initial: Model = { nav: { current: null, query: '', generation: 0 }, chosen: '' }

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    GotNavMessage: () => Option.getOrThrow(placed.update(model, message)),
    Activated: ({ id }) => ({ model: { ...model, chosen: id } }),
  })

const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(ListSlots, [navigation.mixin], {
    input: { ...model, fruits },
    h,
  })
  return h.div(
    [],
    [
      h.div(
        builders.list.attrs([h.Id('options'), h.Role('listbox'), h.Tabindex(0)]),
        fruits.map((fruit, index) =>
          h.div(
            builders.option.attrs(
              [
                h.Id(fruit.id),
                h.Role('option'),
                h.AriaSelected(model.nav.current === fruit.id),
                h.AriaDisabled(fruit.disabled),
              ],
              described.slotItem(index),
            ),
            [fruit.label],
          ),
        ),
      ),
      h.div([h.Id('chosen')], [model.chosen]),
    ],
  )
}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

it('moves focus past a disabled option and activates the one that lands', async () => {
  const container = document.createElement('div')
  container.id = 'list-obligation'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view,
      slow: false,
    }),
  ).dispose

  await vi.waitFor(() => expect(document.getElementById('apple')).not.toBeNull())
  expect(document.getElementById('apple')?.tabIndex).toBe(0)
  expect(document.getElementById('apricot')?.tabIndex).toBe(-1)
  expect(document.getElementById('apricot')?.getAttribute('aria-disabled')).toBe('true')
  expect(document.getElementById('apple')?.getAttribute('aria-selected')).toBe('false')

  document.getElementById('apple')?.focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('banana'))
  expect(document.getElementById('apricot')).not.toBe(document.activeElement)
  expect(document.getElementById('banana')?.getAttribute('aria-selected')).toBe('true')
  expect(document.getElementById('apple')?.getAttribute('aria-selected')).toBe('false')

  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.getElementById('chosen')?.textContent).toBe('banana'))
})
