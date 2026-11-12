import { Schema } from 'effect'

/**
 * What a Domain command answers besides its reply: the stream it appended to
 * and how many events that stream now holds.
 */
export const Receipt = Schema.Struct({
  stream: Schema.String,
  version: Schema.Number,
})
export type Receipt = typeof Receipt.Type
