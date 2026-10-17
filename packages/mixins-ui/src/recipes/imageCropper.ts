/**
 * Image cropper: the viewport a framed well, the image placed and turned from
 * the geometry the view writes (`--fk-cropper-*`, in pixels), and the
 * selection a hairline box whose shadow veils the rest of the image, so the
 * veil follows a round crop's ellipse with no mask. The handles sit on the
 * selection's corners and edges, each with a wider invisible hold on a coarse
 * pointer, and say their resize cursor. The guides, lines at the thirds, show
 * while a drag runs (`guides: 'drag'`), always, or never. What a key or a
 * control moves glides on the fast tier, scaled by `travel` so reduced motion
 * snaps it; a drag follows the pointer at once. `viewport` picks the well's
 * shape, `handles` whether the edges have them too. The plane is physical:
 * a crop's left is the image's left in either direction.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { ImageCropperSlots } from '../imageCropper.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  imageEdge,
  onLadder,
  ref,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

const v = (name: string) => `var(--fk-cropper-${name})`

// Each handle's place on the selection's box, as shares across and down.
const places: Readonly<Record<string, readonly [number, number, string]>> = {
  n: [0.5, 0, 'ns-resize'],
  ne: [1, 0, 'nesw-resize'],
  e: [1, 0.5, 'ew-resize'],
  se: [1, 1, 'nwse-resize'],
  s: [0.5, 1, 'ns-resize'],
  sw: [0, 1, 'nesw-resize'],
  w: [0, 0.5, 'ew-resize'],
  nw: [0, 0, 'nwse-resize'],
}

const handleAt = Object.entries(places).map(([handle, [across, down, cursor]]) =>
  Style.pseudo(`[data-handle="${handle}"]`, {
    left: `calc(${v('x')} + ${v('w')} * ${across})`,
    top: `calc(${v('y')} + ${v('h')} * ${down})`,
    cursor,
  }),
)

/** What a key or a control moves glides; a drag (`data-dragging` on the root) does not. */
const glides = (properties: string): Declarations => ({
  transitionProperty: properties,
  transitionDuration: travelled(ref.motion.fast),
  transitionTimingFunction: ref.motion.ease,
})
const still = Style.nest('[data-dragging] &', { transitionDuration: '0s' })

