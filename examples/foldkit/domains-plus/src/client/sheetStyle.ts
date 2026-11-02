/**
 * The sheets' look: the cart's and the phone's, which load on intent with
 * their views (`sheetViews.ts`) and so are not in the page's first chunk.
 */
import { Style, type Piece } from 'foldkit-mixins'
import { DialogSlots, Recipes } from 'foldkit-mixins-ui'
import { forSlots, srOnly, t } from './style.js'

const d = t.domains

/** The phone's sheets, from the bottom. */
export const SheetStyle = forSlots(DialogSlots)(Recipes.Sheet(), { name: 'SheetStyle' })

/** The cart: a sheet at the window's right edge, upstream's 420px or the whole of a phone. */
export const CartSheetStyle = forSlots(DialogSlots)(
  Recipes.Sheet({ size: 'full', handle: 'none' }),
  {
    name: 'CartSheetStyle',
  },
)

/** The sheets in upstream's greys: its panel, its hairline, its headings and notes. */
export const SheetLook = forSlots(DialogSlots)(
  {
    backdrop: [Style.class('dialog-backdrop'), { background: d.scrim }],
    panel: { background: d.panel, color: d.text, borderColor: d.lineStrong },
    title: { margin: '0', fontSize: '22px', fontWeight: '550', letterSpacing: '-0.7px' },
    description: { margin: '13px 0', fontSize: '13px', lineHeight: '1.7', color: d.soft },
  },
  { name: 'SheetLook' },
)

/**
 * Upstream's cart stands open at once: no slide past the window's edge and
 * no fade, so its text is read at full contrast the moment it shows.
 */
export const CartSheetLook = forSlots(DialogSlots)(
  {
    backdrop: { transitionDuration: '0s' },
    panel: { maxInlineSize: '420px', transitionDuration: '0s' },
    description: Style.class('demo-note'),
  },
  { name: 'CartSheetLook' },
)

/**
 * Upstream's phone sheets slide for its own half second, not the theme's
 * motion scale, and not at all under reduced motion (the `travel` knob is 0
 * there); a drag still follows the finger with none.
 */
const slide = (duration: string): Piece =>
  Style.pseudo(':not([data-dragging])', {
    transitionDuration: `calc(${duration} * ${t.knob.travel})`,
  })

const phoneSheet = {
  backdrop: [Style.class('filters-backdrop'), slide(d.slide)],
  // Upstream's sheets name themselves to a screen reader alone.
  title: srOnly,
}

/** The phone's TLD sheet: its search above, the extensions scrolling below it. */
export const TldSheetLook = forSlots(DialogSlots)(
  {
    ...phoneSheet,
    panel: [
      Style.class('filters-panel'),
      Style.class('tld-panel'),
      {
        display: 'flex',
        height: 'min(360px, 80dvh)',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '0 0 env(safe-area-inset-bottom)',
      },
      slide(d.slide),
    ],
  },
  { name: 'TldSheetLook' },
)

/** The phone's Filters and sort sheet: availability, then sort, as upstream's. */
export const FiltersSheetLook = forSlots(DialogSlots)(
  {
    ...phoneSheet,
    panel: [
      Style.class('filters-panel'),
      { maxHeight: '90dvh', padding: '6px 6px max(6px, env(safe-area-inset-bottom))' },
      slide(d.slide),
    ],
  },
  { name: 'FiltersSheetLook' },
)
