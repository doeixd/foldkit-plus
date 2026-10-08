/**
 * The dialog as one SlotView over an explicit-response Overlay policy:
 * modal focus, scroll lock, and inertness, but dismissal on neither outside
 * press nor Escape. The marking behavior still marks the panel (with both
 * opt-outs), the trigger counts as inside, and only Cancel or Delete answers.
 */
import { Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { DismissLayer, Overlay } from 'foldkit-primitives/interaction'
import { alertDialogStyle } from '../style.js'
import { Stack, Message, initial, update, type Model } from './app.js'

export const AlertDialogSlots = Slots.define({
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  cancel: Slot.make({ capability: Capability.Interactive }),
  confirm: Slot.make({ capability: Capability.Interactive }),
})

const explicit: Overlay.Policy = {
  ...Overlay.modal,
  dismiss: { outside: false, escape: false },
}

export const AlertOverlay = Overlay.behaviors(AlertDialogSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'panel',
  trigger: 'trigger',
  id: () => 'delete-confirm',
  policy: explicit,
})

export const AlertDialog = SlotView.forMessages<Message>()
  .define(AlertDialogSlots, (model: Model, slots, h) =>
    h.div(
      [],
      [
        h.button(slots.trigger.attrs([h.OnClick(Message.Opened())]), ['Delete project']),
        ...(model.open
          ? [
              h.div(
                slots.panel.attrs([
                  h.Role('alertdialog'),
                  h.Attribute('aria-modal', 'true'),
                  h.AriaLabelledBy('delete-confirm-title'),
                  h.AriaDescribedBy('delete-confirm-description'),
                ]),
                [
                  h.h2([h.Id('delete-confirm-title')], ['Delete project?']),
                  h.p(
                    [h.Id('delete-confirm-description')],
                    ['This removes the project and its history. This cannot be undone.'],
                  ),
                  h.button(slots.cancel.attrs([h.OnClick(Message.Cancelled())]), ['Cancel']),
                  h.button(slots.confirm.attrs([h.OnClick(Message.Confirmed())]), ['Delete']),
                ],
              ),
            ]
          : []),
        ...(model.answer === null ? [] : [h.p([], [`Last answer: ${model.answer}.`])]),
      ],
    ),
  )
  .pipe(...AlertOverlay.map(Behavior.attach), Style.attach(alertDialogStyle(AlertDialogSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${model.open} answer=${model.answer}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.Opened()).model
  lines.push(`opened: ${show()}`)
  model = update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedEscape({
        layers: [{ id: 'delete-confirm', outside: false, escape: false }],
      }),
    ),
  ).model
  lines.push(`escape pressed: ${show()} (ignored)`)
  model = update(model, Message.Confirmed()).model
  lines.push(`confirmed: ${show()}`)
  return lines
}
