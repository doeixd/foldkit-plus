/**
 * A bottom Sheet that rests at three points. The Sheet's own Model holds what
 * is open and which point it rests at, so the application keeps it whole and
 * folds it with `Sheet.update`: the handle's keys, a release of a drag and
 * the Dialog's Escape all arrive as Sheet Messages, and the point is read
 * back from the Model, never kept beside it.
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Sheet } from 'foldkit-mixins-ui'

export const ISLAND = 'sheet'

/** How much of the panel shows at each resting point, ascending. */
export const POINTS = [0.3, 0.6, 1]

export const Model = Schema.Struct({ sheet: Sheet.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Opened: {},
  GotSheet: { message: Sheet.Message },
})
export type Message = typeof Message.Type

export const initial: Model = { sheet: Sheet.init({ id: `${ISLAND}-sheet`, points: POINTS }) }

/** The share of the panel showing at the point the sheet rests at, as a percent. */
export const restingPercent = (model: Model): number =>
  Math.round((model.sheet.points[model.sheet.at] ?? 1) * 100)

/** The same while the sheet is open, and nothing once it is closed or leaving. */
export const percentShown = (model: Model): Option.Option<number> =>
  Sheet.isOpen(model.sheet) ? Option.some(restingPercent(model)) : Option.none()

const folded = (model: Model, next: Sheet.Return): Return<Model, Message> => ({
  model: next.model === model.sheet ? model : modifyFields(model, { sheet: () => next.model }),
  commands: Command.mapMessages(next.commands ?? [], message => Message.GotSheet({ message })),
})

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Opened: () => folded(model, Sheet.open(model.sheet)),
    GotSheet: ({ message }) => folded(model, Sheet.update(model.sheet, message)),
  })
