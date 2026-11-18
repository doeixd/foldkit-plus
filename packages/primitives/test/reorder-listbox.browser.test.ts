/// <reference types="@vitest/browser-playwright" />
/**
 * The interaction README's sortable listbox, run: Space selects the row the
 * keyboard is on, Alt+Enter picks it up, and the arrows walk it once held.
 * The code above the runtime is the README's block, so its claims are this
 * test's.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { ListNavigation, Reorder, RovingTabindex, Selection } from '../src/interaction/index.js'

const { Keys } = Behaviors
const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Picks = Bundle.declare(Selection.bundle, 'picks')
const Model = Schema.Struct({
  ...Rows.fields,
  ...Nav.fields,
  ...Picks.fields,
  ids: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Rows.cases, ...Nav.cases, ...Picks.cases })
type Message = typeof Message.Type

const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 5,
} as const
const pickArgs = { mode: 'single', allowEmpty: false } as const
const Parent = Bundle.parent({ Model, Message })
const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Picks, { args: pickArgs }),
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => ({
      model: Reorder.OutMessage.match(fact, {
        Moved: move => modifyFields(model, { ids: ids => Reorder.apply(ids, move) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      }),
    }),
  }),
)

const ListboxSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  option: Slot.make({ capability: Capability.Focusable, events: [Event.Focus, Event.Blur] }),
})
const Listbox = SlotView.over(ListboxSlots)<Model, Message>()
const items = (model: Model) => Behaviors.Collection.of(model.ids, { id: id => id })

const Sorting = Reorder.behavior(Rows)(Listbox)({
  container: 'list',
  item: 'option',
  handle: Reorder.routed,
  items: model => model.ids,
  current: model => Option.fromNullishOr(model.nav.current),
  grab: [Keys.chord('Enter', { alt: true })],
})
// Space selects the row the keyboard is on, unless typeahead is mid-word.
const select = Keys.route<Model, Message>('Select', {
  on: [Keys.chord(' ')],
  handle: ({ input }) =>
    input.nav.query === ''
      ? Option.map(Option.fromNullishOr(input.nav.current), id =>
          Picks.wrapper.make(Selection.Message.Activated({ id })),
        )
      : Option.none(),
})
const navigation = ListNavigation.keys(
  Nav,
  navArgs,
)<Model, Message>({
  items,
  text: (model, index) => model.ids[index] ?? '',
})

const SortableListbox = Listbox.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([h.Role('listbox'), h.AriaLabel('Priorities')]),
    model.ids.map((id, index) =>
      h.li(slots.option.attrs([h.Key(id), h.Id(id), h.Role('option')], { index, id }), [id]),
    ),
  ),
).pipe(
  Behavior.attach(
    Keys.behavior(Listbox)({
      slot: 'list',
      routes: [Keys.first(Sorting.keys, Keys.first(select, navigation))],
    }),
  ),
  Behavior.attach(Sorting.behavior),
  Behavior.attach(
    Selection.behavior(Picks, pickArgs)(Listbox)({ container: 'list', item: 'option', items }),
  ),
  // The roving tab stop: ListNavigation's item half, since its key half is in the router above.
  Behavior.attach(
    Behavior.forSlots(ListboxSlots)<Model, Message>(
      {
        option: Behavior.slot({
          attributes: ({ input, h, item }) =>
            item === undefined
              ? []
              : RovingTabindex.itemAttributes(h, items(input), input.nav.current, item, false, id =>
                  Nav.wrapper.make(ListNavigation.Message.Focused({ id })),
                ),
        }),
      },
      { name: 'RovingStop' },
    ),
  ),
)

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

it('selects with Space, picks up with Alt+Enter, and drops with Space', async () => {
  const container = document.createElement('div')
  container.id = 'sortable-host'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => assembly.initial({ ids: ['a', 'b', 'c'] }),
        update: assembly.update(model => ({ model })),
        view: (model: Model, h: HtmlBuilder<Message>) => SortableListbox(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
  const row = (id: string) => document.getElementById(id)
  await expect.poll(() => row('a')?.tabIndex).toBe(0)
  row('a')!.focus()
  // The first drawing shows the tab stop before the runtime has started what
  // answers the keys, and on a loaded CI shard the first ArrowDown was lost
  // (2 runs of 3 on 2026-11-18). Press again only while focus has not moved;
  // the interval is longer than the focus Command takes, so no press is doubled.
  await expect
    .poll(
      async () => {
        if (document.activeElement?.id === 'a') await userEvent.keyboard('{ArrowDown}')
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return document.activeElement?.id
      },
      { interval: 250 },
    )
    .toBe('b')
  await userEvent.keyboard(' ')
  await expect.poll(() => row('b')?.getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('[data-reorder]')).toBeNull()
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}')
  await expect.poll(() => row('b')?.dataset['reorder']).toBe('held')
  await userEvent.keyboard('{ArrowDown}')
  await expect.poll(() => row('c')?.dataset['reorderOver']).toBe('after')
  await userEvent.keyboard(' ')
  const order = () => Array.from(document.querySelectorAll('[role="option"]')).map(each => each.id)
  await expect.poll(order).toEqual(['a', 'c', 'b'])
  expect(row('b')?.getAttribute('aria-selected')).toBe('true')
})
