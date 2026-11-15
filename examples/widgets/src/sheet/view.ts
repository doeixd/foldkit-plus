/**
 * The opener and the Sheet it opens, with a line on the page that says where
 * the sheet rests. The panel names its own point too, so a reader of the open
 * sheet, which holds the page inert, hears the same words.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Button, ButtonSlots, DialogSlots, Recipes, Sheet } from 'foldkit-mixins-ui'
import { sheetIslandStyle } from './style.js'
import { Message, percentShown, restingPercent, type Model } from './app.js'

export const SheetIslandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
})

export const OPENER_ID = 'sheet-opener'
export const SNAP_ID = 'sheet-snap'

const layout = sheetIslandStyle(SheetIslandSlots)
export const openerStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)
export const sheetStyle = Style.forSlots(DialogSlots)(Recipes.Sheet({}))

/** The styles the island draws with, for the page's sheet. */
export const sheetStyles = [layout, openerStyle, sheetStyle] as const

const said = (model: Model): string =>
  Option.match(percentShown(model), {
    onNone: () => 'Sheet closed',
    onSome: percent => `Sheet open, ${percent}% shown`,
  })

export const SheetIsland = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(SheetIslandSlots, [layout.mixin], { input: undefined, h })
  return h.div(slots.root.attrs(), [
    Button.view(
      {
        label: 'Open sheet',
        style: openerStyle,
        onClick: Message.Opened(),
        attributes: { button: [h.Id(OPENER_ID)] },
      },
      h,
    ),
    h.p(slots.status.attrs([h.AriaLive('polite')]), [said(model)]),
    Sheet.view(
      {
        model: model.sheet,
        onMessage: message => Message.GotSheet({ message }),
        style: sheetStyle,
        hasDescription: true,
        draw: dialog =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.div(dialog.handle),
                    h.button([...dialog.closeButton, h.AriaLabel('Close')], ['×']),
                    h.h2(dialog.title, ['Filters']),
                    h.p(
                      [...dialog.description, h.Id(SNAP_ID)],
                      [
                        `${restingPercent(model)}% of the sheet shows. Drag the handle, or focus it and press an arrow key, Home or End.`,
                      ],
                    ),
                  ]),
                ]
              : [],
          ),
      },
      h,
    ),
  ])
}
