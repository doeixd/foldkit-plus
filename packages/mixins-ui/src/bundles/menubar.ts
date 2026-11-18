import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../menubar.js'

/**
 * A Menubar's state for `foldkit-bundle`: one shut menu for each of `ids`, the
 * first trigger the bar's tab stop, and the keys and hover that move between
 * the menus. It answers a chosen row with `Selected` (the menu's index and the
 * row's value), in `onOut`; the checks' state is the application's. It holds
 * no view: draw the placed Model with `Menubar.view`.
 */
export const Menubar = Bundle.make('Menubar', {
  Model,
  Message,
  args: Schema.Struct({
    /** One id for each menu, in the order `Menubar.view`'s `menus` has them. */
    ids: Schema.Array(Schema.String),
    /** Keeps the panels drawn while they leave, so a recipe's fade runs. */
    isAnimated: Schema.optionalKey(Schema.Boolean),
    /** The rest of the page is inert while a menu is open. */
    isModal: Schema.optionalKey(Schema.Boolean),
  }),
  init: ({ ids, ...options }) => ({ model: init(ids, options) }),
  update: (model, message) => update(model, message),
})
