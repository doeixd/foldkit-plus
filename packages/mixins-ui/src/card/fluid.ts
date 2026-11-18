import { FluidHover, fluidHovered } from 'foldkit-primitives/dom'
import type { CardGroupFluid } from '../card.js'

/** The name of the group's highlight: its place is `--fk-card-hover-x`, `-y`, `-w`, `-h`. */
export const CARD_HOVER = 'card-hover'

const hover = fluidHovered(CARD_HOVER)

/**
 * One highlight that follows the pointer to the nearest card in a group, in
 * place of a hover on each; a press in a gap presses the highlighted card.
 * Pass it as `Card.group`'s `fluid`: a group given none draws no highlight and
 * ships none of this.
 */
export const fluid: CardGroupFluid = {
  // Where the highlight rests until FluidHover first writes, so a page drawn
  // without it (on a server, before the Mount starts) reads defined values.
  // The view draws the same values each time, so a render never undoes a write.
  resting: {
    [hover.x]: '0px',
    [hover.y]: '0px',
    [hover.w]: '0px',
    [hover.h]: '0px',
    [hover.shown]: '0',
    [hover.moving]: '0',
  },
  mount: columns =>
    FluidHover({
      name: CARD_HOVER,
      item: '[data-card-item]',
      axis: columns > 1 ? 'xy' : 'y',
      gapClick: true,
      // A grid's gutters are wide: a click far out in one presses nothing.
      gapReach: 16,
    }),
}
