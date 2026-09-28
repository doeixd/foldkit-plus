/**
 * The board's appearance, as `foldkit-mixins` data. The views in `view/`
 * draw the markup through these Slots; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue over near-gray surfaces, as upstream's Tailwind `blue-500` and `gray-*`. */
const palette = Theme.oklch({
  accent: { h: 260, c: 0.214, l: '62.3%' },
  surfaceSaturation: 0.003,
})

/** A white base, for the header and the cards, over the page's `surface.muted`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

/** Upstream's `sr-only`: out of sight, still read. */
const visuallyHidden: StyleValue = Style.self({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
})

/** Upstream's `shadow-sm`. */
const smallShadow = '0 1px 3px 0 rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%)'

/** Upstream's `blue-300`, the dashed edge of a drop target. */
const dropEdge = `color-mix(in oklch, ${t.accent.default} 55%, ${t.surface.base})`

// BOARD

export const BoardSlots = Slots.define({
  page: container,
  header: container,
  heading: container,
  board: container,
  column: container,
  columnHeader: container,
  columnName: container,
  cardCount: container,
  cardList: container,
  card: container,
  cardTitle: container,
  cardDescription: container,
  dropPlaceholder: container,
  columnFooter: container,
  addCardForm: container,
  newCardLabel: container,
  formActions: container,
  ghost: container,
  ghostCard: container,
  announcer: container,
})

const cardBox: StyleValue = Style.self({
  padding: t.space.sm,
  borderRadius: t.radius.lg,
  background: t.surface.base,
})

export const BoardStyle = Style.forSlots(BoardSlots)(
  {
    page: Style.self({
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: t.surface.muted,
      color: t.text.default,
    }),
    header: Style.self({
      padding: `${t.space.md} ${t.space.lg}`,
      background: t.surface.base,
      borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    heading: Style.self({
      margin: '0',
      fontSize: t.size.lg,
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    }),
    board: Style.compose(
      L.in('layouts', Layout.autoGrid({ gap: t.space.lg, minItemSize: '16rem' })),
      Style.self({ flex: '1', alignItems: 'start', padding: t.space.lg }),
    ),
    column: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0',
        padding: t.space.sm,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
        border: `${t.border.thick} solid transparent`,
      }),
      Style.states({ 'drop-target': { borderStyle: 'dashed', borderColor: dropEdge } }),
    ),
    columnHeader: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: t.space.xs,
      marginBottom: t.space.sm,
      borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    columnName: Style.self({
      margin: '0',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      color: t.text.muted,
    }),
    cardCount: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
    cardList: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({
        flex: '1',
        minHeight: '0',
        overflowY: 'auto',
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    card: Style.compose(
      cardBox,
      Style.self({
        border: `${t.border.thick} solid transparent`,
        outline: 'none',
        boxShadow: smallShadow,
        cursor: 'grab',
      }),
      Style.pseudo(':focus', { borderColor: t.outline.overt }),
      Style.states({
        'keyboard-dragged': { borderColor: t.accent.default, cursor: 'auto' },
      }),
    ),
    cardTitle: Style.self({
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.overt,
    }),
    cardDescription: Style.self({
      marginTop: t.space['2xs'],
      fontSize: t.size.xs,
      color: t.text.muted,
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: '2',
      overflow: 'hidden',
    }),
    dropPlaceholder: Style.self({
      height: '3rem',
      boxSizing: 'border-box',
      borderRadius: t.radius.lg,
      border: `${t.border.thick} dashed ${dropEdge}`,
      background: t.accent.subtle,
    }),
    columnFooter: Style.self({
      marginTop: t.space.sm,
      paddingTop: t.space.xs,
      borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    addCardForm: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    newCardLabel: visuallyHidden,
    formActions: Style.self({ display: 'flex', justifyContent: 'flex-end', gap: t.space.xs }),
    ghost: Style.self({ width: '16rem' }),
    ghostCard: Style.compose(
      cardBox,
      Style.self({
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        transform: 'scale(1.05) rotate(2deg)',
      }),
    ),
    announcer: visuallyHidden,
  },
  { name: 'BoardStyle', layer: app },
)

// ADD CARD

/** Upstream's dashed, full-width `+ Add card` button. */
export const AddCardButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        Style.self({
          width: '100%',
          padding: t.space.xs,
          borderRadius: t.radius.lg,
          border: `${t.border.thin} dashed ${t.outline.default}`,
          background: 'transparent',
          color: t.text.muted,
          fontWeight: t.weight.normal,
        }),
        Style.pseudo(':hover', { borderColor: t.outline.overt, color: t.text.subtle }),
      ),
    },
  })({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
  { name: 'AddCardButtonStyle', layer: app },
)

export const NewCardInputStyle = Style.forSlots(InputSlots)(
  Recipes.Input.extend({
    base: { input: Style.self({ boxSizing: 'border-box', borderRadius: t.radius.lg }) },
  })({ size: 'sm' }),
  { name: 'NewCardInputStyle', layer: app },
)

export const CancelButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: Style.self({ borderRadius: t.radius.lg, fontWeight: t.weight.normal }) },
  })({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
  { name: 'CancelButtonStyle', layer: app },
)

export const SubmitButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: Style.self({ borderRadius: t.radius.lg, fontWeight: t.weight.medium }) },
  })({ size: 'sm' }),
  { name: 'SubmitButtonStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'light'`
 * keeps the page light in a dark browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)
