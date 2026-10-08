/**
 * A toast stack: entries pile bottom-right and dismiss themselves. The entry
 * is a card with the accent edge; its tone comes from the entry's own
 * `data-variant`, which an application maps the way `Badge` maps its
 * attribute. No axes: one stack looks one way.
 */
import { Style } from 'foldkit-mixins'
import { ToastSlots } from '../toast.js'
import { component, ref } from './design.js'

export const Toast = Style.recipeFor(ToastSlots)({
  base: {
    container: component(
      Style.self({
        position: 'fixed',
        insetBlockEnd: ref.space.lg,
        insetInlineEnd: ref.space.lg,
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: 'min(22rem, calc(100vw - 2rem))',
        zIndex: '50',
      }),
    ),
    entry: component(
      Style.self({
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderInlineStart: `${ref.border.thick} solid ${ref.accent.default}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.base,
        boxShadow: ref.shadow.lg,
      }),
    ),
  },
})
