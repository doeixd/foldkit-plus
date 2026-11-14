/**
 * A listbox assembled from Behaviors that say what they supply, for the
 * obligation tests. A primitive's factory states its supplied names from the
 * slots it was given; these hand-written ones state them by annotation.
 */
import { A11y, Attr, Behavior, Capability, Event, Slot, Slots, SlotView } from '../src/index.js'
import type { TestMessage } from './resolverFixture.js'

export const ListSlots = Slots.define({
  listbox: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  option: Slot.make({ capability: Capability.Focusable, attributes: [Attr.AriaSelected] }),
  clear: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

export interface ListInput {
  readonly ids: ReadonlyArray<string>
}

export const Listbox = A11y.pattern({
  listbox: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  option: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

export const List = SlotView.over(ListSlots)<ListInput, TestMessage>()

export const Nav: Behavior.NamedBehavior<
  typeof ListSlots,
  ListInput,
  TestMessage,
  'listbox/navigation' | 'option/focus-strategy'
> = List.behavior(
  {
    listbox: Behavior.slot({ provides: [A11y.Navigation] }),
    option: Behavior.slot({ provides: [A11y.FocusStrategy] }),
  },
  { name: 'Nav' },
)

export const Picks: Behavior.NamedBehavior<
  typeof ListSlots,
  ListInput,
  TestMessage,
  'option/activation' | 'option/state:aria-selected'
> = List.behavior(
  { option: Behavior.slot({ provides: [A11y.Activation, A11y.State(Attr.AriaSelected)] }) },
  { name: 'Picks' },
)

/** Supplies nothing a listbox owes. */
export const Clears = List.behavior(
  { clear: Behavior.slot({ attributes: ({ h }) => [h.OnClick({ _tag: 'Clicked' })] }) },
  { name: 'Clears' },
)

export const bare = List.define((input, slots, h) =>
  h.div(
    [],
    [
      h.ul(
        slots.listbox.attrs(),
        input.ids.map((id, index) => h.li(slots.option.attrs([], { id, index }), [id])),
      ),
      h.button(slots.clear.attrs(), ['Clear']),
    ],
  ),
)

export const Named = A11y.base({ listbox: [A11y.Name] })
