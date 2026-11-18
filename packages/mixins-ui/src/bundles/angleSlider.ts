import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update, type AngleSliderLayout } from '../angleSlider.js'

const Args = Schema.Struct({
  /** Prefixes every id the dial draws, unique on the page. */
  id: Schema.String,
  /** Degrees to start at; default 0. */
  value: Schema.optionalKey(Schema.Number),
  step: Schema.optionalKey(Schema.Number),
  largeStep: Schema.optionalKey(Schema.Number),
  marks: Schema.optionalKey(
    Schema.Array(Schema.Struct({ value: Schema.Number, label: Schema.optionalKey(Schema.String) })),
  ),
  restrictToMarks: Schema.optionalKey(Schema.Boolean),
})

// `update` is built from the layout once: the args are one value for the life of a placement.
const folds = new WeakMap<object, ReturnType<typeof update>>()
const foldFor = (layout: AngleSliderLayout & object) => {
  const known = folds.get(layout)
  if (known !== undefined) return known
  const made = update(layout)
  folds.set(layout, made)
  return made
}

/**
 * An AngleSlider's state for `foldkit-bundle`: the angle and whether a
 * pointer is turning the dial, with the steps and marks of its layout as the
 * args beside `id` and the starting `value`. The angle is the dial's own, so
 * a parent reads it from the placed Model (`model.heading.value`). Keep the
 * layout in one value and give it to `AngleSlider.view` too, which draws the
 * same steps and marks. It holds no view.
 */
export const AngleSlider = Bundle.make('AngleSlider', {
  Model,
  Message,
  args: Args,
  // A layout `update` refuses (a step above a turn, restricting to no marks) fails here, at placement.
  init: args => {
    foldFor(args)
    return { model: init(args) }
  },
  update: (model, message, args) => foldFor(args)(model, message),
})
