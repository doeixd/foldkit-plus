/**
 * Sheet and Drawer: the Dialog recipe with its panel pinned to an edge of the
 * viewport, shadcn's Sheet and vaul's Drawer. Both style `@foldkit/ui`'s
 * Dialog through `DialogSlots`, so the focus trap, Escape and the backdrop's
 * dismissal stay the Dialog's. The panel slides in from its `side` on the
 * slow tier; the slide travels, so reduced motion keeps only the fade.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { DialogSlots } from '../dialog.js'
import { component, ref, variant } from './design.js'
import { Dialog } from './dialog.js'

type Side = 'top' | 'right' | 'bottom' | 'left'

const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
const allCorners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const

/** The panel's one bordered edge, the side facing the page. */
const inner = { top: 'Bottom', right: 'Left', bottom: 'Top', left: 'Right' } as const

/**
 * The inner corners' radius: square on a Sheet, set by the Drawer. A private
 * property, so the Drawer rounds them without a second rule in this layer
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
  side === 'top' || side === 'bottom' ? { maxBlockSize: '80%' } : { inlineSize: 'min(24rem, 75%)' }

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
})

export const Sheet = Style.recipeFor(DialogSlots)({
  base: Dialog({ size: null }),
  variants: {
    side: {
      top: edge('top'),
      right: edge('right'),
      bottom: edge('bottom'),
      left: edge('left'),
    },
  },
  defaults: { side: 'right' },
})

/**
 * vaul's handle: a short bar on the panel's inner edge, drawn by the panel
 * itself, since `DialogSlots` has no element for it and markup outside a Slot
 * would leave a stylist no handle.
 */
const handle = (pseudo: '::before' | '::after'): StyleValue =>
  Style.pseudo(pseudo, {
    content: '""',
    justifySelf: 'center',
    inlineSize: '6.25rem',
    blockSize: '0.375rem',
    borderRadius: ref.radius.full,
    background: ref.outline.default,
  })

/**
 * A Sheet from the bottom by default, its inner corners rounded, with a
 * handle on its inner edge when it comes from the top or bottom: shadcn's
 * Drawer draws none from the left or right.
 */
export const Drawer = Sheet.extend({
  base: { panel: component(Style.self({ '--_fk-sheet-radius': ref.radius.lg })) },
  variants: {
    side: {
      bottom: { panel: variant(handle('::before')) },
      top: { panel: variant(handle('::after')) },
    },
  },
  defaults: { side: 'bottom' },
})
