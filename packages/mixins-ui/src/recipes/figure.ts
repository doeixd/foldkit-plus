/**
 * A figure: its content, and the caption under it in the caption role's
 * size, muted, so it reads as about the content and not as body text. The
 * figure keeps no margin of its own, as `Defaults.reset` leaves it, so the
 * page's flow spaces it like any block.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { FigureSlots } from '../figure.js'
import { component, ref, variant } from './design.js'

export const Figure = Style.recipeFor(FigureSlots)({
  base: {
    root: component(
      Style.self({ display: 'grid', gap: ref.space.xs, margin: '0', minInlineSize: '0' }),
    ),
    caption: component(Style.self({ ...role('caption'), color: ref.text.muted })),
  },
  variants: {
    align: {
      start: {},
      center: { caption: variant(Style.self({ textAlign: 'center' })) },
    },
    // Which side the caption stands on; the markup keeps it after the content,
    // so a screen reader reads it there whatever the page shows.
    caption: {
      after: {},
      before: { caption: variant(Style.self({ order: '-1' })) },
    },
  },
  defaults: { align: 'start', caption: 'after' },
})
