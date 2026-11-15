/**
 * A listbox assembled on a binder from the shipped primitives, for the
 * obligation tests: each factory states what it supplies from the slot names
 * it was given, so the widget restates none of it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { A11y, Attr, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import {
  GridNavigation,
  ListNavigation,
  Press,
  RovingTabindex,
  Selection,
  TreeNavigation,
} from '../src/interaction/index.js'

export const List = Bundle.declare(ListNavigation.bundle, 'list')
export const Roving = Bundle.declare(RovingTabindex.bundle, 'roving')
export const Tree = Bundle.declare(TreeNavigation.bundle, 'tree')
export const Grid = Bundle.declare(GridNavigation.bundle, 'grid')
export const Sel = Bundle.declare(Selection.bundle, 'selection')
export const Pressing = Bundle.declare(Press.bundle, 'press')

export const Message = defineMessageUnion({
  ...List.cases,
  ...Roving.cases,
  ...Tree.cases,
  ...Grid.cases,
  ...Sel.cases,
  ...Pressing.cases,
  Cleared: { id: Schema.String },
})
export type Message = typeof Message.Type

export const ListboxSlots = Slots.define({
  listbox: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  option: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Click],
    attributes: [Attr.AriaSelected],
  }),
  toggle: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
})

export interface Input {
  readonly list: ListNavigation.Model
  readonly roving: RovingTabindex.Model
  readonly tree: TreeNavigation.Model
  readonly grid: GridNavigation.Model
  readonly selection: Selection.Model
  readonly press: Press.Model
  readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>
}

export const Listbox = A11y.pattern({
  listbox: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  option: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

export const listArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 10,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Options = SlotView.over(ListboxSlots)<Input, Message>()

export const itemsOf = (input: Input) =>
  Behaviors.Collection.of(input.options, { id: option => option.id })

export const Keys = ListNavigation.behavior(List, listArgs)(Options)({
  container: 'listbox',
  item: 'option',
  items: itemsOf,
  text: (input, index) => input.options[index]?.label ?? '',
})

export const Picks = Selection.behavior(Sel, selArgs)(Options)({
  item: 'option',
  items: itemsOf,
})

export const Named = A11y.base({ listbox: [A11y.Name] })

export const bare = Options.define((input, slots, h) =>
  h.ul(
    slots.listbox.attrs([h.AriaLabel('Fruit')]),
    input.options.map((option, index) =>
      h.li(slots.option.attrs([], { id: option.id, index }), [option.label]),
    ),
  ),
)
