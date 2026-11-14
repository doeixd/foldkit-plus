/**
 * The sortable listbox: `Reorder.routed` hands back its keys as a route, listed
 * first in the one `Keys` owner of the container's `keydown`, beside Space
 * (select) and `ListNavigation`'s arrows. Before a grab the route answers only
 * its grab chord, so the arrows navigate; while a row is held it takes them.
 */
import { Option } from 'effect'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { FocusRecovery, ListNavigation, Reorder, Selection } from 'foldkit-primitives/interaction'
import { active, control, focus, panel, t } from '../style.js'
import { Message, Nav, Picks, Rows, currentOf, navArgs, pickArgs, type Model } from './app.js'

const { Keys } = Behaviors

export const SortableSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  option: Slot.make({ capability: Capability.Focusable, events: [Event.Focus, Event.Blur] }),
})

const Sortable = SlotView.over(SortableSlots)<Model, Message>()

const rowsByModel = new WeakMap<Model, Behaviors.Collection.Items<string>>()

/** The rows as one Collection, built once per Model: every row a Behavior draws asks for it. */
export const itemsOf = (model: Model): Behaviors.Collection.Items<string> => {
  const known = rowsByModel.get(model)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(model.ids, { id: id => id })
  rowsByModel.set(model, items)
  return items
}

export const Sorting = Reorder.behavior(Rows)(Sortable)({
  container: 'list',
  item: 'option',
  handle: Reorder.routed,
  items: model => model.ids,
  current: currentOf,
  grab: [Keys.chord('Enter', { alt: true })],
})

/** Space selects the row the keyboard is on, unless typeahead is mid-word. */
const selects = Keys.route<Model, Message>('Select', {
  on: [Keys.chord(' ')],
  handle: ({ input }) =>
    input.nav.query === ''
      ? Option.map(currentOf(input), id => Message.Selected({ id }))
      : Option.none(),
})

const navigates = ListNavigation.keys(
  Nav,
  navArgs,
)<Model, Message>({
  items: itemsOf,
  text: (model, index) => model.ids[index] ?? '',
})

/** The roving stop: `ListNavigation`'s item half, since its key half is in the router above. */
const RovingStop = ListNavigation.item(Nav, navArgs)(Sortable)({ item: 'option', items: itemsOf })

export const SortableStyle = Style.forSlots(SortableSlots)(
  {
    list: Style.compose(
      panel,
      Style.self({ margin: '0', padding: '0', listStyle: 'none', inlineSize: '16rem' }),
    ),
    option: Style.compose(
      Style.self({ padding: `${t.space.xs} ${t.space.sm}`, cursor: 'pointer' }),
      focus,
      active,
      Style.pseudo('[data-reorder="held"]', { outline: `2px dashed ${t.outline.focus}` }),
      Style.pseudo('[data-reorder-over="before"]', {
        boxShadow: `inset 0 2px 0 ${t.outline.focus}`,
      }),
      Style.pseudo('[data-reorder-over="after"]', {
        boxShadow: `inset 0 -2px 0 ${t.outline.focus}`,
      }),
    ),
  },
  { name: 'SortableStyle' },
)

export const SortableListbox = Sortable.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([h.Role('listbox'), h.AriaLabel('Priorities')]),
    model.ids.map((id, index) =>
      h.li(slots.option.attrs([h.Key(id), h.Role('option')], { index, id }), [id]),
    ),
  ),
).pipe(
  Behavior.attach(
    Keys.behavior(Sortable)({
      slot: 'list',
      routes: [Keys.first(Sorting.keys, Keys.first(selects, navigates))],
    }),
  ),
  Behavior.attach(Sorting.behavior),
  Behavior.attach(
    Selection.behavior(Picks, pickArgs)(Sortable)({
      container: 'list',
      item: 'option',
      items: itemsOf,
    }),
  ),
  Behavior.attach(Behaviors.Collection.behavior(Sortable)({ item: 'option', items: itemsOf })),
  Behavior.attach(RovingStop),
  // A keyed move takes the row out and back, and the browser drops the focus it held.
  Behavior.attach(FocusRecovery.behavior(Sortable)({ owner: 'list', parts: { option: ['same'] } })),
  Style.attach(SortableStyle),
)
