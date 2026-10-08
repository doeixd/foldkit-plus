/**
 * A file browser's split state: the first panel's share, from 0 to 1. A drag
 * records where it started and each move sets `from + delta / width`, so the
 * size is the pointer's place now, not a sum of every step on the way. The
 * container's pixel width arrives from a `Resize` mount; with none known yet
 * (or a drag outside one) moves change nothing, while keys always work.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

/** The narrowest either panel goes, as a share. */
export const MIN = 0.2
/** The widest the first panel goes, as a share. */
export const MAX = 0.8
/** One arrow key's share. */
export const STEP = 0.05

export const clampShare = (share: number): number => {
  const clamped = Math.min(MAX, Math.max(MIN, share))
  // Sub-pixel shares are meaningless and float noise breaks identity checks.
  return Math.round(clamped * 1000) / 1000
}

export const percentOf = (share: number): number => Math.round(share * 100)

export const Model = Schema.Struct({
  first: Schema.Number,
  from: Schema.NullOr(Schema.Number),
  width: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  DragStarted: {},
  Dragged: { delta: Schema.Number },
  DragEnded: {},
  Resized: { width: Schema.Number },
  Sized: { first: Schema.Number },
})
export type Message = typeof Message.Type

export const initial: Model = { first: 0.5, from: null, width: 0 }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'DragStarted': {
      return model.from === model.first ? { model } : { model: { ...model, from: model.first } }
    }
    case 'Dragged': {
      if (model.from === null || model.width <= 0) return { model }
      const first = clampShare(model.from + message.delta / model.width)
      return first === model.first ? { model } : { model: { ...model, first } }
    }
    case 'DragEnded': {
      return model.from === null ? { model } : { model: { ...model, from: null } }
    }
    case 'Resized': {
      return message.width === model.width
        ? { model }
        : { model: { ...model, width: message.width } }
    }
    case 'Sized': {
      const first = clampShare(message.first)
      return first === model.first ? { model } : { model: { ...model, first } }
    }
  }
}
