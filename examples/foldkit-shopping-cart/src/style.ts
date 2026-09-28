/**
 * The shopping cart's appearance, as `foldkit-mixins` data. `main.ts` and the
 * pages publish the Slots and draw the markup; everything it looks like lives
 * here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue, as upstream's `blue-500` nav bar, links and buttons are. */
const palette = Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } })

/** A white base, so the cards stand out from the gray page. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

const content = L.in('layouts', Layout.center({ max: '56rem' }))

const centered: StyleValue = Style.compose(content, Style.self({ textAlign: 'center' }))

const heading: StyleValue = Style.self({
  margin: `0 0 ${t.space.xl}`,
  fontSize: t.size['4xl'],
  fontWeight: t.weight.bold,
  color: t.text.overt,
})

/** Upstream's `bg-white rounded-lg shadow p-6`. */
const card: StyleValue = Style.self({
  padding: t.space.lg,
  borderRadius: t.radius.lg,
  background: t.surface.base,
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
})

/** A row of an item's details on the left and its controls on the right. */
const itemRow: StyleValue = Style.self({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: t.space.md,
  border: `${t.border.thin} solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
})

const itemName: StyleValue = Style.self({
  margin: '0',
  fontSize: t.size.md,
  fontWeight: t.weight.semibold,
  color: t.text.overt,
})

const itemPrice: StyleValue = Style.self({ margin: '0', color: t.text.muted })

/** Upstream's `flex items-center gap-2`: one line, unlike `Layout.cluster`, which wraps. */
const controls: StyleValue = Style.self({ display: 'flex', alignItems: 'center', gap: t.space.xs })

const quantity: StyleValue = Style.self({
  paddingBlock: t.space['2xs'],
  paddingInline: t.space.sm,
  fontWeight: t.weight.medium,
})

const empty: StyleValue = Style.self({
  margin: '0',
  paddingBlock: t.space.xl,
  textAlign: 'center',
  color: t.text.muted,
})

const emptyActions: StyleValue = Style.self({ marginTop: t.space.md, textAlign: 'center' })

const actions: StyleValue = L.in('layouts', Layout.cluster({ gap: t.space.md, justify: 'center' }))

/** A fill `fill` with text in `ink`, darkened to `hover` under the pointer. */
const filled = (fill: string, ink: string, hover: string): StyleValue =>
  Style.compose(
    Style.self({ background: fill, color: ink }),
    Style.pseudo(':hover', { background: hover }),
  )

/** Upstream's `px-6 py-2 rounded-lg font-medium`: the page-level actions. */
const wide: StyleValue = Style.self({
  paddingBlock: t.space.xs,
  paddingInline: t.space.lg,
  borderRadius: t.radius.lg,
  fontWeight: t.weight.medium,
})

/** A link drawn as a filled button, as upstream draws its navigation actions. */
const linkButton = (fill: StyleValue): StyleValue =>
  Style.compose(wide, fill, Style.self({ display: 'inline-block', textDecoration: 'none' }))

const accentFill = filled(t.accent.default, t.accent['on-fill'], t.accent.hover)
const successFill = filled(t.success.default, t.success['on-fill'], t.success.outline)
const errorFill = filled(t.error.default, t.error['on-fill'], t.error.outline)
const neutralFill = filled(t.text.muted, t.surface.base, t.text.subtle)

// PAGE

export const PageSlots = Slots.define({
  page: container,
  header: container,
  nav: container,
  navList: container,
  navItem: container,
  navLink: container,
  main: container,
  notFound: container,
  notFoundHeading: container,
  notFoundText: container,
  link: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({ minHeight: '100vh', background: t.surface.muted, color: t.text.default }),
    nav: Style.self({
      marginBottom: t.space.lg,
      padding: t.space.md,
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    navList: Style.compose(
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.lg, justify: 'center' })),
      Style.self({ margin: '0', listStyle: 'none' }),
    ),
    // The link to the section the route is in carries `aria-current="page"`.
    navLink: Style.compose(
      Style.self({
        display: 'inline-block',
        padding: `${t.space['2xs']} ${t.space.sm}`,
        borderRadius: t.radius.sm,
        fontWeight: t.weight.medium,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo('[aria-current="page"]', {
        background: `color-mix(in oklch, ${t.accent.active} 50%, transparent)`,
      }),
    ),
    main: Style.self({ paddingBlock: t.space.xl }),
    notFound: centered,
    notFoundHeading: Style.compose(
      heading,
      Style.self({ marginBottom: t.space.lg, color: t.error.default }),
    ),
    notFoundText: Style.self({
      margin: `0 0 ${t.space.md}`,
      fontSize: t.size.lg,
      color: t.text.muted,
    }),
    link: Style.compose(
      Style.self({ color: t.accent.default, textDecoration: 'none' }),
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
  },
  { name: 'PageStyle', layer: app },
)

// PRODUCTS

export const ProductsSlots = Slots.define({
  content: container,
  heading: container,
  card: container,
  search: container,
  products: container,
  product: container,
  productDetails: container,
  productName: container,
  productPrice: container,
  quantityControls: container,
  quantity: container,
  goToCart: container,
  goToCartLink: container,
})

export const ProductsStyle = Style.forSlots(ProductsSlots)(
  {
    content,
    heading,
    card,
    search: Style.self({ display: 'block', marginBottom: t.space.lg }),
    products: Style.self({ display: 'grid', gap: t.space.md }),
    product: Style.compose(itemRow, Style.pseudo(':hover', { background: t.surface.subtle })),
    productName: itemName,
    productPrice: itemPrice,
    quantityControls: controls,
    quantity: Style.compose(
      quantity,
      Style.self({ minWidth: '2rem', textAlign: 'center', fontFamily: t.font.mono }),
    ),
    goToCart: Style.self({ marginTop: t.space.lg, textAlign: 'center' }),
    goToCartLink: linkButton(successFill),
  },
  { name: 'ProductsStyle', layer: app },
)

// CART

export const CartSlots = Slots.define({
  content: container,
  heading: container,
  card: container,
  body: container,
  empty: container,
  emptyActions: container,
  shopLink: container,
  items: container,
  item: container,
  itemDetails: container,
  itemName: container,
  itemPrice: container,
  itemControls: container,
  quantity: container,
  summary: container,
  totalRow: container,
  total: container,
  actions: container,
  continueLink: container,
  checkoutLink: container,
})

export const CartStyle = Style.forSlots(CartSlots)(
  {
    content,
    heading,
    card,
    empty,
    emptyActions,
    shopLink: linkButton(accentFill),
    items: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({ marginBottom: t.space.lg }),
    ),
    item: itemRow,
    itemName,
    itemPrice,
    itemControls: controls,
    quantity,
    summary: Style.self({
      marginBottom: t.space.lg,
      paddingTop: t.space.md,
      borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    totalRow: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }),
    total: Style.self({
      margin: '0',
      fontSize: t.size.xl,
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    actions,
    continueLink: linkButton(neutralFill),
    checkoutLink: linkButton(successFill),
  },
  { name: 'CartStyle', layer: app },
)

// CHECKOUT

export const CheckoutSlots = Slots.define({
  confirmation: container,
  successHeading: container,
  successPanel: container,
  successLead: container,
  successNote: container,
  shopLink: container,
  content: container,
  heading: container,
  card: container,
  empty: container,
  emptyActions: container,
  summary: container,
  summaryHeading: container,
  lines: container,
  line: container,
  lineItem: container,
  lineName: container,
  lineQuantity: container,
  linePrice: container,
  total: container,
  totalLabel: container,
  totalAmount: container,
  field: container,
  actions: container,
  backLink: container,
})

export const CheckoutStyle = Style.forSlots(CheckoutSlots)(
  {
    confirmation: centered,
    successHeading: Style.compose(heading, Style.self({ color: t.success.ink })),
    successPanel: Style.self({
      marginBottom: t.space.lg,
      padding: t.space.lg,
      border: `${t.border.thin} solid ${t.success.default}`,
      borderRadius: t.radius.lg,
      background: t.success.subtle,
    }),
    successLead: Style.self({
      margin: `0 0 ${t.space.md}`,
      fontSize: t.size.lg,
      color: t.text.default,
    }),
    successNote: Style.self({ margin: '0', color: t.text.muted }),
    shopLink: linkButton(accentFill),
    content,
    heading,
    card,
    empty,
    emptyActions,
    summaryHeading: Style.self({
      margin: `0 0 ${t.space.md}`,
      fontSize: t.size['2xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    lines: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({ marginBottom: t.space.lg }),
    ),
    line: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBlock: t.space.xs,
      borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    lineName: Style.self({ fontWeight: t.weight.medium }),
    lineQuantity: Style.self({ marginLeft: t.space.xs, color: t.text.muted }),
    linePrice: Style.self({ fontWeight: t.weight.medium }),
    total: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.space.lg,
      fontSize: t.size.xl,
      fontWeight: t.weight.bold,
    }),
    field: Style.self({ marginBottom: t.space.lg }),
    actions,
    backLink: linkButton(neutralFill),
  },
  { name: 'CheckoutStyle', layer: app },
)

// CONTROLS

export const SearchInputStyle = Style.forSlots(InputSlots)(
  Recipes.Input.extend({
    base: { input: Style.self({ paddingInline: t.space.md, borderRadius: t.radius.lg }) },
  })(),
  { name: 'SearchInputStyle', layer: app },
)

export const DeliveryInstructionsStyle = Style.forSlots(TextareaSlots)(
  Recipes.Textarea.extend({
    base: {
      textarea: Style.self({
        boxSizing: 'border-box',
        height: '6rem',
        paddingInline: t.space.md,
        borderRadius: t.radius.lg,
        resize: 'none',
      }),
      label: Style.self({
        marginBlockEnd: t.space.xs,
        fontSize: t.size.lg,
        fontWeight: t.weight.semibold,
      }),
    },
  })(),
  { name: 'DeliveryInstructionsStyle', layer: app },
)

/** Upstream's `px-4 py-2 rounded-lg`: the shipped accent button, rounder. */
export const AddToCartButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: Style.self({ borderRadius: t.radius.lg }) } })(),
  { name: 'AddToCartButtonStyle', layer: app },
)

/** Upstream's `w-8 h-8 rounded` gray square for `-` and `+`. */
export const QuantityButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.self({
        width: '2rem',
        height: '2rem',
        padding: '0',
        borderRadius: t.radius.sm,
      }),
    },
  })({ tone: 'neutral' }),
  { name: 'QuantityButtonStyle', layer: app },
)

/** Upstream's `px-3 py-1 rounded ml-2` red button. */
export const RemoveButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        errorFill,
        Style.self({
          marginLeft: t.space.xs,
          paddingBlock: t.space['2xs'],
          paddingInline: t.space.sm,
          borderRadius: t.radius.sm,
        }),
      ),
    },
  })({ tone: 'danger' }),
  { name: 'RemoveButtonStyle', layer: app },
)

export const ClearCartButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: Style.compose(wide, errorFill) } })({ tone: 'danger' }),
  { name: 'ClearCartButtonStyle', layer: app },
)

export const PlaceOrderButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: Style.compose(wide, successFill) } })(),
  { name: 'PlaceOrderButtonStyle', layer: app },
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
