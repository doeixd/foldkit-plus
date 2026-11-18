import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { RovingTabindex } from 'foldkit-primitives/interaction'

/**
 * A Toolbar's tab stop for `foldkit-bundle`: the control focused last, which
 * Tab comes back to. Pass the placed Model as `roving` and `Toolbar.focused`
 * as `onFocus`. It holds no view, and the controls are the application's own.
 */
export const Toolbar = Bundle.make('Toolbar', {
  Model: RovingTabindex.Model,
  Message: RovingTabindex.Message,
  args: Schema.Struct({
    /** The control that holds the stop at the start; the first enabled one when not given. */
    current: Schema.optionalKey(Schema.String),
  }),
  init: ({ current }) => ({ model: { current: current ?? null } }),
  update: (model, message) => RovingTabindex.update(model, message),
})
