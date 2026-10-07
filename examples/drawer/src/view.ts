/**
 * The drawer as one SlotView over the Overlay policy's behaviors. The view
 * declares no overlay mechanics: marking, focus, scroll lock, and inertness
 * all arrive with `Overlay.behaviors(..., Overlay.modal)`. The panel draws
 * only while open; `data-open` drives the CSS slide.
 */
import { Behavior, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Overlay } from 'foldkit-primitives/interaction'
import { Stack, Message, type Model } from './app.js'

export const DrawerSlots = Slots.define({
  page: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
})

export const DrawerOverlay = Overlay.behaviors(DrawerSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'panel',
  trigger: 'trigger',
  id: () => 'drawer',
  policy: Overlay.modal,
})

export const Drawer = SlotView.forMessages<Message>()
  .define(DrawerSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.button(slots.trigger.attrs([h.OnClick(Message.Toggled())]), ['Open settings']),
      ...(model.open
        ? [
            h.aside(
              slots.panel.attrs([
                h.Role('dialog'),
                h.Attribute('aria-modal', 'true'),
                h.AriaLabel('Settings'),
                h.DataAttribute('open', ''),
              ]),
              [
                h.h2([], ['Settings']),
                h.button([h.OnClick(Message.Closed())], ['Close']),
                h.p([], ['Density, radius, and motion live here one day.']),
              ],
            ),
          ]
        : []),
    ]),
  )
  .pipe(...DrawerOverlay.map(Behavior.attach))
