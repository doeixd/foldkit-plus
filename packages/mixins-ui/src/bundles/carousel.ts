import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../carousel.js'

/**
 * A Carousel's slide and rotation for `foldkit-bundle`, with the layout
 * (`count`, `perView`, `loop`) as args. The layout is kept in the Model, so
 * `update` and `Carousel.view` both read it and neither is told again. It
 * holds no view: draw the placed Model with `Carousel.view`.
 */
export const Carousel = Bundle.make('Carousel', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the carousel draws, unique on the page. */
    id: Schema.String,
    /** The slides the view draws. */
    count: Schema.Number,
    index: Schema.optionalKey(Schema.Number),
    autoplay: Schema.optionalKey(Schema.Boolean),
    reducedMotion: Schema.optionalKey(Schema.Boolean),
    delay: Schema.optionalKey(Schema.Number),
    perView: Schema.optionalKey(Schema.Number),
    loop: Schema.optionalKey(Schema.Boolean),
  }),
  init: args => ({ model: init(args) }),
  update: (model, message) => update()(model, message),
})
