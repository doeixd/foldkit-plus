/**
 * The shopping cart's appearance, as `foldkit-mixins` data. `main.ts` and the
 * pages draw the markup through the Slots declared here; everything it looks
 * like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type Piece, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'

/**
 * Blue, as upstream's `blue-500` nav bar, links and buttons are.
 * A white base, so the cards stand out from the gray page.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

const content = L.in('layouts', Layout.center({ max: '56rem' }))

const centered = [content, U.textCenter]

const heading = [
  U.text('4xl'),
  U.font('bold'),
  U.color('text.overt'),
  { margin: `0 0 ${t.space.xl}` },
]

/** Upstream's `bg-white rounded-lg shadow p-6`. */
const card = [
  U.p('lg'),
  U.rounded('lg'),
  U.bg('surface.base'),
  { boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' },
]

/** A row of an item's details on the left and its controls on the right. */
const itemRow = [
  U.p('md'),
  U.rounded('lg'),
  U.flex,
  U.items('center'),
  U.justify('between'),
  { border: `${t.border.thin} solid ${t.outline.subtle}` },
]

const itemName = [U.text('md'), U.font('semibold'), U.color('text.overt'), { margin: '0' }]

const itemPrice = [U.color('text.muted'), { margin: '0' }]

/** Upstream's `flex items-center gap-2`: one line, unlike `Layout.cluster`, which wraps. */
const controls = [U.flex, U.items('center'), U.gap('xs')]

const quantity = [U.py('2xs'), U.px('sm'), U.font('medium')]

const empty = [U.py('xl'), U.textCenter, U.color('text.muted'), { margin: '0' }]

const emptyActions = [U.textCenter, { marginTop: t.space.md }]

const actions: StyleValue = L.in('layouts', Layout.cluster({ gap: t.space.md, justify: 'center' }))

/** A fill `fill` with text in `ink`, darkened to `hover` under the pointer. */
const filled = (fill: string, ink: string, hover: string): Piece => [
  { background: fill, color: ink },
  Style.pseudo(':hover', { background: hover }),
]

/** Upstream's `px-6 py-2 rounded-lg font-medium`: the page-level actions. */
const wide = [U.py('xs'), U.px('lg'), U.rounded('lg'), U.font('medium')]

/** A link drawn as a filled button, as upstream draws its navigation actions. */
const linkButton = (fill: Piece): Piece => [
  wide,
  fill,
  { display: 'inline-block', textDecoration: 'none' },
]

const accentFill = filled(t.accent.default, t.accent['on-fill'], t.accent.hover)
const successFill = filled(t.success.default, t.success['on-fill'], t.success.outline)
const errorFill = filled(t.error.default, t.error['on-fill'], t.error.outline)
const neutralFill = filled(t.text.muted, t.surface.base, t.text.subtle)

// PAGE

export const ShopPage = slots(
  {
    page: [U.bg('surface.muted'), U.color('text.default'), { minHeight: '100vh' }],
    header: {},
    nav: [
      U.p('md'),
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      { marginBottom: t.space.lg },
    ],
    navList: [
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.lg, justify: 'center' })),
      { margin: '0', listStyle: 'none' },
    ],
    navItem: {},
    // The link to the section the route is in carries `aria-current="page"`.
    navLink: [
      U.font('medium'),
      {
        display: 'inline-block',
        padding: `${t.space['2xs']} ${t.space.sm}`,
        borderRadius: t.radius.sm,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo('[aria-current="page"]', {
        background: `color-mix(in oklch, ${t.accent.active} 50%, transparent)`,
      }),
    ],
    main: U.py('xl'),
    notFound: centered,
    notFoundHeading: [heading, U.color('error.default'), { marginBottom: t.space.lg }],
    notFoundText: [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.md}` }],
    link: [
      U.color('accent.default'),
      { textDecoration: 'none' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ],
  },
  { name: 'PageStyle' },
)

// PRODUCTS

export const ProductsPart = slots(
  {
    content,
    heading,
    card,
    search: [{ display: 'block', marginBottom: t.space.lg }],
    products: [U.grid, U.gap('md')],
    product: [itemRow, Style.pseudo(':hover', { background: t.surface.subtle })],
    productDetails: {},
    productName: itemName,
    productPrice: itemPrice,
    quantityControls: controls,
    quantity: [quantity, U.textCenter, { minWidth: '2rem', fontFamily: t.font.mono }],
    goToCart: [U.textCenter, { marginTop: t.space.lg }],
    goToCartLink: linkButton(successFill),
  },
  { name: 'ProductsStyle' },
)

// CART

export const CartPart = slots(
  {
    content,
    heading,
    card,
    body: {},
    empty,
    emptyActions,
    shopLink: linkButton(accentFill),
    items: [L.in('layouts', Layout.stack({ gap: t.space.md })), { marginBottom: t.space.lg }],
    item: itemRow,
    itemDetails: {},
    itemName,
    itemPrice,
    itemControls: controls,
    quantity,
    summary: [
      {
        marginBottom: t.space.lg,
        paddingTop: t.space.md,
        borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    totalRow: [U.flex, U.items('center'), U.justify('between')],
    total: [U.text('xl'), U.font('bold'), U.color('text.overt'), { margin: '0' }],
    actions,
    continueLink: linkButton(neutralFill),
    checkoutLink: linkButton(successFill),
  },
  { name: 'CartStyle' },
)

// CHECKOUT

export const CheckoutPart = slots(
  {
    confirmation: centered,
    successHeading: [heading, U.color('success.ink')],
    successPanel: [
      U.p('lg'),
      U.rounded('lg'),
      U.bg('success.subtle'),
      {
        marginBottom: t.space.lg,
        border: `${t.border.thin} solid ${t.success.default}`,
      },
    ],
    successLead: [U.text('lg'), U.color('text.default'), { margin: `0 0 ${t.space.md}` }],
    successNote: [U.color('text.muted'), { margin: '0' }],
    shopLink: linkButton(accentFill),
    content,
    heading,
    card,
    empty,
    emptyActions,
    summary: {},
    summaryHeading: [
      U.text('2xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space.md}` },
    ],
    lines: [L.in('layouts', Layout.stack({ gap: t.space.xs })), { marginBottom: t.space.lg }],
    line: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.py('xs'),
      { borderBottom: `${t.border.thin} solid ${t.outline.subtle}` },
    ],
    lineItem: {},
    lineName: U.font('medium'),
    lineQuantity: [U.color('text.muted'), { marginLeft: t.space.xs }],
    linePrice: U.font('medium'),
    total: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.text('xl'),
      U.font('bold'),
      { marginBottom: t.space.lg },
    ],
    totalLabel: {},
    totalAmount: {},
    field: { marginBottom: t.space.lg },
    actions,
    backLink: linkButton(neutralFill),
  },
  { name: 'CheckoutStyle' },
)

