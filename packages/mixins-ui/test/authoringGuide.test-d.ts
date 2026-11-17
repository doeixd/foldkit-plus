/**
 * Compile-time claims of the guide's chip filter: a page route sends only the
 * filter's Messages, a style names only its slots, and the assembly is refused
 * by its pattern when a Behavior that supplies an obligation is left out.
 * Type-checked, not executed.
 */
import { Option } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { A11y, Behavior, Behaviors, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation } from 'foldkit-primitives/interaction'
import {
  ChipPattern,
  ChipSlots,
  Nav,
  chipFilter,
  itemsOf,
  navArgs,
  type Message,
  type Model,
} from './authoringGuide.js'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

export const foreignRoute = chipFilter({
  label: 'Filters',
  routes: [
    // @ts-expect-error a page route cannot send a Message the filter does not
    Behaviors.Keys.route('Elsewhere', {
      on: [Behaviors.Keys.chord('x')],
      handle: () => Option.some(Foreign.SentElsewhere()),
    }),
  ],
})

Style.forSlots(ChipSlots)({
  // @ts-expect-error the filter publishes no badge slot
  badge: Style.self({ color: 'red' }),
})

const Filter = SlotView.over(ChipSlots)<Model, Message>()

// Navigation alone: the chips' activation and `aria-selected` have no supplier.
export const unselectable = Filter.define((model, slots, h) =>
  h.ul(slots.list.attrs([h.AriaLabel('Filters')]), []),
).pipe(
  Behavior.attach(
    ListNavigation.behavior(Nav, navArgs)(Filter)({
      container: 'list',
      item: 'chip',
      items: itemsOf,
      text: () => '',
    }),
  ),
  SlotView.attach(A11y.base({ list: [A11y.Name] })),
  // @ts-expect-error 'chip/activation' | 'chip/state:aria-selected' are owed
  A11y.conform(ChipPattern),
)
