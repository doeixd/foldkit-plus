import { Match, Schema } from 'effect'
import * as Mount from 'foldkit/mount'
import { Move } from 'foldkit-primitives/interaction'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = Schema.Union([Move.MoveStarted, Move.Moved, Move.MoveEnded])
const Model = Schema.Struct({ x: Schema.Number, dx: Schema.Number, dragging: Schema.Boolean })
const within = (x: number) => Math.max(0, Math.min(120, x))

// Deltas are from where the press began, so the Model keeps the resting position and the drag apart.
export default primitiveExample({
  title: 'Move',
  text: '`Move` is a Mount that reports a pointer drag as `MoveStarted`, `Moved` with the distance from the press, and `MoveEnded`. Escape ends it as not completed, and the box goes back.',
  state: {
    Model,
    Message,
    init: () => ({ model: { x: 0, dx: 0, dragging: false } }),
    update: (model, message) =>
      Match.valueTags(message, {
        MoveStarted: () => ({ model: { ...model, dragging: true } }),
        Moved: ({ deltaX }) => ({ model: { ...model, dx: deltaX } }),
        MoveEnded: ({ completed }) => ({
          model: { x: completed ? within(model.x + model.dx) : model.x, dx: 0, dragging: false },
        }),
      }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      slots.liveBox.attrs([
        h.Style({
          touchAction: 'none',
          cursor: 'grab',
          // physical: the box follows the pointer's x, which is the screen's
          transform: `translateX(${within(model.x + model.dx)}px)`,
        }),
        h.OnMount(Mount.mapMessage(Move.mount(), onMessage)),
      ]),
      [model.dragging ? 'Moving…' : 'Drag me sideways'],
    ),
})
