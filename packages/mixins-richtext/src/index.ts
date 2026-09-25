/**
 * `foldkit-mixins-richtext` — the editor's chrome, drawn through slots (§35, §120).
 *
 * The editor's Bundle renders one host element and nothing else (§29); the marks
 * toolbar beside it is the application's chrome. This package draws that chrome as
 * a SlotView, so every element it makes is a slot an application styles or extends
 * the way it does any other view. It cannot wrap `marksToolbar`: a slot's
 * contributions resolve at the element the view creates (§120). The two share
 * `markActive` instead.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { markActive, type ToolbarState } from 'foldkit-richtext-dom/toolbar'

/** The elements the toolbar publishes: its wrapper, its row, and one button per mark. */
export const MarkToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  toolbar: Slot.make({ capability: Capability.Collection }),
  button: Slot.make({ capability: Capability.Interactive }),
})

export interface MarkToolbarInput<Message> {
  /** What the editor projects: `document`, `selection`, and the caret's format. */
  readonly state: ToolbarState
  /** The marks to offer, by name. Defaults to the three `foldkit-richtext` ships. */
  readonly marks?: ReadonlyArray<string> | undefined
  /**
   * A mark to the Message that toggles it for this caller. The editor's
   * `Message.ToggledMark` is data, but a caller usually dispatches its wrapper
   * (`edited(...)`), which is a function — and a plain SlotView holds one.
   */
  readonly toggled: (mark: string) => Message
}

/**
 * The mark toolbar as a slot view. A Style or Behavior attaches to
 * `MarkToolbarSlots`; each button renders with its mark as the slot item's `id`, so
 * a Behavior can single one out.
 */
export const markToolbar = <Message>(): SlotView.SlotView<
  typeof MarkToolbarSlots,
  MarkToolbarInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(MarkToolbarSlots, (input, slots, h) => {
    const marks = input.marks ?? RichText.shippedMarks.map(definition => definition.name)
    return h.div(slots.root.attrs(), [
      h.div(
        slots.toolbar.attrs([h.Role('toolbar')]),
        marks.map((mark, index) =>
          h.button(
            slots.button.attrs(
              [
                h.Type('button'),
                h.DataAttribute('mark', mark),
                h.AriaLabel(mark),
                h.AriaPressed(markActive(input.state, mark) ? 'true' : 'false'),
                h.OnClick(input.toggled(mark)),
              ],
              { index, id: mark, count: marks.length },
            ),
            [mark],
          ),
        ),
      ),
    ])
  })

/**
 * The slash menu's vocabulary (§123) travels with the chrome it belongs to, so an
 * application importing the family gets the entries and the query rule too.
 */
export { matchingEntries, slashEntries, slashQuery, type SlashEntry } from './slash.js'
