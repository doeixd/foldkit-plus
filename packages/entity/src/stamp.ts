import { Data } from 'effect'

/**
 * A value the server chooses for a member when its row is created, never the
 * input: `Clock`, the time of the create, or `Viewer`, whoever asks, as the
 * row they are. Declared once, on the Entity (`Entity.stamps`), so every write
 * of it agrees: a server writes it from its clock and its principal, and a
 * client predicts it from what it holds.
 */
export type Stamp = Data.TaggedEnum<{ Clock: {}; Viewer: {} }>
const StampOf = Data.taggedEnum<Stamp>()

export const Stamp = {
  /** The time the row is created, in milliseconds: for a field stored as a number. */
  clock: StampOf.Clock(),
  /**
   * Whoever asks: a `one` relation pointing at them, or a field holding their
   * id. Read from the `viewer` each side declares (`Remote.make`'s,
   * `RemoteServer.make`'s), so a visitor has none to stamp.
   */
  viewer: StampOf.Viewer(),
  $match: StampOf.$match,
}
