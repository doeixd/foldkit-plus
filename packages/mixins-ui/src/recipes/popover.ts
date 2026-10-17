/**
 * A popover: a trigger opening a card anchored against it, with a click-away
 * behind it and an arrow at the trigger. `size` is the panel's maximum width;
 * `arrow: 'none'` hides the arrow.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { PopoverSlots } from '../popover.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  ref,
  transition,
  unfilledHover,
  variant,
} from './design.js'

const width = (max: string) => variant(Style.self({ maxInlineSize: `min(${max}, 100% - 2rem)` }))

/** The arrow's square, whose turned corner shows past the panel's edge. */
const smallArrow = ref.space.xs

/** Where the arrow stands on each side the anchor placed the panel: the edge facing the trigger. */
const facing = {
  bottom: { edge: 'top', along: 'left', turn: '45deg' },
  top: { edge: 'bottom', along: 'left', turn: '225deg' },
  right: { edge: 'left', along: 'top', turn: '-45deg' },
  left: { edge: 'right', along: 'top', turn: '135deg' },
} as const

/**
 * An arrow drawn as a floating panel's child, for Popover, Tooltip and Hover
 * Card: a square turned so one corner points at the trigger, half past the
 * panel's edge, in the panel's `fill` with its `line` on the two sides that
 * show. It stands where `--arrow-x` or `--arrow-y` says (upstream's anchor
 * writes them on the panel, `Anchor.PlaceArrow` on the arrow), centred
 * until either is known, and never nearer a corner than the panel's
 * `corner` radius. Physical sides, as the anchor's pixels are. `size` is
 * the square's side, `space.xs` unless given; half its diagonal shows, so it
 * suits a gap to the trigger a little wider than that.
 */
export const arrow = (look: {
  readonly fill: string
  readonly line: string
  readonly corner: string
  readonly size?: string
}): StyleValue => {
  const arrowSize = look.size ?? smallArrow
  return component(
    Style.self({
      position: 'absolute',
      inlineSize: arrowSize,
      blockSize: arrowSize,
      boxSizing: 'border-box',
      background: look.fill,
      borderTop: `${ref.border.thin} solid ${look.line}`,
      borderLeft: `${ref.border.thin} solid ${look.line}`,
      pointerEvents: 'none',
    }),
    ...Object.entries(facing).map(([side, { edge, along, turn }]) =>
      Style.nest(`:where([data-placement="${side}"]) > &`, {
        [edge]: `calc(${arrowSize} / -2 - ${ref.border.thin} / 2)`,
        [along]: `clamp(${look.corner}, var(--arrow-${along === 'left' ? 'x' : 'y'}, calc(50% - ${arrowSize} / 2)), calc(100% - ${look.corner} - ${arrowSize}))`,
        rotate: turn,
      }),
    ),
  )
}

export const Popover = Style.recipeFor(PopoverSlots)({
  base: {
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        ...role('body'),
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, border-color, color'),
      }),
      hover({ background: unfilledHover }),
      focusRing,
      disabled,
    ),
    panel: component(
      Style.self({
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        boxShadow: ref.shadow.lg,
        color: ref.text.muted,
        zIndex: '20',
      }),
      raise(2),
    ),
    backdrop: component(Style.self({ position: 'fixed', inset: '0' })),
    // Larger than a tooltip's: in the panel's own light fill and faint line, the
    // small one was a nub too slight to see against the page.
    arrow: arrow({
      fill: raisedSurface(),
      line: ref.outline.subtle,
      corner: ref.radius.lg,
      size: ref.space.sm,
    }),
  },
  variants: {
    size: {
      sm: { panel: width('18rem') },
      md: { panel: width('24rem') },
      lg: { panel: width('32rem') },
    },
    arrow: {
      shown: {},
      none: { arrow: variant(Style.self({ display: 'none' })) },
    },
  },
  defaults: { size: 'sm', arrow: 'shown' },
})
