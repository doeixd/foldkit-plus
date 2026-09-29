/**
 * Touch targets: mechanisms, not components. No slots, no views: compose
 * these into an application's own slots.
 */
import { Style, type StyleValue } from 'foldkit-mixins'

/**
 * On a touch screen, a control a finger can hit: 44px, as the platforms
 * advise. Only where the pointer is coarse, so a desktop keeps its density.
 */
export const target: StyleValue = Style.media('(pointer: coarse)', {
  minHeight: '2.75rem',
  minWidth: '2.75rem',
})

/**
 * The same, for every control a region draws: a link or button laid out as a
 * box. A link inside a sentence is inline, where `min-height` does nothing, so
 * prose keeps its lines.
 */
export const targets: StyleValue = Style.at(
  '@media (pointer: coarse)',
  Style.nest(':is(a, button, summary, select)', { minHeight: '2.75rem' }),
)
