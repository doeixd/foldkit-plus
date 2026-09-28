/**
 * The page's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Event, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/**
 * Tailwind's blue-500 as the accent, so the button and the numbers are
 * upstream's blue, over neutral surfaces so the card is a plain near-white.
 */
const palette = Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' }, surfaceSaturation: 0 })

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

/** The accent at `percent` over the base surface: upstream's blue-50 to blue-300. */
const wash = (percent: number): string =>
  `color-mix(in oklch, ${t.surface.base} ${percent}%, ${t.accent.default})`

/**
 * A column that centers its children, like upstream's `flex-col items-center`.
 * A stack's children are full width unless they compose `intrinsic`, which
 * then keeps its own width, centered.
 */
const centered = (gap: string): StyleValue =>
  Style.compose(
    L.in('layouts', Layout.stack({ gap, align: 'center' })),
    Style.vars({ '--fk-l-intrinsic-align': 'center' }),
  )

const intrinsic: StyleValue = L.in('layouts', Layout.intrinsic)

/** Upstream's `w-full max-w-md`; the stack already makes its children full width. */
const narrow: StyleValue = Style.self({ maxWidth: '28rem' })

// PAGE

export const WeatherSlots = Slots.define({
  page: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  form: Slot.make({ capability: Capability.Container, events: [Event.Submit] }),
  loading: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
  result: Slot.make({ capability: Capability.Container }),
  card: Slot.make({ capability: Capability.Container }),
  zipCode: Slot.make({ capability: Capability.Container }),
  location: Slot.make({ capability: Capability.Container }),
  current: Slot.make({ capability: Capability.Container }),
  temperature: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  details: Slot.make({ capability: Capability.Container }),
  detail: Slot.make({ capability: Capability.Container }),
  detailLabel: Slot.make({ capability: Capability.Container }),
  detailValue: Slot.make({ capability: Capability.Container }),
})

export const WeatherStyle = Style.forSlots(WeatherSlots)(
  {
    page: Style.compose(
      centered(t.space.lg),
      Style.self({
        boxSizing: 'border-box',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.lg,
        background: `linear-gradient(to bottom right, ${wash(85)}, ${wash(55)})`,
      }),
    ),
    title: Style.compose(
      intrinsic,
      Style.self({
        // The stack sets its children's block margins to 0; this is upstream's `mb-8`.
        marginBlockEnd: t.space.xl,
        fontSize: t.size['4xl'],
        fontWeight: t.weight.bold,
        // Upstream's blue-900: the accent, darker.
        color: `oklch(from ${t.accent.default} 0.38 calc(c * 0.7) h)`,
      }),
    ),
    form: Style.compose(centered(t.space.md), narrow),
    loading: Style.compose(
      intrinsic,
      Style.self({ textAlign: 'center', fontWeight: t.weight.semibold, color: t.accent.default }),
    ),
    error: Style.compose(
      intrinsic,
      Style.self({
        boxSizing: 'border-box',
        padding: t.space.md,
        border: `1px solid ${t.error.outline}`,
        borderRadius: t.radius.lg,
        background: t.error.subtle,
        color: t.error.ink,
      }),
    ),
    result: narrow,
    card: Style.self({
      padding: t.space.xl,
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
    }),
    zipCode: Style.self({
      margin: `0 0 ${t.space.sm}`,
      textAlign: 'center',
      fontSize: t.size['2xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    location: Style.self({
      margin: `0 0 ${t.space.lg}`,
      textAlign: 'center',
      color: t.text.muted,
    }),
    current: Style.self({ marginBlockEnd: t.space.lg, textAlign: 'center' }),
    temperature: Style.self({
      fontSize: '3.75rem',
      fontWeight: t.weight.bold,
      lineHeight: '1',
      color: t.accent.default,
    }),
    description: Style.self({
      marginBlockStart: t.space.xs,
      fontSize: t.size.xl,
      color: t.text.muted,
    }),
    details: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: t.space.md,
      textAlign: 'center',
    }),
    detail: Style.self({ padding: t.space.md, borderRadius: t.radius.lg, background: wash(94) }),
    detailLabel: Style.self({ fontSize: t.size.sm, color: t.text.muted }),
    detailValue: Style.self({ fontSize: t.size.lg, fontWeight: t.weight.semibold }),
  },
  { name: 'WeatherStyle', layer: app },
)

// ZIP CODE INPUT

/** The shipped text field, with upstream's thick blue border. */
const ZipCodeInput = Recipes.Input.extend({
  base: {
    input: Style.compose(
      Style.self({
        boxSizing: 'border-box',
        border: `${t.border.thick} solid ${wash(55)}`,
        borderRadius: t.radius.lg,
        outline: 'none',
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: wash(40) }),
      Style.pseudo(':focus', { borderColor: t.accent.default }),
    ),
  },
})

export const ZipCodeInputStyle = Style.forSlots(InputSlots)(ZipCodeInput({ size: 'md' }), {
  name: 'ZipCodeInputStyle',
  layer: app,
})

// SUBMIT BUTTON

/** The solid accent button, as wide as its label and rounded like upstream's. */
const SubmitButton = Recipes.Button.extend({
  base: {
    button: Style.compose(
      intrinsic,
      Style.self({ paddingInline: t.space.lg, borderRadius: t.radius.lg }),
    ),
  },
})

export const SubmitButtonStyle = Style.forSlots(ButtonSlots)(SubmitButton(), {
  name: 'SubmitButtonStyle',
  layer: app,
})

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
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)
