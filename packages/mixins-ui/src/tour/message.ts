import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

/** A tour's Messages; a module of their own, as `advanceOnClick` sends one. */
export const Message = defineMessageUnion({
  Next: {},
  Back: {},
  Skipped: {},
  /** A key on the step, as a left-to-right reader presses it. */
  Pressed: { key: Schema.String },
  /** The cutout looked for its target: `target` is its id, `found` whether it is on the page. */
  Spotlit: { target: Schema.String, found: Schema.Boolean },
  Placed: {},
  CompletedShowStep: {},
})
export type Message = typeof Message.Type
