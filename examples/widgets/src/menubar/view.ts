/**
 * The bar as one SlotView: one Collection description over the menu names
 * feeds identity and the `RovingTabindex` Behavior across the triggers;
 * another over the open menu's items feeds identity, `ListNavigation`, and
 * `Selection` (aria only — clicks are the parent's `ChoseItem`). The popup
 * is the `Overlay.nonModal` policy. Its layer id is the dismiss attribute,
 * not an element id. `PlaceAt` puts the popup under the open trigger.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import {
  ListNavigation,
  Overlay,
  Placing,
  RovingTabindex,
  Selection,
} from 'foldkit-primitives/interaction'
import { menubarStyle } from '../style.js'
import {
  NAMES,
  Nav,
  Roving,
  Sel,
  Stack,
  Message,
  initial,
  itemElementId,
  itemsOf,
  navArgs,
  rovingArgs,
  selArgs,
  textOf,
  triggerId,
  update,
  type Model,
} from './app.js'

export const MenubarSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Focusable }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeMenus = () =>
  Behaviors.Collection.of(NAMES, {
    id: name => triggerId(name),
  })

const describeItems = (model: Model) =>
  Behaviors.Collection.of(itemsOf(model.openMenu), {
    id: item => (Option.isSome(model.openMenu) ? itemElementId(model.openMenu.value, item) : item),
  })

const MenuIds = Behaviors.Collection.behavior(MenubarSlots)<Model, Message>({
  item: 'trigger',
  items: () => describeMenus(),
})

const Rove = RovingTabindex.behavior(Roving, rovingArgs)(MenubarSlots)<Model, Message>({
  container: 'bar',
  item: 'trigger',
  items: () => describeMenus(),
})

const ItemIds = Behaviors.Collection.behavior(MenubarSlots)<Model, Message>({
  item: 'item',
  items: input => describeItems(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(MenubarSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: input => describeItems(input),
  text: (input, index) => itemsOf(input.openMenu)[index] ?? '',
})

const Picks = Selection.behavior(Sel, selArgs)(MenubarSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: input => describeItems(input),
  click: false,
})

export const MenubarOverlay = Overlay.behaviors(MenubarSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'popup',
  trigger: 'trigger',
  id: input => `menubar-menu-${textOf(input.openMenu)}`,
  policy: Overlay.nonModal,
})

export const Menubar = SlotView.forMessages<Message>()
  .define(MenubarSlots, (model: Model, slots, h) => {
    const menus = describeMenus()
    const items = describeItems(model)
    const shown = itemsOf(model.openMenu)
    const menu = model.openMenu
    // The popup stays inside the bar's element so the layer stack reads one
    // subtree, but absolute positioning takes it out of the flex row: it
    // overlays what follows instead of stretching the bar. The choice line
    // sits below the bar for the same reason.
    return h.div(
      [],
      [
        h.div(slots.bar.attrs([h.Role('menubar')]), [
          ...NAMES.map((name, index) =>
            h.button(
              slots.trigger.attrs(
                [
                  h.Key(name),
                  h.AriaHasPopup('menu'),
                  h.AriaExpanded(Option.isSome(menu) && menu.value === name),
                  h.OnClick(Message.OpenedMenu({ menu: name })),
                ],
                menus.slotItem(index),
              ),
              [name],
            ),
          ),
          ...Option.match(menu, {
            onNone: () => [],
            onSome: name => [
              h.div(
                slots.popup.attrs([h.Key(`popup:${name}`), h.Role('menu'), h.AriaLabel(name)]),
                shown.map((item, index) =>
                  h.button(
                    slots.item.attrs(
                      [h.Key(item), h.OnClick(Message.ChoseItem({ item }))],
                      items.slotItem(index),
                    ),
                    [item],
                  ),
                ),
              ),
            ],
          }),
        ]),
        ...(Option.isNone(model.choice) ? [] : [h.p([], [`Last choice: ${model.choice.value}.`])]),
      ],
    )
  })
  .pipe(
    Behavior.attach(MenuIds),
    Behavior.attach(Rove),
    Behavior.attach(ItemIds),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...MenubarOverlay.map(Behavior.attach),
    Behavior.attach(
      Placing.placeAtTrigger(MenubarSlots)<Model, Message>({
        panel: 'popup',
        triggerId: input => (Option.isSome(input.openMenu) ? triggerId(input.openMenu.value) : ''),
      }),
    ),
    Behavior.attach(Placing.keepWithin(MenubarSlots)({ panel: 'popup' })),
    Style.attach(menubarStyle(MenubarSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${textOf(model.openMenu)} choice=${textOf(model.choice)}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.OpenedMenu({ menu: 'Edit' })).model
  lines.push(`opened Edit: ${show()}`)
  model = update(model, Message.ChoseItem({ item: 'Copy' })).model
  lines.push(`chose Copy: ${show()}`)
  return lines
}
