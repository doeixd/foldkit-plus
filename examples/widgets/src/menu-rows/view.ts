/**
 * The shipped Menu with rows that carry a `value`, an `icon` and a `hint`. The
 * Menu's own Model and keys do the work; the application draws the rows from
 * its data and reads the value the Menu reports.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Icon, IconSlots, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { menuRowsStyle } from './style.js'
import { Message, ROWS, pickedRow, type Model } from './app.js'

export const MenuRowsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Container }),
  result: Slot.make({ capability: Capability.Container }),
})

export const MenuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
export const IconStyle = Style.forSlots(IconSlots)(Recipes.Icon({}))
const layout = menuRowsStyle(MenuRowsSlots)

/** The styles the section draws with, for the page's sheet. */
export const menuRowsStyles = [layout, MenuStyle, IconStyle] as const

const rowsOf = (h: HtmlBuilder<Message>): ReadonlyArray<Menu.ItemRow> =>
  ROWS.map(({ glyph, ...row }) => ({
    ...row,
    icon: Icon.view(
      {
        icon: {
          viewBox: '0 0 16 16',
          attributes: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          nodes: [{ tag: 'path', attributes: { d: glyph }, children: [] }],
        },
        key: row.value,
        style: IconStyle,
      },
      h,
    ),
  }))

export const MenuRows = SlotView.forMessages<Message>()
  .define(MenuRowsSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      Menu.view(
        {
          model: model.menu,
          rows: rowsOf(h),
          buttonContent: h.span(slots.trigger.attrs(), ['Actions']),
          onMessage: message => Message.GotMenu({ message }),
          mixins: [MenuStyle.mixin],
        },
        h,
      ),
      h.p(slots.result.attrs([h.Role('status'), h.AriaLabel('Picked')]), [
        Option.match(pickedRow(model), {
          onNone: () => 'Picked: none',
          onSome: row => `Picked: ${row.value} (label ${row.label})`,
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(layout))
