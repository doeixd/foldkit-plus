/**
 * A toolbar: a bordered row (or column, from `data-orientation`) of controls
 * that sit close, with a rule between sets. `size` is Button's ladder step, set
 * on the toolbar so buttons without a size of their own line up with a field
 * or a menu trigger beside them. Groups join their controls with a smaller gap
 * than the toolbar leaves between sets.
 */
import { Style } from 'foldkit-mixins'
import { ToolbarSlots } from '../toolbar.js'
import { component, ref, steps } from './design.js'

const vertical = '&[data-orientation="vertical"]'

export const Toolbar = Style.recipeFor(ToolbarSlots)({
  base: {
    root: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        padding: ref.space['2xs'],
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.default,
      }),
      Style.nest(vertical, { flexDirection: 'column', alignItems: 'stretch' }),
    ),
    group: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: ref.space['2xs'] }),
      Style.nest(vertical, { flexDirection: 'column', alignItems: 'stretch' }),
    ),
    // `data-orientation` is the line's own: across the toolbar, so vertical in a row.
    separator: component(
      Style.self({
        alignSelf: 'stretch',
        flex: 'none',
        inlineSize: ref.border.thin,
        background: ref.outline.default,
      }),
      Style.nest('&[data-orientation="horizontal"]', {
        inlineSize: 'auto',
        blockSize: ref.border.thin,
      }),
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
  },
})
