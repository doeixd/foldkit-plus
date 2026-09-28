/**
 * The auth example's appearance, as `foldkit-mixins` data. The views publish
 * the Slots and draw the markup; everything it looks like lives here.
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
import * as FieldValidation from 'foldkit/fieldValidation'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue, as upstream's Tailwind `blue-500`, over near-neutral grey surfaces. */
const palette = Theme.oklch({
  accent: { h: 260, c: 0.21, l: '62%' },
  surfaceSaturation: 0.003,
})

/** A white base, so the cards stand out from the page's `surface.muted`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

/** Upstream's `max-w-4xl mx-auto px-4`. */
const content = L.in('layouts', Layout.center({ max: '56rem' }))

const heading: StyleValue = Style.self({
  margin: `0 0 ${t.space.lg}`,
  fontSize: t.size['4xl'],
  fontWeight: t.weight.bold,
  color: t.text.default,
})

const lead: StyleValue = Style.self({
  margin: `0 0 ${t.space.xl}`,
  fontSize: t.size.lg,
  color: t.text.muted,
})

const link: StyleValue = Style.compose(
  Style.self({ color: t.accent.default, textDecoration: 'none' }),
  Style.pseudo(':hover', { textDecoration: 'underline' }),
)

const card: StyleValue = Style.self({
  padding: t.space.lg,
  borderRadius: t.radius.lg,
  background: t.surface.base,
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 10%), 0 2px 4px -2px rgb(0 0 0 / 10%)',
})

const cardTitle: StyleValue = Style.self({
  margin: `0 0 ${t.space.sm}`,
  fontSize: t.size.xl,
  fontWeight: t.weight.semibold,
  color: t.text.default,
})

/** One column, three from `md` up, as upstream's `grid-cols-1 md:grid-cols-3`. */
const threeColumns = (gap: string): StyleValue =>
  Style.compose(
    Style.self({ display: 'grid', gridTemplateColumns: '1fr', gap }),
    Style.media('(min-width: 48rem)', { gridTemplateColumns: 'repeat(3, 1fr)' }),
  )

// PAGE

export const PageSlots = Slots.define({ page: container })

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({ minHeight: '100vh', background: t.surface.muted, color: t.text.default }),
  },
  { name: 'PageStyle', layer: app },
)

// NOT FOUND

export const NotFoundSlots = Slots.define({
  content: container,
  heading: container,
  message: container,
  link: container,
})

export const NotFoundStyle = Style.forSlots(NotFoundSlots)(
  {
    content: Style.compose(content, Style.self({ textAlign: 'center' })),
    heading: Style.compose(heading, Style.self({ color: t.error.ink })),
    message: Style.self({ margin: `0 0 ${t.space.md}`, fontSize: t.size.lg, color: t.text.muted }),
    link,
  },
  { name: 'NotFoundStyle', layer: app },
)

// LOGGED OUT

export const LoggedOutSlots = Slots.define({ content: container })

export const LoggedOutStyle = Style.forSlots(LoggedOutSlots)(
  { content: Style.self({ paddingBlock: t.space.xl }) },
  { name: 'LoggedOutStyle', layer: app },
)

// HOME

export const HomeSlots = Slots.define({
  content: container,
  hero: container,
  title: container,
  lead: container,
  signIn: container,
  features: container,
  feature: container,
  featureTitle: container,
  featureText: container,
})

