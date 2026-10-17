/**
 * Sheet: the Dialog recipe with its panel pinned to an edge of the viewport,
 * shadcn's Sheet and, with `handle: 'bar'`, vaul's Drawer. It styles
 * `@foldkit/ui`'s Dialog through `DialogSlots`, so the focus trap, Escape and
 * the backdrop's dismissal stay the Dialog's. The panel slides in from its
 * `side` on the slow tier; the slide travels, so reduced motion keeps only
 * the fade.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { DialogSlots } from '../dialog.js'
import { component, ref, variant } from './design.js'
import { Dialog } from './dialog.js'

type Side = 'top' | 'right' | 'bottom' | 'left'

const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
const allCorners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const

/** The panel's one bordered edge, the side facing the page. */
const inner = { top: 'Bottom', right: 'Left', bottom: 'Top', left: 'Right' } as const

/**
 * The inner corners' radius: square unless the handle rounds them. A private
 * property, so the handle rounds them without a second rule in this layer
 * whose win would depend on emission order.
 */
const radius = 'var(--_fk-sheet-radius, 0)'

/**
 * Every edge's width and every corner's radius as longhands: the stylesheet
 * sorts a rule's declarations, so a `border-width: 0` written beside
 * `border-left-width` would land after it and win.
 */
const frame = (side: Side): Declarations => {
  const facing = inner[side]
  return Object.fromEntries([
    ...sides.map(each => [`border${each}Width`, each === facing ? ref.border.thin : '0']),
    ...allCorners.map(corner => [`border${corner}Radius`, corner.includes(facing) ? radius : '0']),
  ])
}

/** Where the closed panel waits: just past its edge. */
const offstage = { top: '0 -100%', right: '100% 0', bottom: '0 100%', left: '-100% 0' } as const

/** Where the dialog's grid puts its one item, the panel: `align-items justify-items`. */
const placed = {
  top: 'start stretch',
  right: 'stretch right',
  bottom: 'end stretch',
  left: 'stretch left',
} as const

const across = (side: Side): Declarations =>
  side === 'top' || side === 'bottom'
    ? { maxBlockSize: '80%' }
    : // The Dialog's margin from the viewport's edges is no sheet's.
      { inlineSize: 'min(24rem, 75%)', maxBlockSize: 'none' }

const length = '6.25rem'
const thickness = '0.375rem'

/**
 * The handle on the panel's inner edge: an item of the panel's column, first or
 * last whatever the view's order, from the top or bottom; a bar standing on
 * that edge, out of the flow, from the left or right.
 */
const grabber: Record<Side, Declarations> = {
  top: { order: '1', alignSelf: 'center', inlineSize: length, blockSize: thickness },
  bottom: { order: '-1', alignSelf: 'center', inlineSize: length, blockSize: thickness },
  right: {
    position: 'absolute',
    insetBlock: '0',
    marginBlock: 'auto',
    left: ref.space.xs,
    inlineSize: thickness,
    blockSize: length,
  },
  left: {
    position: 'absolute',
    insetBlock: '0',
    marginBlock: 'auto',
    right: ref.space.xs,
    inlineSize: thickness,
    blockSize: length,
  },
}

const edge = (side: Side) => ({
  // In `variants`, so it beats the Dialog's centering grid on the dialog.
  dialog: variant(Style.self({ placeItems: placed[side] })),
  panel: variant(
    Style.self({
      // The Dialog centers its panel with `margin-inline: auto`, which in a
      // grid item would beat the placement above.
      margin: '0',
      // The Dialog's panel is `inline-size: 100%` with padding; without the
      // reset's `border-box`, a top or bottom panel overflowed the viewport.
      boxSizing: 'border-box',
      overflowY: 'auto',
      ...frame(side),
      ...across(side),
    }),
    // A slide replaces the Dialog's growth; the fade stays.
    Style.pseudo('[data-closed]', { scale: 'none', translate: offstage[side] }),
  ),
  handle: variant(Style.self(grabber[side])),
})

export const Sheet = Style.recipeFor(DialogSlots)({
  base: {
    ...Dialog({ size: null }),
    handle: component(
      Style.self({
        display: 'none',
        borderRadius: ref.radius.full,
        background: ref.outline.default,
      }),
    ),
  },
  variants: {
    side: {
      top: edge('top'),
      right: edge('right'),
      bottom: edge('bottom'),
      left: edge('left'),
    },
    /** `bar` draws the handle and rounds the inner corners, vaul's Drawer. */
    handle: {
      none: {},
      bar: {
        panel: variant(Style.self({ '--_fk-sheet-radius': ref.radius.lg })),
        handle: variant(Style.self({ display: 'block' })),
      },
    },
  },
  defaults: { side: 'right', handle: 'none' },
})
