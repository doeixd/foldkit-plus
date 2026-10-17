/**
 * Floating Panel: a raised window with a bordered header, its title beside
 * small round controls whose marks are drawn in CSS (a bar to minimize, a
 * box to maximize, two boxes to restore, a cross to close), and a body that
 * scrolls. The topmost panel casts the larger shadow; one behind casts less.
 * The drag trigger shows a grab cursor, and a grabbing one while dragged;
 * each edge and corner shows its resize cursor, and the bottom-end corner a
 * grip of dots. A stage change eases the panel's place and size, and a drag
 * follows the pointer at once; the ease travels, so reduced motion jumps.
 *
 * `header: 'plain'` drops the header's divider and fill.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { ladder, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { FloatingPanelSlots } from '../floatingPanel.js'
import {
  component,
  focusRing,
  hover,
  ref,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

/** A round ghost button holding a mark of `marks`. */
const control = (...marks: ReadonlyArray<StyleValue>) =>
  component(
    Style.self({
      position: 'relative',
      flex: 'none',
      inlineSize: ladder('icon'),
      blockSize: ladder('icon'),
      padding: '0',
      border: '0',
      borderRadius: ref.radius.full,
      background: 'transparent',
      color: ref.text.muted,
      cursor: 'pointer',
      ...transition('background-color, color'),
    }),
    Style.nest('&::before, &::after', {
      content: '""',
      position: 'absolute',
      insetInlineStart: '50%',
      insetBlockStart: '50%',
      boxSizing: 'border-box',
      translate: '-50% -50%',
    }),
    ...marks,
    hover({ background: unfilledHover, color: ref.text.default }),
    focusRing,
  )

const box = (size: string): Declarations => ({
  inlineSize: size,
  blockSize: size,
  border: `${ref.border.thick} solid currentColor`,
  borderRadius: '2px',
})

const bar: Declarations = {
  inlineSize: '0.65em',
  blockSize: ref.border.thick,
  background: 'currentColor',
}

/** Where each edge's and corner's handle sits, physically, as `data-edge` names it. */
const edges: ReadonlyArray<readonly [string, Declarations]> = [
  ['n', { top: '-4px', left: '8px', right: '8px', height: '8px', cursor: 'ns-resize' }],
  ['s', { bottom: '-4px', left: '8px', right: '8px', height: '8px', cursor: 'ns-resize' }],
  ['e', { right: '-4px', top: '8px', bottom: '8px', width: '8px', cursor: 'ew-resize' }],
  ['w', { left: '-4px', top: '8px', bottom: '8px', width: '8px', cursor: 'ew-resize' }],
  ['ne', { top: '-4px', right: '-4px', width: '14px', height: '14px', cursor: 'nesw-resize' }],
  ['sw', { bottom: '-4px', left: '-4px', width: '14px', height: '14px', cursor: 'nesw-resize' }],
  ['nw', { top: '-4px', left: '-4px', width: '14px', height: '14px', cursor: 'nwse-resize' }],
  ['se', { bottom: '-4px', right: '-4px', width: '14px', height: '14px', cursor: 'nwse-resize' }],
]

export const FloatingPanel = Style.recipeFor(FloatingPanelSlots)({
  base: {
    root: component(Style.self({})),
    boundary: component(Style.self({})),
    panel: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        minInlineSize: '0',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        color: ref.text.default,
        boxShadow: ref.shadow.xl,
        // Its place and size ease to a new stage; a drag sets them at once.
        transitionProperty: 'left, top, width, height, inset, box-shadow',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.ease,
      }),
      raise(3),
      Style.pseudo('[data-behind]', { boxShadow: ref.shadow.md }),
      Style.pseudo('[data-dragging]', { transitionDuration: '0s', userSelect: 'none' }),
      Style.pseudo('[data-stage="maximized"]', { borderRadius: '0' }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
    ),
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        paddingInline: ref.space.sm,
        paddingBlock: ref.space['2xs'],
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.default}`,
        borderStartStartRadius: 'inherit',
        borderStartEndRadius: 'inherit',
        background: ref.surface.muted,
      }),
      Style.nest(':where([data-stage="minimized"]) &', { borderBlockEnd: '0' }),
    ),
    dragTrigger: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        flex: '1',
        minInlineSize: '0',
        alignSelf: 'stretch',
        borderRadius: ref.radius.sm,
        cursor: 'grab',
        userSelect: 'none',
      }),
      Style.nest(':where([data-dragging]) &', { cursor: 'grabbing' }),
      Style.nest(':where([data-stage="maximized"]) &', { cursor: 'default' }),
      focusRing,
    ),
    title: component(
      Style.self({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
    ),
    controls: component(Style.self({ display: 'flex', alignItems: 'center', gap: '2px' })),
    minimize: control(Style.nest('&::before', { ...bar, insetBlockStart: '62%' })),
    maximize: control(Style.nest('&::before', box('0.7em'))),
    restore: control(
      Style.nest('&::before', { ...box('0.55em'), translate: '-35% -65%' }),
      Style.nest('&::after', {
        ...box('0.55em'),
        translate: '-65% -35%',
        background: ref.surface.muted,
      }),
    ),
    close: control(
      Style.nest('&::before', { ...bar, rotate: '45deg' }),
      Style.nest('&::after', { ...bar, rotate: '-45deg' }),
    ),
    body: component(
      Style.self({ flex: '1', minBlockSize: '0', overflow: 'auto', padding: ref.space.sm }),
    ),
    handle: component(
      Style.self({ position: 'absolute', zIndex: '1' }),
      ...edges.map(([edge, place]) => Style.pseudo(`[data-edge="${edge}"]`, place)),
      // The corner the keys resize from shows a grip, so it reads as a place to take hold.
      Style.pseudo('[tabindex]', {
        backgroundImage: `radial-gradient(circle, ${ref.text.muted} 1px, transparent 1.5px)`,
        backgroundSize: '4px 4px',
        backgroundPosition: 'center',
        borderRadius: ref.radius.sm,
      }),
      focusRing,
    ),
  },
  variants: {
    header: {
      divided: {},
      plain: {
        header: variant(Style.self({ borderBlockEnd: '0', background: 'transparent' })),
      },
    },
  },
  defaults: { header: 'divided' },
})
