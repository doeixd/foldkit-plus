/**
 * The bar as one SlotView: one Collection description over the menu names
 * feeds identity and the `RovingTabindex` Behavior across the triggers;
 * another over the open menu's items feeds identity, `ListNavigation`, and
 * `Selection` (aria only — clicks are the parent's `ChoseItem`). The popup
 * is the `Overlay.nonModal` policy. One menu stands open at a time.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, RovingTabindex, Selection } from 'foldkit-primitives/interaction'
import { menubarStyle } from '../style.js'
import {
  NAMES,
  Nav,
  Roving,
  Sel,
  Stack,
  Message,
  initial,
  itemsOf,
  update,
  type Model,
} from './app.js'

export const MenubarSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Focusable }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const rovingArgs = { orientation: 'horizontal', loop: true, virtual: false } as const
const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const describeMenus = () =>
  Behaviors.Collection.of(NAMES, {
    id: name => name,
  })

const describeItems = (model: Model) =>
  Behaviors.Collection.of(itemsOf(model.openMenu), {
    id: item => `${model.openMenu}/${item}`,
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
  id: input => `menu-${input.openMenu ?? 'none'}`,
  policy: Overlay.nonModal,
})

export const Menubar = SlotView.forMessages<Message>()
  .define(MenubarSlots, (model: Model, slots, h) => {
    const menus = describeMenus()
    const items = describeItems(model)
    const shown = itemsOf(model.openMenu)
    return h.div(slots.bar.attrs([h.Role('menubar')]), [
      ...NAMES.map((name, index) =>
        h.button(
          slots.trigger.attrs(
            [
              h.Key(name),
              h.AriaHasPopup('menu'),
              h.AriaExpanded(model.openMenu === name),
              h.OnClick(Message.OpenedMenu({ menu: name })),
            ],
            menus.slotItem(index),
          ),
          [name],
        ),
      ),
      ...(model.openMenu === null
        ? []
        : [
            h.div(
              slots.popup.attrs([h.Role('menu'), h.AriaLabel(model.openMenu)]),
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
          ]),
      ...(model.choice === null ? [] : [h.p([], [`Last choice: ${model.choice}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(MenuIds),
    Behavior.attach(Rove),
    Behavior.attach(ItemIds),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...MenubarOverlay.map(Behavior.attach),
    Style.attach(menubarStyle(MenubarSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${model.openMenu} choice=${model.choice}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.OpenedMenu({ menu: 'Edit' })).model
  lines.push(`opened Edit: ${show()}`)
  model = update(model, Message.ChoseItem({ item: 'Copy' })).model
  lines.push(`chose Copy: ${show()}`)
  return lines
}
