/**
 * A tour of two controls and a floating panel of notes, each opened by a
 * button. Both are drawn with `focusReturn` among their mixins, so closing
 * either puts focus back on the button that opened it, without the Model
 * naming that button.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import {
  Button,
  ButtonSlots,
  FloatingPanel,
  FloatingPanelSlots,
  Recipes,
  Tour,
  TourSlots,
} from 'foldkit-mixins-ui'
import { Message, SAVE_ID, SEARCH_ID, type Model } from './app.js'
import { tourIslandStyle } from './style.js'

export const TourIslandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  openers: Slot.make({ capability: Capability.Container }),
  /** The controls the tour's steps explain. */
  targets: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  notes: Slot.make({ capability: Capability.Container }),
})

export const START_ID = 'tour-start'
export const NOTES_OPEN_ID = 'tour-notes-open'

const layout = tourIslandStyle(TourIslandSlots)
const buttonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)
const tourStyle = Style.forSlots(TourSlots)(Recipes.Tour({}))
const panelStyle = Style.forSlots(FloatingPanelSlots)(Recipes.FloatingPanel({}))

/** The styles the island draws with, for the page's sheet. */
export const tourStyles = [layout, buttonStyle, tourStyle, panelStyle] as const

export const said = (model: Model): string =>
  Option.match(model.ending, {
    onNone: () => 'The tour has not ended yet',
    onSome: ending => `The tour ${ending}`,
  })

export const TourIsland = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(TourIslandSlots, [layout.mixin], { input: undefined, h })
  const button = (label: string, id: string, onClick: Message | undefined) =>
    Button.view(
      {
        label,
        style: buttonStyle,
        ...(onClick === undefined ? {} : { onClick }),
        attributes: { button: [h.Id(id)] },
      },
      h,
    )
  return h.div(slots.root.attrs(), [
    h.div(slots.openers.attrs(), [
      button('Start tour', START_ID, Message.StartedTour()),
      button('Open notes', NOTES_OPEN_ID, Message.OpenedNotes()),
    ]),
    // What the tour explains: plain buttons, which the steps point at.
    h.div(slots.targets.attrs(), [
      button('Search', SEARCH_ID, undefined),
      button('Save', SAVE_ID, undefined),
    ]),
    h.p(slots.status.attrs([h.AriaLive('polite')]), [said(model)]),
    Tour.view(
      {
        model: model.tour,
        onMessage: message => Message.GotTourMessage({ message }),
        style: tourStyle,
        mixins: Tour.focusReturn,
      },
      h,
    ),
    FloatingPanel.view(
      {
        model: model.panel,
        onMessage: message => Message.GotPanelMessage({ message }),
        title: 'Notes',
        content: h.p(slots.notes.attrs(), ['Drag the title bar, or focus it and use the arrows.']),
        style: panelStyle,
        mixins: FloatingPanel.focusReturn,
      },
      h,
    ),
  ])
}
