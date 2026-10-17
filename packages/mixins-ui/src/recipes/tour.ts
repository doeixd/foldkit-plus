/**
 * Tour: the page dimmed in the overlay's shade around a cutout over the
 * target, rounded as the target is and ringed in the accent, and each step
 * a raised card with the Popover's arrow at its target: its place
 * (`2 of 5`) over a thin bar that fills as the tour goes on, its title, its
 * text, and a row of actions with Skip at the start and Next filled in the
 * accent at the end. A step with no target stands in the middle over the
 * whole dim. The cutout glides from target to target and the bar fills; both
 * travel, so reduced motion jumps.
 */
import { Style } from 'foldkit-mixins'
import { ladder, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { TourSlots } from '../tour.js'
import {
  component,
  focusRing,
  hover,
  onLadder,
  ref,
  transition,
  travelled,
  unfilledHover,
} from './design.js'
import { arrow } from './popover.js'

/** The dim over the page: a shade of the page's ink, so it reads in either scheme. */
const dim = `color-mix(in oklab, ${ref.text.default} 45%, transparent)`

const button = component(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...onLadder,
    border: `${ref.border.thin} solid ${ref.outline.default}`,
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.default,
    font: 'inherit',
    fontWeight: ref.weight.medium,
    cursor: 'pointer',
    ...transition('background-color, border-color, color'),
  }),
  hover({ background: unfilledHover }),
  focusRing,
)

export const Tour = Style.recipeFor(TourSlots)({
  base: {
    layer: component(Style.self({})),
    blocker: component(
      Style.self({ background: 'transparent' }),
      Style.pseudo('[data-spotlit="false"]', { background: dim }),
    ),
    spotlight: component(
      Style.self({
        // Its target's corner, grown by the padding, so the ring runs beside its edge.
        borderRadius: 'calc(var(--fk-tour-radius, 0px) + var(--fk-tour-padding, 0px))',
        boxShadow: `0 0 0 ${ref.border.thick} ${ref.accent.default}, 0 0 0 100vmax ${dim}`,
        transitionProperty: 'left, top, width, height',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.ease,
      }),
    ),
    panel: component(
      Style.self({
        display: 'grid',
        gap: ref.space.xs,
        boxSizing: 'border-box',
        inlineSize: 'min(22rem, 100vw - 2rem)',
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        color: ref.text.default,
        boxShadow: ref.shadow.xl,
      }),
      raise(3),
      Style.pseudo(':focus-visible', { outline: 'none' }),
    ),
    arrow: arrow({
      fill: raisedSurface(),
      line: ref.outline.subtle,
      corner: ref.radius.lg,
      size: ref.space.sm,
    }),
    progress: component(
      Style.self({
        margin: '0',
        display: 'grid',
        gap: ref.space['2xs'],
        color: ref.text.muted,
        ...role('caption'),
      }),
      // A bar under the words, filled to the step's share of the tour.
      Style.nest('&::after', {
        content: '""',
        blockSize: '3px',
        borderRadius: ref.radius.full,
        background: `linear-gradient(${ref.accent.default}, ${ref.accent.default}) 0 0 / calc(var(--fk-tour-progress, 0) * 100%) 100% no-repeat, ${ref.outline.subtle}`,
        transitionProperty: 'background-size',
        transitionDuration: travelled(ref.motion.moderate),
      }),
      Style.nest(':dir(rtl) &::after', { backgroundPosition: '100% 0, 0 0' }),
    ),
    title: component(
      Style.self({ margin: '0', ...role('subtitle'), fontWeight: ref.weight.semibold }),
    ),
    description: component(Style.self({ margin: '0', color: ref.text.muted, ...role('body') })),
    actions: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ladder('gap'),
        marginBlockStart: ref.space.xs,
      }),
    ),
    // At the start, out of the way of Back and Next.
    skip: component(
      button,
      Style.self({
        marginInlineEnd: 'auto',
        borderColor: 'transparent',
        color: ref.text.muted,
      }),
    ),
    back: button,
    next: component(
      button,
      Style.self({
        borderColor: ref.accent.default,
        background: ref.accent.default,
        color: ref.accent['on-fill'],
      }),
      hover({ background: ref.accent.hover }),
    ),
  },
  variants: {},
  defaults: {},
})
