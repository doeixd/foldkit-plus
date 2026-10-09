/**
 * The menu as one SlotView: file rows open it with `OnContextMenu`, and one
 * shared Collection description of the actions feeds identity,
 * `ListNavigation`, and `Selection` (aria only — clicks are the parent's
 * `ChoseAction`). The popup opens under the row: `OnContextMenu` carries no
 * pointer coordinates, so it cannot sit at the cursor. The popup is the
 * `Overlay.nonModal` policy. Its layer id is the dismiss attribute, not an
 * element id.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Placing, Selection } from 'foldkit-primitives/interaction'
import { contextMenuStyle } from '../style.js'
import {
  ACTIONS,
  FILES,
  Nav,
  Sel,
  Stack,
  Message,
  actionId,
  initial,
  navArgs,
  rowId,
  selArgs,
  textOf,
  update,
  type Model,
} from './app.js'

export const ContextMenuSlots = Slots.define({
  files: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Interactive }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeActions = () =>
  Behaviors.Collection.of(ACTIONS, {
    id: action => actionId(action),
  })

const Ids = Behaviors.Collection.behavior(ContextMenuSlots)<Model, Message>({
  item: 'item',
  items: () => describeActions(),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(ContextMenuSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: () => describeActions(),
  text: (_input, index) => ACTIONS[index] ?? '',
})

const Picks = Selection.behavior(Sel, selArgs)(ContextMenuSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: () => describeActions(),
  click: false,
})

export const ContextMenuOverlay = Overlay.behaviors(ContextMenuSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'popup',
  id: () => 'context-menu-file',
  policy: Overlay.nonModal,
})

export const ContextMenu = SlotView.forMessages<Message>()
  .define(ContextMenuSlots, (model: Model, slots, h) => {
    const items = describeActions()
    return h.div(slots.files.attrs([h.Role('list'), h.AriaLabel('Files')]), [
      ...FILES.map(file =>
        h.div(
          slots.row.attrs([
            h.Key(file),
            h.Id(rowId(file)),
            h.OnContextMenu(Message.OpenedFor({ id: file })),
          ]),
          [file],
        ),
      ),
      ...(Option.isNone(model.openFor)
        ? []
        : [
            h.div(
              slots.popup.attrs([
                h.Key(`popup:${model.openFor.value}`),
                h.Role('menu'),
                h.AriaLabel(`Actions for ${model.openFor.value}`),
              ]),
              ACTIONS.map((action, index) =>
                h.button(
                  slots.item.attrs(
                    [h.Key(action), h.OnClick(Message.ChoseAction({ action }))],
                    items.slotItem(index),
                  ),
                  [action],
                ),
              ),
            ),
          ]),
      ...(Option.isNone(model.action) ? [] : [h.p([], [`Last action: ${model.action.value}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...ContextMenuOverlay.map(Behavior.attach),
    Behavior.attach(
      Placing.placeAtTrigger(ContextMenuSlots)<Model, Message>({
        panel: 'popup',
        triggerId: input => (Option.isSome(input.openFor) ? rowId(input.openFor.value) : ''),
      }),
    ),
    Behavior.attach(Placing.keepWithin(ContextMenuSlots)({ panel: 'popup' })),
    Style.attach(contextMenuStyle(ContextMenuSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `openFor=${textOf(model.openFor)} action=${textOf(model.action)}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.OpenedFor({ id: 'notes.txt' })).model
  lines.push(`right-clicked notes: ${show()}`)
  model = update(model, Message.ChoseAction({ action: 'Rename' })).model
  lines.push(`chose Rename: ${show()}`)
  return lines
}