// CONTROLS

export const SearchInputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({
    base: { input: [{ paddingInline: t.space.md, borderRadius: t.radius.lg }] },
  })(),
  { name: 'SearchInputStyle' },
)

export const DeliveryInstructionsStyle = forSlots(TextareaSlots)(
  Recipes.Textarea.extend({
    base: {
      textarea: [
        {
          boxSizing: 'border-box',
          height: '6rem',
          paddingInline: t.space.md,
          borderRadius: t.radius.lg,
          resize: 'none',
        },
      ],
      label: [U.text('lg'), U.font('semibold'), { marginBlockEnd: t.space.xs }],
    },
  })(),
  { name: 'DeliveryInstructionsStyle' },
)

/** Upstream's `px-4 py-2 rounded-lg`: the shipped accent button, rounder. */
export const AddToCartButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: [U.rounded('lg')] } })(),
  { name: 'AddToCartButtonStyle' },
)

/** Upstream's `w-8 h-8 rounded` gray square for `-` and `+`. */
export const QuantityButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [U.rounded('sm'), { width: '2rem', height: '2rem', padding: '0' }],
    },
  })({ tone: 'neutral' }),
  { name: 'QuantityButtonStyle' },
)

/** Upstream's `px-3 py-1 rounded ml-2` red button. */
export const RemoveButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [errorFill, U.py('2xs'), U.px('sm'), U.rounded('sm'), { marginLeft: t.space.xs }],
    },
  })({ tone: 'danger' }),
  { name: 'RemoveButtonStyle' },
)

export const ClearCartButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: [wide, errorFill] } })({ tone: 'danger' }),
  { name: 'ClearCartButtonStyle' },
)

export const PlaceOrderButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: [wide, successFill] } })(),
  { name: 'PlaceOrderButtonStyle' },
)