export const HomeStyle = Style.forSlots(HomeSlots)(
  {
    content,
    hero: Style.self({ paddingBlock: t.space['3xl'], textAlign: 'center' }),
    title: Style.compose(heading, Style.self({ fontSize: '3rem' })),
    lead: Style.compose(lead, Style.self({ fontSize: t.size.xl })),
    signIn: Style.compose(
      Style.self({
        display: 'inline-block',
        padding: `${t.space.sm} ${t.space.xl}`,
        borderRadius: t.radius.lg,
        background: t.accent.default,
        color: t.accent['on-fill'],
        fontWeight: t.weight.medium,
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', { background: t.accent.hover }),
    ),
    features: Style.compose(threeColumns(t.space.xl), Style.self({ marginTop: t.space['3xl'] })),
    feature: card,
    featureTitle: cardTitle,
    featureText: Style.self({ margin: '0', color: t.text.muted }),
  },
  { name: 'HomeStyle', layer: app },
)

// LOGIN

export const LoginSlots = Slots.define({
  content: container,
  card: container,
  heading: container,
  hint: container,
  hintText: container,
  form: container,
  field: container,
  fieldHeader: container,
  /** Beside a label once its field is valid. */
  validMark: container,
  footer: container,
  footerText: container,
  homeLink: container,
})

export const LoginStyle = Style.forSlots(LoginSlots)(
  {
    content: L.in('layouts', Layout.center({ max: '28rem' })),
    card: Style.self({
      padding: t.space.xl,
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
    }),
    heading: Style.self({
      margin: `0 0 ${t.space.xl}`,
      textAlign: 'center',
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.default,
    }),
    hint: Style.self({
      marginBottom: t.space.lg,
      padding: t.space.sm,
      border: `${t.border.thin} solid ${t.info.outline}`,
      borderRadius: t.radius.lg,
      background: t.info.subtle,
    }),
    hintText: Style.self({ margin: '0', fontSize: t.size.sm, color: t.info.ink }),
    form: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    fieldHeader: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
      Style.self({ marginBottom: t.space['2xs'] }),
    ),
    validMark: Style.self({ fontSize: t.size.sm, color: t.success.default }),
    footer: Style.self({ marginTop: t.space.lg, textAlign: 'center' }),
    footerText: Style.self({ color: t.text.muted }),
    homeLink: link,
  },
  { name: 'LoginStyle', layer: app },
)

const isValidField = (field: FieldValidation.Field<string>): boolean =>
  FieldValidation.match(field, {
    onNotValidated: () => false,
    onValidating: () => false,
    onValid: () => true,
    onInvalid: () => false,
  })

/** The recipe draws an invalid field's border from `aria-invalid`; a valid one's is green. */
export const LoginInputStyle = Style.forSlots(InputSlots)(
  Recipes.Input.extend({
    base: {
      input: Style.compose(
        Style.self({ paddingBlock: t.space.xs, paddingInline: t.space.md }),
        Style.whenInput(isValidField, Style.self({ borderColor: t.success.default })),
      ),
      label: Style.self({ marginBlockEnd: '0', color: t.text.subtle }),
      description: Style.self({ color: t.error.ink }),
    },
  })(),
  { name: 'LoginInputStyle', layer: app },
)

/** The shipped solid button, full width, and grey while it cannot submit. */
export const SubmitButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        Style.self({ width: '100%', paddingBlock: t.space.sm, borderRadius: t.radius.lg }),
        // `@foldkit/ui` marks a disabled button with `aria-disabled`, not `disabled`.
        Style.pseudo('[aria-disabled="true"]', {
          opacity: '1',
          background: t.surface.default,
          color: t.text.muted,
        }),
      ),
    },
  })(),
  { name: 'SubmitButtonStyle', layer: app },
)

// LOGGED IN

export const LoggedInSlots = Slots.define({
  shell: container,
  nav: container,
  navInner: container,
  navList: container,
  navItem: container,
  /** The link to the page shown carries `aria-current="page"`. */
  navLink: container,
  signedInAs: container,
  main: container,
})

export const LoggedInStyle = Style.forSlots(LoggedInSlots)(
  {
    shell: Style.self({ minHeight: '100vh' }),
    nav: Style.self({
      padding: t.space.md,
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    navInner: Style.compose(
      L.in('layouts', Layout.center({ max: '56rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ justify: 'space-between' })),
    ),
    navList: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.lg })),
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
    ),
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
    signedInAs: Style.self({ fontSize: t.size.sm }),
    main: Style.self({ paddingBlock: t.space.xl }),
  },
  { name: 'LoggedInStyle', layer: app },
)

// DASHBOARD

export const DashboardSlots = Slots.define({
  content: container,
  heading: container,
  lead: container,
  stats: container,
  stat: container,
  statTitle: container,
  statValue: container,
})

export const DashboardStyle = Style.forSlots(DashboardSlots)(
  {
    content,
    heading,
    lead,
    stats: threeColumns(t.space.lg),
    stat: card,
    statTitle: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.muted,
      textTransform: 'uppercase',
    }),
    statValue: Style.self({
      margin: '0',
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.default,
    }),
  },
  { name: 'DashboardStyle', layer: app },
)

// SETTINGS

export const SettingsSlots = Slots.define({
  content: container,
  heading: container,
  card: container,
  cardTitle: container,
  rows: container,
  row: container,
  rowLabel: container,
  rowValue: container,
})

export const SettingsStyle = Style.forSlots(SettingsSlots)(
  {
    content,
    heading,
    card: Style.compose(card, Style.pseudo(':not(:last-child)', { marginBottom: t.space.lg })),
    cardTitle,
    rows: L.in('layouts', Layout.stack({ gap: t.space.md })),
    row: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBlock: t.space.xs,
      borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    rowLabel: Style.self({ margin: '0', color: t.text.muted }),
    rowValue: Style.self({ margin: '0', fontWeight: t.weight.medium, color: t.text.default }),
  },
  { name: 'SettingsStyle', layer: app },
)

/** Upstream's red Sign Out button: the shipped button in its danger tone. */
export const SignOutButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.self({ padding: `${t.space.sm} ${t.space.lg}`, borderRadius: t.radius.lg }),
    },
  })({ tone: 'danger' }),
  { name: 'SignOutButtonStyle', layer: app },
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
