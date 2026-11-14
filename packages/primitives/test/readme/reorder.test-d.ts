/**
 * The `Reorder` example from the interaction README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { FocusRecovery, LiveAnnounce, Reorder } from '../../src/interaction/index.js'

const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Live = Bundle.declare(LiveAnnounce.bundle, 'live')
const Model = Schema.Struct({ ...Rows.fields, ...Live.fields, ids: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Rows.cases, ...Live.cases })
type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const Announcer = Parent.at(Live, { args: { debounceMs: 150, clearAfterMs: 5000 } })
const assembly = Parent.assemble(
  Announcer,
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => {
      const moved = Reorder.OutMessage.match(fact, {
        Moved: move => modifyFields(model, { ids: ids => Reorder.apply(ids, move) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      })
      return Announcer.helpers.announce(Reorder.announcement(fact, { label: id => id }))(moved)
    },
  }),
)

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Base }),
  grip: Slot.make({ capability: Capability.Focusable, events: [Event.KeyDown, Event.Blur] }),
})
const List = SlotView.over(ListSlots)<Model, Message>()

const SortableList = List.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([]),
    model.ids.map((id, index) =>
      h.li(slots.row.attrs([h.Key(id)], { index, id }), [
        h.button(slots.grip.attrs([h.Type('button')], { index, id }), [id]),
      ]),
    ),
  ),
).pipe(
  Behavior.attach(
    Reorder.behavior(Rows)(List)({
      container: 'list',
      item: 'row',
      handle: 'grip',
      items: model => model.ids,
    }),
  ),
  // A keyed move takes the element out and back, and the browser drops its focus.
  Behavior.attach(FocusRecovery.behavior(List)({ owner: 'list', parts: { grip: ['same'] } })),
)

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main([], [SortableList(model, h), LiveAnnounce.view(model.live, h)])
void assembly
void view
