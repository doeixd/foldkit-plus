/**
 * A bottom Sheet that rests at three points. `Bundles.Sheet` is placed under
 * `sheet`: its Model holds what is open and which point it rests at, and the
 * handle's keys, a release of a drag and the Dialog's Escape all arrive as
 * the placement's Messages. The point is read back from the Model, never kept
 * beside it. The Dialog's `Opened` and `Closed` are ignored: nothing here
 * reacts to them.
 */
import { Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Sheet } from 'foldkit-mixins-ui'

export const ISLAND = 'sheet'

/** How much of the panel shows at each resting point, ascending. */
export const POINTS = [0.3, 0.6, 1]

export const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('sheet', Bundles.Sheet, {
    args: { id: `${ISLAND}-sheet`, points: POINTS },
    onOut: Bundle.ignore,
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({}).model

/** The share of the panel showing at the point the sheet rests at, as a percent. */
export const restingPercent = (model: Model): number =>
  Math.round((model.sheet.points[model.sheet.at] ?? 1) * 100)

/** The same while the sheet is open, and nothing once it is closed or leaving. */
export const percentShown = (model: Model): Option.Option<number> =>
  Sheet.isOpen(model.sheet) ? Option.some(restingPercent(model)) : Option.none()

/** Opening rests at the lowest point; every other Message is the placement's. */
export const update = App.placements.update(model => App.children.sheet.helpers.open()(model))
