/**
 * A hover card's state: whether the card shows, beside the `DismissLayer`
 * stack the Overlay behaviors mark through. Hovering or focusing the trigger
 * opens immediately; leaving (with a real pointer), blurring, or Escape
 * closes. A click after that hover stays open; the next click, a keyboard
 * click, or touch toggles. Intent delays stay upstream's `HoverIntent`: this card carries no
 * interactive content, so nothing flickers between trigger and panel.
 */
import { Schema, Match } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer } from 'foldkit-primitives/interaction'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Model = Schema.Struct({
  ...Stack.fields,
  open: Schema.Boolean,
  /** Set when a pointer enter opened the card, so the click that follows does not shut it. */
  openedByPointer: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Stack.cases,
  Entered: {},
  Left: {},
  Focused: {},
  Blurred: {},
  Toggled: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: model.open
        ? modifyFields(model, { open: () => false, openedByPointer: () => false })
        : model,
    }),
  }),
)

export const initial = assembly.initial({ open: false, openedByPointer: false })

export const update = assembly.update((model, message) => {
  return Match.valueTags(message, {
    Entered: () =>
      model.open
        ? { model }
        : { model: modifyFields(model, { open: () => true, openedByPointer: () => true }) },
    Left: () =>
      model.open
        ? { model: modifyFields(model, { open: () => false, openedByPointer: () => false }) }
        : { model },
    Focused: () =>
      model.open
        ? { model }
        : { model: modifyFields(model, { open: () => true, openedByPointer: () => false }) },
    Blurred: () =>
      model.open
        ? { model: modifyFields(model, { open: () => false, openedByPointer: () => false }) }
        : { model },
    Toggled: () => {
      if (model.openedByPointer && model.open)
        return { model: modifyFields(model, { openedByPointer: () => false }) }
      return {
        model: modifyFields(model, { open: () => !model.open, openedByPointer: () => false }),
      }
    },
  })
})