const turn = (path: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${path}'/%3E%3C/svg%3E")`
// Lucide's rotate-ccw and rotate-cw (ISC).
const left = turn('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5')
const right = turn('M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5')

const control: Declarations = {
  ...onLadder,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  boxSizing: 'border-box',
  border: `${ref.border.thin} solid ${ref.outline.default}`,
  borderRadius: ref.radius.md,
  background: 'transparent',
  color: ref.text.default,
  font: 'inherit',
  cursor: 'pointer',
}

export const ImageCropper = Style.recipeFor(ImageCropperSlots)({
  base: {
    root: component(
      Style.self({ display: 'grid', gap: ref.space.sm, inlineSize: '100%' }),
      Style.pseudo('[data-disabled]', { opacity: '0.5' }),
    ),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    viewport: component(
      Style.self({
        position: 'relative',
        overflow: 'hidden',
        inlineSize: '100%',
        aspectRatio: '4 / 3',
        borderRadius: ref.radius.md,
        background: ref.surface.muted,
        // The pointer drags the crop, never the page.
        touchAction: 'none',
        userSelect: 'none',
        ...imageEdge,
      }),
    ),
    stage: component(Style.self({ position: 'absolute', inset: '0' })),
    pan: component(
      Style.self({
        position: 'absolute',
        left: v('image-x'),
        top: v('image-y'),
        inlineSize: v('image-w'),
        blockSize: v('image-h'),
        cursor: 'grab',
        ...glides('left, top, width, height'),
      }),
      still,
      Style.nest('[data-dragging] &:active', { cursor: 'grabbing' }),
    ),
    image: component(
      Style.self({
        position: 'absolute',
        left: '50%',
        top: '50%',
        maxInlineSize: 'none',
        inlineSize: v('natural-w'),
        blockSize: v('natural-h'),
        translate: '-50% -50%',
        rotate: v('rotation'),
        pointerEvents: 'none',
        ...glides('width, height, rotate'),
      }),
      still,
      // Unplaced, it is drawn only to load. The image says so itself: a rule reading the
      // root from below matched any ancestor without the mark, `body` included.
      Style.pseudo(':not([data-ready])', { visibility: 'hidden' }),
    ),
    selection: component(
      Style.self({
        position: 'absolute',
        left: v('x'),
        top: v('y'),
        inlineSize: v('w'),
        blockSize: v('h'),
        boxSizing: 'border-box',
        border: `${ref.border.thin} solid ${ref.surface.base}`,
        // The veil over the rest of the image: a shadow wider than any viewport, clipped by it.
        boxShadow: `0 0 0 100vmax color-mix(in oklch, ${ref.surface.bedrock} 55%, transparent)`,
        cursor: 'move',
        ...glides('left, top, width, height'),
      }),
      still,
      Style.nest('[data-shape="round"] &', { borderRadius: ref.radius.full }),
      focusRing,
    ),
    guides: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        borderRadius: 'inherit',
        backgroundImage: [
          `linear-gradient(to right, transparent calc(100% / 3 - 0.5px), ${ref.surface.base} 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), ${ref.surface.base} 0 calc(200% / 3 + 0.5px), transparent 0)`,
          `linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), ${ref.surface.base} 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), ${ref.surface.base} 0 calc(200% / 3 + 0.5px), transparent 0)`,
        ].join(', '),
        opacity: '0',
        transitionProperty: 'opacity',
        transitionDuration: ref.motion.fast,
      }),
    ),
    handle: component(
      Style.self({
        position: 'absolute',
        boxSizing: 'border-box',
        inlineSize: `calc(${ladder('icon')} * 0.75)`,
        blockSize: `calc(${ladder('icon')} * 0.75)`,
        translate: '-50% -50%',
        borderRadius: ref.radius.sm,
        background: ref.surface.base,
        boxShadow: ref.shadow.sm,
        ...glides('left, top'),
      }),
      still,
      ...handleAt,
      // A finger needs a wider hold than the mark shows.
      Style.at(
        '@media (pointer: coarse)',
        Style.nest('&::before', {
          content: "''",
          position: 'absolute',
          inset: `calc(${ladder('icon')} * -0.5)`,
        }),
      ),
    ),
    controls: component(
      Style.self({ display: 'flex', alignItems: 'center', gap: ref.space.xs, flexWrap: 'wrap' }),
    ),
    zoom: component(Style.self({ flex: '1', minInlineSize: '8rem' })),
    rotate: component(
      Style.self({ ...control, inlineSize: ladder('height'), paddingInline: '0' }),
      Style.nest('&::before', {
        content: "''",
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
        background: 'currentColor',
        mask: `${left} center / contain no-repeat`,
      }),
      Style.nest('&[data-turn="right"]::before', { mask: `${right} center / contain no-repeat` }),
      hover({ background: unfilledHover }),
      focusRing,
      disabled,
    ),
    reset: component(
      Style.self(control),
      hover({ background: unfilledHover }),
      focusRing,
      disabled,
    ),
  },
  variants: {
    guides: {
      drag: { guides: variant(Style.nest('[data-dragging] &', { opacity: '1' })) },
      always: { guides: variant(Style.self({ opacity: '0.7' })) },
      none: { guides: variant(Style.self({ display: 'none' })) },
    },
    handles: {
      all: {},
      corners: {
        handle: variant(
          Style.pseudo(
            ':is([data-handle="n"], [data-handle="e"], [data-handle="s"], [data-handle="w"])',
            {
              display: 'none',
            },
          ),
        ),
      },
    },
    viewport: {
      landscape: {},
      wide: { viewport: variant(Style.self({ aspectRatio: '16 / 9' })) },
      square: { viewport: variant(Style.self({ aspectRatio: '1' })) },
    },
  },
  defaults: { guides: 'drag', handles: 'all', viewport: 'landscape' },
})
