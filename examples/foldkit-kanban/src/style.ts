/**
 * The board's appearance, as `foldkit-mixins` data. The views in `view/`
 * draw the markup through the Slots declared here; everything it looks
 * like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * Blue over near-gray surfaces, as upstream's Tailwind `blue-500` and `gray-*`.
 * A white base, for the header and the cards, over the page's `surface.muted`.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 260, c: 0.214, l: '62.3%' },
      surfaceSaturation: 0.003,
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

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

const cardBox = [U.p('sm'), U.rounded('lg'), U.bg('surface.base')]

// BOARD

export const KanbanBoard = slots(
  {
    page: [U.column, U.bg('surface.muted'), U.color('text.default'), { minHeight: '100vh' }],
    header: [
      U.bg('surface.base'),
      {
        padding: `${t.space.md} ${t.space.lg}`,
        borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    heading: [U.text('lg'), U.font('semibold'), U.color('text.overt'), { margin: '0' }],
    board: [
      L.in('layouts', Layout.autoGrid({ gap: t.space.lg, minItemSize: '16rem' })),
      U.p('lg'),
      { flex: '1', alignItems: 'start' },
    ],
    column: [
      U.column,
      U.p('sm'),
      U.rounded('lg'),
      U.bg('surface.subtle'),
      {
        minHeight: '0',
        border: `${t.border.thick} solid transparent`,
      },
      Style.states({ 'drop-target': { borderStyle: 'dashed', borderColor: dropEdge } }),
    ],
    columnHeader: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      {
        paddingBottom: t.space.xs,
        marginBottom: t.space.sm,
        borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    columnName: [
      U.text('xs'),
      U.font('semibold'),
      U.color('text.muted'),
      { margin: '0', textTransform: 'uppercase', letterSpacing: '0.025em' },
    ],
    cardCount: [U.text('xs'), U.color('text.muted')],
    cardList: [
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      {
        flex: '1',
        minHeight: '0',
        overflowY: 'auto',
        margin: '0',
        padding: '0',
        listStyle: 'none',
      },
    ],
    card: [
      cardBox,
      {
        border: `${t.border.thick} solid transparent`,
        outline: 'none',
        boxShadow: smallShadow,
        cursor: 'grab',
      },
      Style.pseudo(':focus', { borderColor: t.outline.overt }),
      Style.states({
        'keyboard-dragged': { borderColor: t.accent.default, cursor: 'auto' },
      }),
    ],
    cardTitle: [U.text('sm'), U.font('medium'), U.color('text.overt')],
    cardDescription: [
      U.text('xs'),
      U.color('text.muted'),
      {
        marginTop: t.space['2xs'],
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: '2',
        overflow: 'hidden',
      },
    ],
    dropPlaceholder: [
      U.rounded('lg'),
      U.bg('accent.subtle'),
      {
        height: '3rem',
        boxSizing: 'border-box',
        border: `${t.border.thick} dashed ${dropEdge}`,
      },
    ],
    columnFooter: [
      {
        marginTop: t.space.sm,
        paddingTop: t.space.xs,
        borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    addCardForm: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    newCardLabel: visuallyHidden,
    formActions: [U.flex, U.justify('end'), U.gap('xs')],
    ghost: { width: '16rem' },
    ghostCard: [
      cardBox,
      {
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        transform: 'scale(1.05) rotate(2deg)',
      },
    ],
    announcer: visuallyHidden,
  },
  { name: 'BoardStyle' },
)

// ADD CARD

/** Upstream's dashed, full-width `+ Add card` button. */
export const AddCardButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [
        U.rounded('lg'),
        U.font('normal'),
        U.color('text.muted'),
        {
          width: '100%',
          padding: t.space.xs,
          border: `${t.border.thin} dashed ${t.outline.default}`,
          background: 'transparent',
        },
        Style.pseudo(':hover', { borderColor: t.outline.overt, color: t.text.subtle }),
      ],
    },
  })({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
  { name: 'AddCardButtonStyle' },
)

export const NewCardInputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({
    base: { input: [U.rounded('lg'), { boxSizing: 'border-box' }] },
  })({ size: 'sm' }),
  { name: 'NewCardInputStyle' },
)

export const CancelButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: [U.rounded('lg'), U.font('normal')] },
  })({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
  { name: 'CancelButtonStyle' },
)

export const SubmitButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: [U.rounded('lg'), U.font('medium')] },
  })({ size: 'sm' }),
  { name: 'SubmitButtonStyle' },
)
