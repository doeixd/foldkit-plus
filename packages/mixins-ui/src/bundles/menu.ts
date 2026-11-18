import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../menu.js'

const Structure = Schema.Struct({
  value: Schema.String,
  items: Schema.optional(Schema.Array(Schema.Struct({ value: Schema.String }))),
})

/**
 * A Menu's state for `foldkit-bundle`: whether it is open, the row the keys
 * are on, each submenu, and where it opened at a point. `rows` are the rows
 * `Menu.view` is given, of which the Bundle reads only the structure (each
 * row's `value`, and the `items` of one that opens a submenu). It answers a
 * chosen row with `Selected`, in `onOut`; the checks' state is the
 * application's. It holds no view: draw the placed Model with `Menu.view`.
 */
export const Menu = Bundle.make('Menu', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the menu draws, unique on the page. */
    id: Schema.String,
    rows: Schema.Array(Structure),
    /** Keeps the panels drawn while they leave, so a recipe's fade runs. */
    isAnimated: Schema.optionalKey(Schema.Boolean),
    /** Locks the page's scroll and makes the rest inert while open. */
    isModal: Schema.optionalKey(Schema.Boolean),
  }),
  init: ({ id, rows, ...options }) => ({ model: init(id, rows, options) }),
  update: (model, message) => update(model, message),
})
