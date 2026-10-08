/**
 * Page navigation: one joined row of stops, the current one in the accent's
 * tint and ink, the rest quiet buttons that lift on hover. The current stop
 * reads `aria-current`, so its look follows the DOM with no JavaScript.
 */
import { Style } from 'foldkit-mixins'
import { PaginationSlots } from '../pagination.js'
import { component, disabled, focusRing, hover, ref, variant } from './design.js'

const stop = component(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minInlineSize: '2rem',
    minBlockSize: '2rem',
    paddingInline: ref.space['2xs'],
    border: `${ref.border.thin} solid transparent`,
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.default,
    font: 'inherit',
    cursor: 'pointer',
  }),
  hover({ background: ref.surface.muted }),
  focusRing,
  disabled,
)

export const Pagination = Style.recipeFor(PaginationSlots)({
  base: {
    root: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['3xs'],
      }),
    ),
    prev: stop,
    next: stop,
    page: component(
      stop,
      Style.states(
        {
          page: {
            background: ref.accent.subtle,
            color: ref.accent.ink,
            fontWeight: ref.weight.semibold,
          },
        },
        'aria-current',
      ),
    ),
    ellipsis: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minInlineSize: '2rem',
        color: ref.text.muted,
      }),
    ),
  },
})
