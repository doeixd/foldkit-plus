import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../nav.js'

/**
 * A navigation menu's state for `foldkit-bundle`: which panel is open (by its
 * id), with the keys, the focus and the dismissal that go with it. It reports
 * nothing: the current page is the application's, set on each entry's
 * `current`. It holds no view: draw the placed Model with `Nav.view`.
 */
export const Nav = Bundle.make('Nav', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the nav draws, unique on the page. */
    id: Schema.String,
  }),
  init: ({ id }) => ({ model: init(id) }),
  update: (model, message) => update(model, message),
})
