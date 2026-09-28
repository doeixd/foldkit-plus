import { Match } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'

import { Menu } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/menu'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { MenuPageSlots, MenuPageStyle } from '../style/menu.js'

type MenuItem = 'Edit' | 'Duplicate' | 'Archive' | 'Move' | 'Delete'

const ActionMenu = Menu.create<MenuItem>()

const MENU_ITEMS: ReadonlyArray<MenuItem> = ['Edit', 'Duplicate', 'Archive', 'Move', 'Delete']

type Slots = SlotBuilders<typeof MenuPageSlots, UiMessage>

const menuItemIcon = (item: MenuItem): typeof Icon.pencil =>
  Match.value(item).pipe(
    Match.when('Edit', () => Icon.pencil),
    Match.when('Duplicate', () => Icon.documentDuplicate),
    Match.when('Archive', () => Icon.archiveBox),
    Match.when('Move', () => Icon.arrowRight),
    Match.when('Delete', () => Icon.trash),
    Match.exhaustive,
  )

const isItemDisabled = (item: MenuItem): boolean => item === 'Archive'

const itemGroupKey = (item: MenuItem): string =>
  Match.value(item).pipe(
    Match.when('Delete', () => 'Danger'),
    Match.orElse(() => 'Actions'),
  )

const groupToHeading = (
  groupKey: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Menu.GroupHeading | undefined =>
  Match.value(groupKey).pipe(
    Match.when('Danger', () => ({
      content: h.span(slots.groupHeading.attrs(), ['Danger Zone']),
    })),
    Match.orElse(() => undefined),
  )

const MENU_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

/** The Basic and Animated demos differ only in their items' Slot. */
const menuViewConfig = (
  itemsSlot: Slots['items' | 'animatedItems'],
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
) => ({
  anchor: MENU_ANCHOR,
  items: MENU_ITEMS,
  itemToConfig: (item: MenuItem) => ({
    content: h.div(slots.itemContent.attrs(), [
      menuItemIcon(item)(slots.itemIcon.attrs(), h),
      h.span(slots.itemLabel.attrs(), [item]),
    ]),
  }),
  isItemDisabled,
  buttonContent: h.div(slots.buttonContent.attrs(), [
    h.span(slots.buttonLabel.attrs(), ['Actions']),
    Icon.chevronDown(slots.chevron.attrs(), h),
  ]),
  buttonAttributes: childAttributes(slots.button.attrs()),
  itemsAttributes: childAttributes(itemsSlot.attrs()),
  backdropAttributes: childAttributes(slots.backdrop.attrs()),
  attributes: childAttributes(slots.menu.attrs()),
  itemGroupKey,
  groupToHeading: (groupKey: string) => groupToHeading(groupKey, slots, h),
})

const menuDemo = (
  menu: Menu.Model,
  itemsSlot: Slots['items' | 'animatedItems'],
  toParentMessage: (message: Menu.Message) => UiMessage,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.label(slots.fieldLabel.attrs([h.For(Menu.buttonId(menu.id))]), ['Row actions']),
  h.div(slots.anchor.attrs(), [
    h.submodel({
      slotId: menu.id,
      model: menu,
      view: ActionMenu.view,
      viewInputs: menuViewConfig(itemsSlot, slots, h),
      toParentMessage,
    }),
  ]),
]

const MenuPage = SlotView.forMessages<UiMessage>()
  .define(MenuPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Menu']),

      h.h3(slots.section.attrs(), ['Basic']),
      ...menuDemo(
        model.menuBasicDemo,
        slots.items,
        message => UiMessage.GotMenuBasicDemoMessage({ message }),
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Animated']),
      ...menuDemo(
        model.menuAnimatedDemo,
        slots.animatedItems,
        message => UiMessage.GotMenuAnimatedDemoMessage({ message }),
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(MenuPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(MenuPage)
