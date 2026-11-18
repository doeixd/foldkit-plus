/**
 * What a Sheet and a Drawer share of being swiped, in a module of its own so
 * a Drawer page keeps neither the Sheet nor the Dialog beneath it.
 */
import { Schema } from 'effect'

/** Where a drag starts: anywhere on the panel for a finger, or the handle alone. */
export const SwipeFrom = Schema.Literals(['panel', 'handle'])
export type SwipeFrom = typeof SwipeFrom.Type

/** The default `flickSpeed`: a release faster than this, in pixels a millisecond, is a flick (vaul's 0.4). */
export const FLICK_SPEED = 0.4
/** The default `closeShare`: the share of the panel a slow drag takes it away by (vaul's 0.25). */
export const CLOSE_SHARE = 0.25
/** A press on the handle that moves less than this, in pixels, is a press, not a drag. */
export const PRESS_SLOP = 4

/** How a Sheet or a Drawer is swiped; every field has the default its doc names. */
export interface SwipeConfig {
  /** Where a drag starts: `panel` (a finger anywhere on it, the default) or `handle`. */
  readonly from?: SwipeFrom
  /** How fast, in pixels a millisecond, a release must be to be a flick. Default `FLICK_SPEED`. */
  readonly flickSpeed?: number
  /** The share of the panel, from 0 to 1, a slow drag takes it away by. Default `CLOSE_SHARE`. */
  readonly closeShare?: number
}

/** `config`'s fields with their defaults, refusing a speed that is not above 0 or a share outside (0, 1]. */
export const swipeOf = (id: string, config: SwipeConfig = {}) => {
  const flickSpeed = config.flickSpeed ?? FLICK_SPEED
  const closeShare = config.closeShare ?? CLOSE_SHARE
  if (!(flickSpeed > 0))
    throw new Error(`${id}: swipe.flickSpeed must be above 0, given ${flickSpeed}`)
  if (!(closeShare > 0 && closeShare <= 1)) {
    throw new Error(`${id}: swipe.closeShare must be within (0, 1], given ${closeShare}`)
  }
  return { swipeFrom: config.from ?? ('panel' as const), flickSpeed, closeShare }
}
