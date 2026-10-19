/**
 * Drawer: the `Drawer`'s panel docked to the bottom of the screen, peeking
 * or open, beside the page rather than over it. `dock` says where: `always`,
 * or below a breakpoint (`below-lg`, `below-xl`), above which the panel is
 * the column it sits in, with no handle, and its body always shown.
 *
 * Docked, the panel rests open or down at `--fk-drawer-peek` (what still
 * shows: the handle and whatever the application draws before the body;
 * default 5rem), follows `--fk-drawer-offset` while dragged, clamped between
 * the two, and rests on the moderate tier, which travels, so reduced motion
 * snaps it. Its height is `--fk-drawer-height` (default 70dvh). Peeking and
 * still, its body is hidden, out of the tab order and the accessibility
 * tree. Its bottom padding keeps clear of a phone's home indicator.
 *
 * The handle is a bar of two halves meeting in the middle, which bend into a
 * chevron pointing up as the panel goes down: by `--fk-drawer-progress`
 * while a finger drags it, so the bend follows the finger.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { DrawerSlots } from '../drawer.js'
import { component, focusRing, ref, travelled, variant } from './design.js'

/** Below this width, as each `below-*` dock reads it: the breakpoint's own, less a hair. */
const widths = { 'below-lg': '63.99rem', 'below-xl': '79.99rem' } as const

/** How far it goes down: all but the peek, which shows above the home indicator. */
const travel = `calc(100% - var(--fk-drawer-peek, 5rem) - ${ref.safe.bottom})`
/** Where it rests: open at 0, down at its travel. */
const rest = 'var(--_fk-drawer-rest, 0px)'
/** How far down the handle's halves bend, in degrees at a full chevron. */
const BEND = 22

const docked = {
  panel: [
    Style.self({
      position: 'fixed',
      // Pinned by its bottom: a top the application set for a sticky column would win.
      insetBlockStart: 'auto',
      insetInline: '0',
      insetBlockEnd: '0',
      zIndex: '40',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      blockSize: 'var(--fk-drawer-height, 70dvh)',
      paddingBlockEnd: `calc(${ref.space.sm} + ${ref.safe.bottom})`,
      background: ref.surface.base,
      borderBlockStart: `${ref.border.thin} solid ${ref.outline.default}`,
      borderStartStartRadius: ref.radius.xl,
      borderStartEndRadius: ref.radius.xl,
      borderEndStartRadius: '0',
      borderEndEndRadius: '0',
      boxShadow: ref.shadow.xl,
      transform: `translateY(clamp(0px, calc(${rest} + var(--fk-drawer-offset, 0px)), ${travel}))`,
      transitionProperty: 'transform',
      transitionDuration: travelled(ref.motion.moderate),
      transitionTimingFunction: ref.motion.settle,
      '--_fk-drawer-bend': '0',
    }),
    Style.pseudo('[data-open="false"]', { '--_fk-drawer-rest': travel, '--_fk-drawer-bend': '1' }),
    // It follows the finger, and the handle bends with it.
    Style.pseudo('[data-dragging]', {
      transitionDuration: '0s',
      '--_fk-drawer-bend': 'var(--fk-drawer-progress)',
    }),
  ],
  handle: [Style.self({ display: 'block' })],
  body: [
    Style.self({ flex: '1', minBlockSize: '0', overflowY: 'auto', overscrollBehavior: 'contain' }),
    // Anywhere in the panel, so what draws before the body (tabs) can peek with the handle.
    Style.nest(':where([data-drawer][data-open="false"]:not([data-dragging])) &', {
      visibility: 'hidden',
    }),
  ],
}

/** Every docked rule, kept below `width`. */
const below = (width: string, pieces: ReadonlyArray<StyleValue>): ReadonlyArray<StyleValue> =>
  pieces.map(piece => Style.at(`@media (max-width: ${width})`, piece))

const dockedBelow = (width: string) => ({
  panel: variant(...below(width, docked.panel)),
  handle: variant(...below(width, docked.handle)),
  body: variant(...below(width, docked.body)),
})

export const Drawer = Style.recipeFor(DrawerSlots)({
  base: {
    panel: component(Style.self({ minInlineSize: '0' })),
    handle: component(
      Style.self({
        display: 'none',
        position: 'relative',
        flexShrink: '0',
        alignSelf: 'stretch',
        // A finger's height to press (44px), drawn into the space around it, so
        // the bar sits close to what follows and a press beside it still drags.
        blockSize: '2.75rem',
        marginBlock: '-0.75rem',
        zIndex: '1',
        padding: '0',
        border: '0',
        background: 'transparent',
        cursor: 'grab',
        WebkitTouchCallout: 'none',
      }),
      // Two halves of the bar, each turning on the middle where they meet.
      Style.pseudo('::before, ::after', {
        content: '""',
        position: 'absolute',
        insetBlockStart: 'calc(50% - 0.125rem)',
        inlineSize: '1.25rem',
        blockSize: '0.25rem',
        borderRadius: ref.radius.full,
        background: ref.outline.overt,
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.pseudo('::before', {
        insetInlineEnd: 'calc(50% - 0.0625rem)',
        transformOrigin: 'right center',
        rotate: `calc(var(--_fk-drawer-bend, 0) * -${BEND}deg)`,
      }),
      Style.pseudo('::after', {
        insetInlineStart: 'calc(50% - 0.0625rem)',
        transformOrigin: 'left center',
        rotate: `calc(var(--_fk-drawer-bend, 0) * ${BEND}deg)`,
      }),
      // Dragged, the bend is the finger's, at once.
      Style.nest(':where([data-dragging]) > &::before, :where([data-dragging]) > &::after', {
        transitionDuration: '0s',
      }),
      Style.pseudo(':active', { cursor: 'grabbing' }),
      focusRing,
    ),
    body: component(Style.self({ minInlineSize: '0' })),
  },
  variants: {
    dock: {
      always: {
        panel: variant(...docked.panel),
        handle: variant(...docked.handle),
        body: variant(...docked.body),
      },
      'below-lg': dockedBelow(widths['below-lg']),
      'below-xl': dockedBelow(widths['below-xl']),
    },
  },
  defaults: { dock: 'always' },
})
