/**
 * Sheet: the Dialog recipe with its panel pinned to an edge of the viewport,
 * shadcn's Sheet and vaul's Drawer. It styles `@foldkit/ui`'s Dialog through
 * `DialogSlots`, so the focus trap, Escape and the backdrop's dismissal stay
 * the Dialog's. The edge is the Sheet's (`Sheet.init({ side })`), which its
 * view draws as `data-side` on the dialog and `data-sheet` on the panel, so
 * the drag and the look read one value.
 *
 * The panel rests where `--fk-sheet-snap` (the share of it that shows) puts
 * it, follows `--fk-sheet-offset` while dragged, and slides in from its edge
 * on the slow tier; the slide travels, so reduced motion keeps only the fade,
 * and a drag follows the pointer with no transition. Its padding keeps clear
 * of a phone's safe areas on the sides it touches. `size` is its extent
 * across the page; `handle: 'bar'` (the default) draws the handle a drag
 * starts on and rounds the inner corners. `sheetPage`, on the application's
 * page, steps it back while a sheet drawn with `scalesPage` is open.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { DialogSlots } from '../dialog.js'
import { component, ref, travelled, variant } from './design.js'
import { Dialog } from './dialog.js'

type Side = 'top' | 'right' | 'bottom' | 'left'
const allSides = ['top', 'right', 'bottom', 'left'] as const

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

/**
 * How far in from fully open: the drag's offset while one runs, else the
 * share of the panel its resting point hides. A translate's percentage is of
 * the panel's own size along that axis.
 */
const travel = 'var(--fk-sheet-offset, calc((1 - var(--fk-sheet-snap, 1)) * 100%))'

/** The translate that draws the panel `by` in from its edge. */
const moved = (side: Side, by: string): string =>
  ({
    top: `0 calc(-1 * ${by})`,
    right: `${by} 0`,
    bottom: `0 ${by}`,
    left: `calc(-1 * ${by}) 0`,
  })[side]

/** Where the dialog's grid puts its one item, the panel: `align-items justify-items`. */
const placed = {
  top: 'start stretch',
  right: 'stretch right',
  bottom: 'end stretch',
  left: 'stretch left',
} as const

/**
 * The panel's padding, past the safe area on each side it touches (a
 * phone's notch, home bar or rounded corner), the Dialog's elsewhere.
 */
const clear = (side: Side): Declarations => {
  const away = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side]
  const padding = {
    top: 'paddingTop',
    right: 'paddingRight',
    bottom: 'paddingBottom',
    left: 'paddingLeft',
  }
  return Object.fromEntries(
    allSides.map(edge => [
      padding[edge],
      edge === away ? ref.space.lg : `calc(${ref.space.lg} + env(safe-area-inset-${edge}, 0px))`,
    ]),
  )
}

/** Its extent across the page: a side sheet's width, a top or bottom one's height at most. */
const across = (side: Side): Declarations =>
  side === 'top' || side === 'bottom'
    ? { maxBlockSize: 'var(--_fk-sheet-block, 80%)' }
    : // The Dialog's margin from the viewport's edges is no sheet's.
      { inlineSize: 'var(--_fk-sheet-inline, min(24rem, 75%))', maxBlockSize: 'none' }

const length = '6.25rem'
const thickness = '0.375rem'

/**
 * The handle on the panel's inner edge: an item of the panel's column, first
 * or last whatever the view's order, from the top or bottom; a bar standing
 * on that edge, out of the flow, from the left or right.
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

const onSide = (side: Side) => `&[data-sheet="${side}"]`

const panelOn = (side: Side): StyleValue =>
  Style.compose(
    Style.nest(onSide(side), {
      ...frame(side),
      ...across(side),
      ...clear(side),
      translate: moved(side, travel),
      // A bottom sheet stands on the on-screen keyboard, which `Dialog.keyboard` measures.
      ...(side === 'bottom' ? { marginBottom: 'var(--fk-keyboard-inset, 0px)' } : {}),
    }),
    // A slide replaces the Dialog's growth; the fade stays.
    Style.nest(`${onSide(side)}[data-closed]`, { scale: 'none', translate: moved(side, '100%') }),
    // Under a sheet opened from it: smaller, and up from a bottom edge, as vaul's nested drawers.
    Style.nest(`${onSide(side)}[data-covered]`, {
      scale: '0.95',
      translate: moved(side, side === 'bottom' ? `calc(${travel} - ${ref.space.md})` : travel),
    }),
  )

/** An extent across the page for each side: a side sheet's width, a top or bottom one's most height. */
const extent = (inline: string, block: string) =>
  variant(Style.self({ '--_fk-sheet-inline': inline, '--_fk-sheet-block': block }))

const dialog = Dialog({ size: null })

export const Sheet = Style.recipeFor(DialogSlots)({
  base: {
    ...dialog,
    dialog: Style.compose(
      dialog.dialog ?? Style.compose(),
      // In `variants`, so it beats the Dialog's centering grid.
      variant(
        ...allSides.map(side =>
          Style.nest(`&[data-side="${side}"][open]`, { placeItems: placed[side] }),
        ),
      ),
    ),
    panel: Style.compose(
      dialog.panel ?? Style.compose(),
      variant(
        Style.self({
          // The Dialog centers its panel with `margin-inline: auto`, which in a
          // grid item would beat the placement above.
          margin: '0',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }),
        ...allSides.map(panelOn),
        // It follows the pointer; the release slides on the Dialog's transition.
        Style.pseudo('[data-dragging]', { transitionDuration: '0s' }),
      ),
    ),
    handle: Style.compose(
      component(
        Style.self({
          display: 'none',
          position: 'relative',
          borderRadius: ref.radius.full,
          background: ref.outline.default,
          cursor: 'grab',
          // No callout of iOS's own for a press held while dragging.
          WebkitTouchCallout: 'none',
        }),
        // A target a thumb can find, larger than the bar it draws.
        Style.nest('&::after', {
          content: '""',
          position: 'absolute',
          inset: `calc(-1 * ${ref.space.sm}) calc(-1 * ${ref.space.md})`,
        }),
        Style.nest(':where([data-dragging]) > &', { cursor: 'grabbing' }),
      ),
      variant(
        ...allSides.map(side => Style.nest(`:where([data-sheet="${side}"]) > &`, grabber[side])),
      ),
    ),
  },
  variants: {
    size: {
      sm: { panel: extent('min(20rem, 75%)', '50%') },
      md: { panel: extent('min(24rem, 75%)', '80%') },
      lg: { panel: extent('min(32rem, 90%)', '90%') },
      full: { panel: extent('100%', '100%') },
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
  defaults: { size: 'md', handle: 'bar' },
})

/**
 * For the application's page, behind a sheet drawn with `scalesPage`: it
 * steps back, smaller and rounded, while that sheet is open, as vaul's
 * `shouldScaleBackground`, on the slow tier, which travels. Put it on an
 * element beside the sheet, never around it: a scaled element holds every
 * fixed element inside it, the sheet's dialog too.
 */
export const sheetPage: StyleValue = component(
  Style.self({
    transformOrigin: 'top',
    transitionProperty: 'scale, translate, border-radius',
    transitionDuration: travelled(ref.motion.slow),
    transitionTimingFunction: ref.motion.ease,
  }),
  Style.nest(':root:has([data-scales-page]:not([data-closed])) &', {
    scale: '0.95',
    translate: `0 calc(${ref.space.md} + env(safe-area-inset-top, 0px))`,
    borderRadius: ref.radius.lg,
  }),
)
