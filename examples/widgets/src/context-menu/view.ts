/**
 * The menu as one SlotView: file rows open it with `OnContextMenu`, and one
 * shared Collection description of the actions feeds identity,
 * `ListNavigation`, and `Selection` (aria only — clicks are the parent's
 * `ChoseAction`). The popup draws below the file list: pointer-exact
 * positioning would need coordinates the view boundary does not carry, and
 * the `Anchor` Mount that binds to element ids burns ~35s under jsdom's
 * zero geometry (portal or not), so it stays out of the showcase. The popup
 * is the `Overlay.nonModal` policy: Escape and outside press close it, the
 * page stays usable.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Selection } from 'foldkit-primitives/interaction'
import { keepInView } from '../place.js'
import { contextMenuStyle } from '../style.js'
import { ACTIONS, FILES, Nav, Sel, Stack, Message, initial, update, type Model } from './app.js'

export const ContextMenuSlots = Slots.define({
  files: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Interactive }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const describeActions = () =>
  Behaviors.Collection.of(ACTIONS, {
    id: action => action,
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
  id: () => 'file-menu',
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
            h.Id(file),
            h.OnContextMenu(Message.OpenedFor({ id: file })),
          ]),
          [file],
        ),
      ),
      ...(model.openFor === null
        ? []
        : [
            h.div(
              slots.popup.attrs([h.Role('menu'), h.AriaLabel(`Actions for ${model.openFor}`)]),
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
      ...(model.action === null ? [] : [h.p([], [`Last action: ${model.action}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...ContextMenuOverlay.map(Behavior.attach),
    Behavior.attach(keepInView(ContextMenuSlots)({ panel: 'popup' })),
    Style.attach(contextMenuStyle(ContextMenuSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `openFor=${model.openFor} action=${model.action}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.OpenedFor({ id: 'notes.txt' })).model
  lines.push(`right-clicked notes: ${show()}`)
  model = update(model, Message.ChoseAction({ action: 'Rename' })).model
  lines.push(`chose Rename: ${show()}`)
  return lines
}
