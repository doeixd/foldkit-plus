/**
 * Compile-time contract of Reorder: a placement must handle the facts, the
 * Behavior's slots are slots of the contract, the view's input holds the
 * placed slice, a route on a container names the item it picks up, and the
 * options read the view's input. Type-checked, not executed.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { Reorder } from '../src/interaction/index.js'

const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Model = Schema.Struct({ ...Rows.fields, ids: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Rows.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

// @ts-expect-error `onOut` is required: the placement says what a drop does.
Page.at(Rows)

Page.at(Rows, {
  onOut: (fact: Reorder.OutMessage) => (model: Model) =>
    Reorder.OutMessage.match(fact, {
      Moved: moved => ({ model: { ...model, ids: Reorder.apply(model.ids, moved) } }),
      PickedUp: () => ({ model }),
      PassedOver: ({ over }) => {
        const place: Option.Option<Reorder.Place> = over
        void place
        return { model }
      },
      PutBack: () => ({ model }),
    }),
})

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable, events: [Event.Blur, Event.KeyDown] }),
  grip: Slot.make({ capability: Capability.Focusable, events: [Event.Blur, Event.KeyDown] }),
})
const List = SlotView.over(ListSlots)<Model, Message>()

const withGrip = Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  handle: 'grip',
  items: input => input.ids,
})
void withGrip

const routedRows = Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  handle: Reorder.routed,
  items: input => input.ids,
  orientation: 'horizontal',
  direction: () => 'rtl',
})
void routedRows

Reorder.behavior(Rows)(List)({
  // @ts-expect-error a container the contract does not publish.
  container: 'nope',
  item: 'row',
  handle: 'grip',
  items: input => input.ids,
})

Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  // @ts-expect-error a handle that is neither a slot nor `Reorder.routed`.
  handle: 'routed',
  items: input => input.ids,
})

Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  handle: 'grip',
  // @ts-expect-error items are ids.
  items: () => [1, 2],
})

Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  handle: 'grip',
  items: input => input.ids,
  // @ts-expect-error an orientation that is not one of the three.
  orientation: 'diagonal',
})

interface Elsewhere {
  readonly other: Reorder.Model
  readonly ids: ReadonlyArray<string>
}
const Unplaced = SlotView.over(ListSlots)<Elsewhere, Message>()
// @ts-expect-error the view's input does not hold the placed `rows` slice.
Reorder.behavior(Rows)(Unplaced)

const route: Behaviors.Keys.Route<Model, Message> = Reorder.keys(Rows)<Model, Message>({
  items: input => input.ids,
  current: input => Option.fromNullishOr(input.ids[0]),
  parent: () => Option.none(),
  accepts: (input, id) => input.ids.includes(id),
})
void route

// @ts-expect-error a route on a container must say which item a key picks up.
Reorder.keys(Rows)<Model, Message>({ items: input => input.ids })

Reorder.keys(Rows)<Model, Message>({
  items: input => input.ids,
  // @ts-expect-error `current` answers an Option, not a bare id.
  current: input => input.ids[0],
})
