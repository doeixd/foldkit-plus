import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Message,
  Model,
  Rect,
  close,
  init,
  open,
  openBeside,
  update,
  type Side,
} from '../floatingPanel.js'

const Size = Schema.Struct({ width: Schema.Number, height: Schema.Number })
const step = update()

/**
 * A FloatingPanel's window for `foldkit-bundle`: where it is, its size, its
 * stage and a drag, with `FloatingPanel.init`'s options as the args. The
 * limits are kept in the Model, so `update` reads them and none is passed
 * again. It reports `Raised` in `onOut` when a press or focus lands inside:
 * fold it into the stack's order with `FloatingPanel.raise`. `helpers.open`
 * shows and focuses it, `helpers.openBeside(openerId, options?)` does so
 * beside an opener, `helpers.dock(edge, thickness)` docks it to an edge of
 * the viewport, and `helpers.close` shuts it. It holds no view: draw the
 * placed Model with `FloatingPanel.view`.
 */
export const FloatingPanel = Bundle.make('FloatingPanel', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the panel draws, and names it in a stack's order. */
    id: Schema.String,
    /** Where it starts and how big, in CSS pixels from the top left. */
    rect: Rect,
    open: Schema.optionalKey(Schema.Boolean),
    /** The least size a resize leaves; default 160 by 96. */
    min: Schema.optionalKey(Size),
    max: Schema.optionalKey(Size),
    /** Snaps every move and resize to multiples of this many pixels. */
    grid: Schema.optionalKey(Schema.Number),
    /** Whether the panel may go past the viewport; default false. */
    overflow: Schema.optionalKey(Schema.Boolean),
  }),
  init: args => ({ model: init(args) }),
  update: step,
  helpers: {
    open,
    openBeside,
    close,
    dock: (model: Model, edge: Side, thickness: number) =>
      step(model, Message.Docked({ edge, thickness })),
  },
})
