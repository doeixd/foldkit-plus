/**
 * The showcase's theme, the shell's Slots and Styles, and the stylesheet, as
 * `foldkit-mixins` data. `main.ts` publishes the shell's Slots and draws its
 * markup; each component page's Slots and Styles live in `ui/style/<page>.ts`.
 *
 * Every page style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped `foldkit-mixins-ui` recipes
 * (in `components` and `variants`) and the `Layout` pieces by layer order
 * rather than by specificity.
 */
import {
  Capability,
  type Declarations,
  Layers,
  Slot,
  Slots,
  Style,
  type StyleValue,
} from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { DialogSlots } from 'foldkit-mixins-ui'

const L = Layers.standard
export const app = L.layer('app')

// THEME

/** Indigo, as upstream's `accent-600` (`#4f46e5`) is. */
const palette = Theme.oklch({
  accent: { h: 277, c: 0.24, l: '51%' },
  surfaceSaturation: 0.004,
})

/** A white base, as upstream's `bg-white` page is, with Tailwind's gray steps around it. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

export const t = Theme.ref(theme)

/** Upstream's `md:` breakpoint, where the sidebar replaces the mobile header. */
export const breakpoints = Theme.tokens.breakpoint

// SHELL

const container = Slot.make({ capability: Capability.Container })

const md = (declarations: Declarations): StyleValue =>
  Style.responsive(breakpoints, { md: declarations })

const brandSlots = {
  homeLink: container,
  brand: container,
  brandName: container,
  brandTagline: container,
} as const

const navSlots = { navList: container, navItem: container, navLink: container } as const

const brandStyles = {
  homeLink: Style.self({ display: 'block', color: 'inherit', textDecoration: 'none' }),
  brand: Style.self({ display: 'flex', flexDirection: 'column' }),
  brandName: Style.self({ fontSize: t.size.md, fontWeight: t.weight.bold, color: t.text.overt }),
  brandTagline: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
} as const

const navList: StyleValue = Style.self({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  margin: '0',
  padding: '0',
  listStyle: 'none',
})

/** A nav link; `Nav` marks the current one `aria-current="page"`. */
const navLink = (padding: string, fontSize: string): StyleValue =>
  Style.compose(
    Style.self({
      display: 'block',
      padding,
      borderRadius: t.radius.md,
      fontSize,
      color: t.text.default,
      textDecoration: 'none',
      transition: `background-color ${t.motion.fast} ${t.motion.ease}`,
    }),
    Style.pseudo(':hover', { background: t.surface.default }),
    Style.pseudo('[aria-current="page"]', { background: t.accent.subtle, color: t.accent.ink }),
  )

const iconButton: StyleValue = Style.compose(
  Style.self({
    display: 'inline-flex',
    padding: t.space.xs,
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    color: t.text.default,
    cursor: 'pointer',
  }),
  Style.pseudo(':hover', { background: t.surface.default }),
)

const barBorder = `${t.border.thin} solid ${t.outline.subtle}`

export const ShellSlots = Slots.define({
  layout: container,
  mobileHeader: container,
  ...brandSlots,
  menuButton: container,
  menuIcon: container,
  sidebar: container,
  sidebarBrand: container,
  sidebarTitle: container,
  ...navSlots,
  main: container,
  content: container,
  heading: container,
  errorHeading: container,
  lead: container,
  link: container,
})

const heading: StyleValue = Style.compose(
  Style.self({
    margin: `0 0 ${t.space.md}`,
    fontSize: t.size['2xl'],
    fontWeight: t.weight.bold,
    lineHeight: t.leading.tight,
    color: t.text.overt,
  }),
  md({ fontSize: t.size['3xl'] }),
)

export const ShellStyle = Style.forSlots(ShellSlots)(
  {
    layout: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: t.surface.base,
      }),
      md({ flexDirection: 'row' }),
    ),
    mobileHeader: Style.compose(
      Style.self({
        position: 'sticky',
        top: '0',
        zIndex: '40',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${t.space.sm} ${t.space.md}`,
        borderBottom: barBorder,
        background: t.surface.subtle,
      }),
      md({ display: 'none' }),
    ),
    ...brandStyles,
    menuButton: iconButton,
    menuIcon: Style.self({ width: '1.5rem', height: '1.5rem' }),
    sidebar: Style.compose(
      Style.self({
        display: 'none',
        flexDirection: 'column',
        flexShrink: '0',
        width: '14rem',
        padding: t.space.md,
        borderRight: barBorder,
        background: t.surface.subtle,
      }),
      md({ display: 'flex' }),
    ),
    sidebarBrand: Style.self({ marginBottom: t.space.lg }),
    sidebarTitle: Style.self({
      margin: '0',
      fontSize: t.size.lg,
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    navList,
    navLink: navLink(`0.375rem ${t.space.sm}`, t.size.sm),
    main: Style.compose(
      Style.self({ flex: '1', minWidth: '0', padding: t.space.md, overflow: 'auto' }),
      md({ padding: t.space.xl }),
    ),
    content: Style.self({ maxWidth: '42rem' }),
    heading,
    errorHeading: Style.compose(heading, Style.self({ color: t.error.ink })),
    lead: Style.compose(
      Style.self({ margin: `0 0 ${t.space.md}`, color: t.text.muted }),
      Style.pseudo(':last-child', { marginBottom: '0' }),
    ),
    link: Style.compose(
      Style.self({ color: t.accent.ink, textDecoration: 'none' }),
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
  },
  { name: 'ShellStyle', layer: app },
)

// MOBILE MENU

export const MobileMenuSlots = Slots.define({
  menu: container,
  menuHeader: container,
  ...brandSlots,
  closeIcon: container,
  nav: container,
  ...navSlots,
})

export const MobileMenuStyle = Style.forSlots(MobileMenuSlots)(
  {
    menu: Style.self({ display: 'flex', flexDirection: 'column', height: '100%' }),
    menuHeader: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${t.space.sm} ${t.space.md}`,
      borderBottom: barBorder,
    }),
    ...brandStyles,
    closeIcon: Style.self({ width: '1.5rem', height: '1.5rem' }),
    nav: Style.compose(
      Style.self({ flex: '1', minHeight: '0', padding: t.space.md, overflowY: 'auto' }),
      Style.pseudo(':focus', { outline: 'none' }),
    ),
    navList,
    navLink: navLink(`0.625rem ${t.space.md}`, t.size.md),
  },
  { name: 'MobileMenuStyle', layer: app },
)

/** The menu covers the page below `md`, and is never drawn at or above it. */
export const MobileMenuDialogStyle = Style.forSlots(DialogSlots)(
  {
    dialog: Style.compose(
      Style.self({
        maxWidth: '100%',
        maxHeight: '100%',
        padding: '0',
        border: '0',
        background: 'transparent',
      }),
      md({ display: 'none' }),
    ),
    backdrop: Style.self({ position: 'fixed', inset: '0', zIndex: '59' }),
    panel: Style.self({
      position: 'fixed',
      inset: '0',
      zIndex: '60',
      display: 'flex',
      flexDirection: 'column',
      background: t.surface.base,
    }),
    closeButton: iconButton,
  },
  { name: 'MobileMenuDialogStyle', layer: app },
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
