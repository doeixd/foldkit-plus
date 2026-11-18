/**
 * Page navigation: one joined row of stops, the current one in the accent's
 * tint and ink, the rest quiet buttons that lift on hover. The current stop
 * reads `aria-current`, so its look follows the DOM with no JavaScript.
 * `compact` drops the numbers but the current one, which then reads
 * `"4 / 12"` so the total stays: `narrow` (default) on a window under 30rem,
 * `always`, or `never`. `shape: 'round'` makes the stops pills and
 * `treatment: 'outline'` gives each the field's outline.
 */
import { Style } from 'foldkit-mixins'
import { PaginationSlots } from '../pagination.js'
import {
  component,
  controlCorner,
  disabled,
  focusRing,
  hover,
  ref,
  unfilledHover,
  variant,
} from './design.js'

// The window, not the row: the row shrinks to its stops, so it cannot be the container it asks about.
const narrow = '@media (max-width: 30rem)'
const hidden = { display: 'none' }
const shown = { display: 'inline' }

const stop = component(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minInlineSize: '2rem',
    minBlockSize: '2rem',
    paddingInline: ref.space['2xs'],
    border: `${ref.border.thin} solid transparent`,
    borderRadius: controlCorner,
    background: 'transparent',
    color: ref.text.default,
    font: 'inherit',
    cursor: 'pointer',
  }),
  hover({ background: unfilledHover }),
  focusRing,
  disabled,
)

const round = variant(Style.self({ borderRadius: ref.radius.full }))
const outlined = variant(Style.self({ borderColor: ref.outline.default }))

export const Pagination = Style.recipeFor(PaginationSlots)({
  base: {
    // Wrapping, so a row wider than its room breaks onto a second line
    // rather than running past it.
    root: component(
      Style.self({
        display: 'inline-flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: ref.space['3xs'],
        maxInlineSize: '100%',
      }),
    ),
    // A word, not a number: room either side, so "Previous" does not run into the 1 beside it.
    prev: component(stop, Style.self({ paddingInline: ref.space.xs })),
    next: component(stop, Style.self({ paddingInline: ref.space.xs })),
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
    // Shown only where `compact` hides the numbers it would otherwise sit beside.
    pageCount: component(
      Style.self({ ...hidden, color: ref.text.muted, fontWeight: ref.weight.normal }),
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
    first: component(stop, Style.self({ paddingInline: ref.space.xs })),
    last: component(stop, Style.self({ paddingInline: ref.space.xs })),
    summary: component(
      Style.self({
        marginInlineEnd: ref.space.xs,
        color: ref.text.muted,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }),
    ),
    perPage: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        marginInlineEnd: ref.space.xs,
        color: ref.text.muted,
        whiteSpace: 'nowrap',
      }),
    ),
    perPageSelect: component(
      Style.self({
        minBlockSize: '2rem',
        paddingInline: ref.space.xs,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: controlCorner,
        background: ref.surface.base,
        boxShadow: ref.shadow.field,
        color: ref.text.default,
        font: 'inherit',
        cursor: 'pointer',
      }),
      focusRing,
    ),
  },
  variants: {
    // Compact keeps the current stop and the words around it: the other
    // numbers and the ellipses go, so a phone's row stays on one line.
    compact: {
      never: {},
      narrow: {
        page: variant(Style.at(narrow, Style.pseudo(':not([aria-current="page"])', hidden))),
        pageCount: variant(Style.at(narrow, Style.self(shown))),
        ellipsis: variant(Style.at(narrow, Style.self(hidden))),
      },
      always: {
        page: variant(Style.pseudo(':not([aria-current="page"])', hidden)),
        pageCount: variant(Style.self(shown)),
        ellipsis: variant(Style.self(hidden)),
      },
    },
    // The stops' corners: `round` makes each a pill.
    shape: {
      square: {},
      round: {
        first: round,
        prev: round,
        page: round,
        next: round,
        last: round,
      },
    },
    // `outline` gives every stop the field's outline, not only the current one's tint.
    treatment: {
      ghost: {},
      outline: {
        first: outlined,
        prev: outlined,
        page: outlined,
        next: outlined,
        last: outlined,
      },
    },
  },
  defaults: { compact: 'narrow', shape: 'square', treatment: 'ghost' },
})
