/**
 * The card as one SlotView: the trigger opens on mouse entry and focus (a
 * click toggles, for touch), closes on pointer leave and blur; Escape and
 * outside press arrive as the stack's `Dismiss`. The popup is the
 * `Overlay.nonModal` policy: no trap, lock, or inertness for an
 * informational card.
 */
import { Option } from 'effect'
import { Behavior, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Overlay, Placing } from 'foldkit-primitives/interaction'
import { hoverCardStyle } from '../style.js'
import { Stack, Message, initial, update, type Model } from './app.js'

export const HoverCardSlots = Slots.define({
  wrap: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  card: Slot.make({ capability: Capability.Container }),
})

export const HoverOverlay = Overlay.behaviors(HoverCardSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'card',
  trigger: 'trigger',
  // Layer attribute, not an element id.
  id: () => 'hover-card',
  policy: Overlay.nonModal,
})

export const HoverCard = SlotView.forMessages<Message>()
  .define(HoverCardSlots, (model: Model, slots, h) =>
    h.div(slots.wrap.attrs(), [
      h.button(
        slots.trigger.attrs([
          h.OnMouseEnter(Message.Entered()),
          h.OnPointerLeave(pointerType =>
            pointerType === 'touch' ? Option.none() : Option.some(Message.Left()),
          ),
          h.OnFocusEnter(Message.Focused()),
          h.OnBlur(Message.Blurred()),
          h.OnClick(Message.Toggled()),
        ]),
        ['ada'],
      ),
      ...(model.open
        ? [
            h.div(slots.card.attrs([h.Role('dialog'), h.AriaLabel('About ada')]), [
              h.p([], ['Ada Lovelace — first programmer. 3 projects, 12 followers.']),
            ]),
          ]
        : []),
    ]),
  )
  .pipe(
    ...HoverOverlay.map(Behavior.attach),
    Behavior.attach(Placing.keepWithin(HoverCardSlots)({ panel: 'card' })),
    Style.attach(hoverCardStyle(HoverCardSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${model.open}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.Entered()).model
  lines.push(`hovered: ${show()}`)
  model = update(model, Message.Left()).model
  lines.push(`left: ${show()}`)
  return lines
}
