/**
 * A box that moves and resizes inside an area, on a grid. A key (`Move.nudge`,
 * `Move.resizeKeys`) and a pointer drag (`Move`) reach the same two functions,
 * `Box.moveBy` and `Box.resize`, with the same limits, so neither can put the
 * box where the other cannot. A drag keeps the rectangle it began from, so each
 * move is measured from there and Escape puts it back.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Box } from 'foldkit-primitives/state'

export const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type Rect = typeof Rect.Type

export const GRID = 20
export const AREA = { left: 0, top: 0, right: 400, bottom: 240 } as const
export const MIN = { width: 2 * GRID, height: 2 * GRID } as const

const moveLimits: Box.MoveLimits = { bounds: AREA, snap: GRID }
const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID, min: MIN }

/** What a drag in progress changes, and where the box was when it began. */
export const Drag = Schema.Struct({
  mode: Schema.Literals(['move', 'resize']),
  from: Rect,
})
export type Drag = typeof Drag.Type

export const Model = Schema.Struct({
  rect: Rect,
  drag: Schema.Option(Drag),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** Alt with an arrow on the box. */
  Nudged: { dx: Schema.Number, dy: Schema.Number },
  /** An arrow, Home or End on the resize handle. */
  ResizedByKey: { dx: Schema.Number, dy: Schema.Number },
  DragStarted: { mode: Schema.Literals(['move', 'resize']) },
  /** The pointer's distance from where it went down. */
  Dragged: { dx: Schema.Number, dy: Schema.Number },
  /** `completed` is false for Escape or a cancelled pointer. */
  DragEnded: { completed: Schema.Boolean },
})
export type Message = typeof Message.Type

export const initial = (): { readonly model: Model } => ({
  model: { rect: { x: 60, y: 40, width: 100, height: 80 }, drag: Option.none() },
})

const same = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** The model with `rect`, or the model itself when `rect` is the rectangle it holds. */
const placed = (model: Model, rect: Rect): Model =>
  same(rect, model.rect) ? model : modifyFields(model, { rect: () => rect })

export const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Match.valueTags(message, {
    Nudged: ({ dx, dy }) => placed(model, Box.moveBy(model.rect, dx, dy, moveLimits)),
    ResizedByKey: ({ dx, dy }) => placed(model, Box.resize(model.rect, 'se', dx, dy, resizeLimits)),
    DragStarted: ({ mode }) =>
      Option.isSome(model.drag)
        ? model
        : modifyFields(model, { drag: () => Option.some({ mode, from: model.rect }) }),
    Dragged: ({ dx, dy }) =>
      Option.match(model.drag, {
        onNone: () => model,
        onSome: ({ mode, from }) =>
          placed(
            model,
            mode === 'move'
              ? Box.moveBy(from, dx, dy, moveLimits)
              : Box.resize(from, 'se', dx, dy, resizeLimits),
          ),
      }),
    DragEnded: ({ completed }) =>
      Option.match(model.drag, {
        onNone: () => model,
        onSome: ({ from }) =>
          modifyFields(model, {
            drag: () => Option.none(),
            rect: rect => (completed ? rect : from),
          }),
      }),
  }),
})

/** The readout of where the box is. */
export const describe = ({ x, y, width, height }: Rect): string =>
  `x ${x}, y ${y}, ${width} by ${height}`
