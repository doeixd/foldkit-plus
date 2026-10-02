/**
 * The showcase's theme, the shell's Slots and Styles, and the stylesheet, as
 * `foldkit-mixins` data. `main.ts` draws the shell's markup through the Slots
 * declared here; each component page's Slots and Styles live in
 * `ui/style/<page>.ts`, styled for this theme through `forSlots`.
 *
 * `AppStyle` compiles every page style into the `app` layer, the last of the
 * standard order, so it overrides the shipped `foldkit-mixins-ui` recipes
 * (in `components` and `variants`) and the `Layout` pieces by layer order
 * rather than by specificity.
 */
import { type Declarations, Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { DialogSlots } from 'foldkit-mixins-ui'

/** Indigo, as upstream's `accent-600` (`#4f46e5`) is. */
const palette = Theme.oklch({
  accent: { h: 277, c: 0.24, l: '51%' },
  surfaceSaturation: 0.004,
})

/** A white base, as upstream's `bg-white` page is, with Tailwind's gray steps around it. */
const { t, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(palette, Theme.define({ knob: { 'base-l': '100%' } })),
  colorScheme: 'light',
})

export { forSlots, stylesheet, t }

/** Upstream's `md:` breakpoint, where the sidebar replaces the mobile header. */
export const breakpoints = Theme.tokens.breakpoint

// SHELL

const md = (declarations: Declarations): StyleValue =>
  Style.responsive(breakpoints, { md: declarations })

const heading = [
  U.text('2xl'),
  U.font('bold'),
  U.color('text.overt'),
  { margin: `0 0 ${t.space.md}`, lineHeight: t.leading.tight },
  md({ fontSize: t.size['3xl'] }),
]

const brandStyles = {
  homeLink: [{ display: 'block', color: 'inherit', textDecoration: 'none' }],
  brand: [U.column],
  brandName: [U.text('md'), U.font('bold'), U.color('text.overt')],
  brandTagline: [U.text('xs'), U.color('text.muted')],
} as const

const navList = [U.column, U.gap('2xs'), { margin: '0', padding: '0', listStyle: 'none' }]

/** A nav link; `Nav` marks the current one `aria-current="page"`. */
const navLink = (padding: string, fontSize: string) => [
  {
    display: 'block',
    padding,
    borderRadius: t.radius.md,
    fontSize,
    color: t.text.default,
    textDecoration: 'none',
    transition: `background-color ${t.motion.fast} ${t.motion.ease}`,
  },
  Style.pseudo(':hover', { background: t.surface.default }),
  Style.pseudo('[aria-current="page"]', { background: t.accent.subtle, color: t.accent.ink }),
]

const iconButton = [
  U.p('xs'),
  {
    display: 'inline-flex',
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    color: t.text.default,
    cursor: 'pointer',
  },
  Style.pseudo(':hover', { background: t.surface.default }),
]

const barBorder = `${t.border.thin} solid ${t.outline.subtle}`

export const ShellPage = slots(
  {
    layout: [U.column, U.bg('surface.base'), { minHeight: '100vh' }, md({ flexDirection: 'row' })],
    mobileHeader: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.py('sm'),
      U.px('md'),
      U.bg('surface.subtle'),
      {
        position: 'sticky',
        top: '0',
        zIndex: '40',
        borderBottom: barBorder,
      },
      md({ display: 'none' }),
    ],
    ...brandStyles,
    menuButton: iconButton,
    menuIcon: { width: '1.5rem', height: '1.5rem' },
    sidebar: [
      U.column,
      U.p('md'),
      U.bg('surface.subtle'),
      {
        display: 'none',
        flexShrink: '0',
        width: '14rem',
        borderRight: barBorder,
      },
      md({ display: 'flex' }),
    ],
    sidebarBrand: { marginBottom: t.space.lg },
    sidebarTitle: [U.text('lg'), U.font('bold'), U.color('text.overt'), { margin: '0' }],
    navList,
    navItem: {},
    navLink: navLink(`0.375rem ${t.space.sm}`, t.size.sm),
    main: [U.p('md'), { flex: '1', minWidth: '0', overflow: 'auto' }, md({ padding: t.space.xl })],
    content: { maxWidth: '42rem' },
    heading,
    errorHeading: [heading, U.color('error.ink')],
    lead: [
      U.color('text.muted'),
      { margin: `0 0 ${t.space.md}` },
      Style.pseudo(':last-child', { marginBottom: '0' }),
    ],
    link: [
      U.color('accent.ink'),
      { textDecoration: 'none' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ],
  },
  { name: 'ShellStyle' },
)

// MOBILE MENU

export const MobileMenuPage = slots(
  {
    menu: [U.column, { height: '100%' }],
    menuHeader: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.py('sm'),
      U.px('md'),
      { borderBottom: barBorder },
    ],
    ...brandStyles,
    closeIcon: { width: '1.5rem', height: '1.5rem' },
    nav: [
      U.p('md'),
      {
        flex: '1',
        minHeight: '0',
        overflowY: 'auto',
      },
      Style.pseudo(':focus', { outline: 'none' }),
    ],
    navList,
    navItem: {},
    navLink: navLink(`0.625rem ${t.space.md}`, t.size.md),
  },
  { name: 'MobileMenuStyle' },
)

/** The menu covers the page below `md`, and is never drawn at or above it. */
export const MobileMenuDialogStyle = forSlots(DialogSlots)(
  {
    dialog: [
      {
        maxWidth: '100%',
        maxHeight: '100%',
        padding: '0',
        border: '0',
        background: 'transparent',
      },
      md({ display: 'none' }),
    ],
    backdrop: { position: 'fixed', inset: '0', zIndex: '59' },
    panel: [
      U.column,
      U.bg('surface.base'),
      {
        position: 'fixed',
        inset: '0',
        zIndex: '60',
      },
    ],
    closeButton: iconButton,
  },
  { name: 'MobileMenuDialogStyle' },
)
