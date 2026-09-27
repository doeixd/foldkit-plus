/**
 * The example's appearance, as `foldkit-mixins` Style: one theme, derived from
 * an accent color, and the Slots the views publish, styled here and nowhere
 * else. A view attaches a Style, and its rules arrive when the view draws; the
 * page's own stylesheet (`sheet.ts`) holds only the foundations.
 *
 * - `AdminSlots`: the authoring shell of the posts and the pages.
 * - `SiteSlots`: the public site's shell and its article.
 * - The mixins' own Slots: the form's fields, the worklist's table, the Builder.
 */
import { PAGE_CONTAINER } from 'foldkit-composition/foldkit'
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { BuilderSlots } from 'foldkit-mixins-builder'
import { ListSlots } from 'foldkit-mixins-crud'
import { FieldSlots, FormSlots, type FieldInput } from 'foldkit-mixins-form'
import { Recipes } from 'foldkit-mixins-ui'
import { Layout } from 'foldkit-mixins/layout'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'
import { iconUrl, type IconName } from './icons.js'

export const theme = Theme.compose(
  Theme.tokens,
  Theme.oklch({
    accent: { h: 265, c: 0.16, l: '52%', dark: { l: '72%', c: 0.13 } },
    surfaceSaturation: 0.008,
  }),
)
/** Every token as a typed `var(--fk-…)` reference: the admin's and the site's styles read these. */
export const t = Theme.ref(theme)

/** A serif for reading and writing long text: the post's body, here and on the site. */
export const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

const L = Layers.standard
/** Every slot style is born in `app`, the last layer, so it wins over the foundations and the looks. */
const app = L.layer('app')

const part = Slot.make({ capability: Capability.Container })
const control = Slot.make({ capability: Capability.Interactive })

/** Where the studio lays itself out for a phone rather than beside a sidebar. */
const phone = '(max-width: 52rem)'
/**
 * On a touch screen, a control a finger can hit: 44px, as the platforms advise.
 * Only where the pointer is coarse, so a desktop keeps its density.
 */
export const touchTarget = Style.media('(pointer: coarse)', {
  minHeight: '2.75rem',
  minWidth: '2.75rem',
})

/**
 * The same, for every control a region draws: a link or button laid out as a
 * box. A link inside a sentence is inline, where `min-height` does nothing, so
 * prose keeps its lines.
 */
export const touchTargets = Style.at(
  '@media (pointer: coarse)',
  Style.nest(':is(a, button, summary, select)', { minHeight: '2.75rem' }),
)

/** Read by assistive technology, not shown. */
const readOnly = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** A button as the mixins-ui recipe draws it, for a slot of our own. */
const button = (selection: Parameters<typeof Recipes.Button>[0]) =>
  Recipes.Button(selection).button ?? Style.empty

/** What a text box looks like, in a form and in the Builder's inspector. */
const field = Style.compose(
  Style.self({
    background: t.surface.base,
    border: `1px solid ${t.outline.default}`,
    borderRadius: t.radius.md,
    boxSizing: 'border-box',
    color: t.text.default,
    font: 'inherit',
    padding: '0.5rem 0.7rem',
    width: '100%',
  }),
  Style.pseudo(':focus-visible', {
    borderColor: t.accent.default,
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '1px',
  }),
  // The browser's own grey is the same in both themes, and too faint on either.
  Style.pseudo('::placeholder', { color: t.text.muted, opacity: '1' }),
  Style.nest('&[aria-invalid="true"]', { borderColor: t.error.default }),
)

// --- the authoring shell --------------------------------------------------------

export const AdminSlots = Slots.define({
  root: part,
  /** The studio's sidebar: the brand, the sections, and who is signed in. */
  sidebar: part,
  brand: part,
  brandMark: part,
  nav: part,
  navLink: control,
  account: part,
  accountLabel: part,
  whoLink: control,
  /** A chair's name and role, beside its avatar: on a phone, the avatar alone shows. */
  whoName: part,
  whoRole: part,
  avatar: part,
  /** What the demo is and what to try, above the posts: a disclosure, open at first. */
  intro: part,
  introSummary: control,
  introSteps: part,
  main: part,
  /** A section's screen: its heading, its filters, then what it lists. */
  screen: part,
  screenHead: part,
  screenTitle: part,
  filters: part,
  /** Which of a list's views is shown, as buttons that say whether they are pressed. */
  tabs: part,
  tab: control,
  searchBox: part,
  /** The editor's screen: a bar across the top, then the page and its settings. */
  editorScreen: part,
  editorBar: part,
  barActions: part,
  editorBody: part,
  /** Where a page is built, across the whole width. */
  workbench: part,
  canvas: part,
  aside: part,
  /** One group of settings in the aside. */
  card: part,
  cardTitle: part,
  /** A button with no box until it is pointed at: the bar's back and preview. */
  ghost: control,
  /** A post as a reader will see it, in the canvas while previewing. */
  preview: part,
  /** One published revision in the history. */
  revision: part,
  toolbar: part,
  button: control,
  primary: control,
  danger: control,
  status: part,
  muted: part,
  /** A list of things to open, and each one's button. */
  list: part,
  listButton: control,
  /** An entry's state, such as Published. */
  badge: part,
  search: control,
})

const navLink = Style.compose(
  Style.self({
    alignItems: 'center',
    borderRadius: t.radius.md,
    color: t.text.default,
    display: 'flex',
    fontSize: t.size.sm,
    fontWeight: t.weight.medium,
    gap: t.space.xs,
    padding: '0.45rem 0.65rem',
    textDecoration: 'none',
  }),
  // In a phone's row of sections: whole, side by side.
  Style.media(phone, { flexShrink: '0', whiteSpace: 'nowrap' }),
  touchTarget,
  Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
  Style.nest('&[aria-current="page"]', {
    background: t.surface.default,
    color: t.text.overt,
    fontWeight: t.weight.semibold,
  }),
)

/** The studio's main action, dark as the page's ink, in the manner of an editor's publish. */
export const primaryButton = Style.compose(
  Style.self({
    alignItems: 'center',
    background: t.text.overt,
    border: '0',
    borderRadius: t.radius.md,
    color: t.surface.base,
    cursor: 'pointer',
    display: 'inline-flex',
    font: 'inherit',
    fontSize: t.size.sm,
    fontWeight: t.weight.semibold,
    gap: t.space['2xs'],
    padding: '0.5rem 0.9rem',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }),
  touchTarget,
  Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
    background: `color-mix(in oklch, ${t.text.overt} 85%, ${t.surface.base})`,
  }),
  Style.pseudo(':is(:disabled, [aria-disabled="true"])', {
    cursor: 'not-allowed',
    opacity: '0.45',
  }),
  Style.pseudo(':focus-visible', {
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '2px',
  }),
)

/** An entry's state as a pill, colored by its tag, which `attribute` names. */
const stateBadge = (attribute: string) => {
  const tone = (state: string, family: 'success' | 'warning' | 'info' | 'error') =>
    Style.nest(`&[${attribute}="${state}"]`, {
      background: `color-mix(in oklch, ${t[family].default} 14%, ${t.surface.base})`,
      color: t[family].ink,
    })
  return Style.compose(
    Style.self({
      alignItems: 'center',
      background: t.surface.muted,
      borderRadius: t.radius.full,
      color: t.text.muted,
      display: 'inline-flex',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      gap: '0.35rem',
      padding: '0.15rem 0.6rem',
      whiteSpace: 'nowrap',
    }),
    // A dot before the words, in the pill's own color.
    Style.nest('&::before', {
      background: 'currentColor',
      borderRadius: '50%',
      content: '""',
      height: '0.4rem',
      width: '0.4rem',
    }),
    tone('Published', 'success'),
    tone('Changed', 'warning'),
    tone('New', 'info'),
    tone('Unpublished', 'warning'),
    tone('Archived', 'error'),
  )
}

export const AdminStyle = Style.forSlots(AdminSlots)(
  {
    root: Style.compose(
      Style.self({
        background: t.surface.base,
        color: t.text.default,
        display: 'grid',
        fontFamily: t.font.body,
        gridTemplateColumns: '15.5rem minmax(0, 1fr)',
        minHeight: '100vh',
      }),
      // The bar as tall as it is, and the section the rest: a short page does not stretch the bar.
      Style.media(phone, {
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }),
    ),
    sidebar: Style.compose(
      Style.self({
        background: t.surface.subtle,
        borderInlineEnd: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.lg,
        height: '100vh',
        padding: `${t.space.lg} ${t.space.sm}`,
        position: 'sticky',
        top: '0',
      }),
      // On a phone, a bar across the top: the brand and who is looking, then the
      // sections in a row of their own, scrolled sideways where they do not fit.
      Style.media(phone, {
        alignItems: 'center',
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        borderInlineEnd: '0',
        display: 'grid',
        gap: t.space.xs,
        gridTemplateAreas: '"brand account" "nav nav"',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        height: 'auto',
        padding: `${t.space.sm} ${t.space.md}`,
        position: 'static',
      }),
    ),
    brand: Style.compose(
      Style.media(phone, { gridArea: 'brand' }),
      touchTarget,
      Style.self({
        alignItems: 'center',
        color: t.text.overt,
        display: 'flex',
        fontSize: t.size.md,
        fontWeight: t.weight.bold,
        gap: t.space.xs,
        letterSpacing: '-0.01em',
        padding: `0 ${t.space['2xs']}`,
        textDecoration: 'none',
      }),
    ),
    brandMark: Style.self({
      alignItems: 'center',
      background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 50%, ${t.tertiary.default}))`,
      borderRadius: t.radius.md,
      color: t.accent['on-fill'],
      display: 'inline-flex',
      fontSize: t.size.sm,
      height: '1.75rem',
      justifyContent: 'center',
      width: '1.75rem',
    }),
    nav: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gap: '2px' }),
      Style.media(phone, {
        flexDirection: 'row',
        gridArea: 'nav',
        marginInline: `calc(-1 * ${t.space.md})`,
        overflowX: 'auto',
        paddingInline: t.space.md,
        scrollbarWidth: 'none',
      }),
    ),
    navLink,
    account: Style.compose(
      Style.self({
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        marginBlockStart: 'auto',
        paddingBlockStart: t.space.sm,
      }),
      Style.media(phone, {
        border: '0',
        flexDirection: 'row',
        gridArea: 'account',
        justifySelf: 'end',
        marginBlockStart: '0',
        paddingBlockStart: '0',
      }),
    ),
    accountLabel: Style.compose(
      Style.media(phone, { display: 'none' }),
      Style.self({
        color: t.text.muted,
        fontSize: t.size.xs,
        fontWeight: t.weight.semibold,
        letterSpacing: '0.05em',
        margin: `0 0 ${t.space['3xs']}`,
        padding: `0 ${t.space['2xs']}`,
        textTransform: 'uppercase',
      }),
    ),
    whoLink: Style.compose(
      navLink,
      Style.self({ padding: '0.35rem 0.5rem' }),
      Style.media(phone, { padding: '0.3rem' }),
    ),
    // Read on a phone, not shown: the avatar stands for the chair.
    whoName: Style.media(phone, readOnly),
    whoRole: Style.compose(
      Style.self({
        color: t.text.muted,
        display: 'inline-flex',
        fontSize: t.size.xs,
        fontWeight: t.weight.normal,
        marginInlineStart: 'auto',
      }),
      Style.media(phone, readOnly),
    ),
    avatar: Style.compose(
      Style.self({
        alignItems: 'center',
        background: t.surface.muted,
        borderRadius: t.radius.full,
        boxShadow: `inset 0 0 0 1px ${t.outline.default}`,
        color: t.text.default,
        display: 'inline-flex',
        fontSize: t.size.xs,
        fontWeight: t.weight.bold,
        height: '1.5rem',
        justifyContent: 'center',
        width: '1.5rem',
      }),
      Style.nest('&[data-chair="wren"]', {
        background: t.accent.default,
        boxShadow: 'none',
        color: t.accent['on-fill'],
      }),
      Style.nest('&[data-chair="edda"]', {
        background: t.tertiary.default,
        boxShadow: 'none',
        color: t.tertiary['on-fill'],
      }),
    ),
    main: Style.compose(Style.self({ minWidth: '0' }), touchTargets),
    intro: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({
        background: `color-mix(in oklch, ${t.accent.default} 7%, ${t.surface.base})`,
        border: `1px solid color-mix(in oklch, ${t.accent.default} 25%, ${t.surface.base})`,
        borderRadius: t.radius.lg,
        color: t.text.default,
        fontSize: t.size.sm,
        lineHeight: '1.6',
        padding: `${t.space.md} ${t.space.lg}`,
      }),
      Style.nest('& p', { margin: '0' }),
    ),
    introSummary: Style.compose(
      Style.self({
        color: t.text.overt,
        cursor: 'pointer',
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
      }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
    ),
    introSteps: Style.self({
      display: 'grid',
      gap: t.space['2xs'],
      margin: '0',
      paddingInlineStart: '1.25rem',
    }),
    screen: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '64rem',
        padding: `${t.space['2xl']} ${t.space.xl}`,
      }),
      Style.media(phone, { padding: `${t.space.lg} ${t.space.md}` }),
      // A lone link or button in the column is as wide as its words, not the column.
      Style.nest('> a', { alignSelf: 'flex-start' }),
    ),
    screenHead: L.in(
      'layouts',
      Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'end' }),
    ),
    screenTitle: Style.self({
      color: t.text.overt,
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      letterSpacing: '-0.025em',
      margin: '0',
    }),
    filters: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.sm, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        paddingBlockEnd: t.space.sm,
      }),
    ),
    tabs: Style.self({ display: 'flex', gap: t.space['3xs'] }),
    tab: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.md,
        color: t.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
        padding: '0.4rem 0.75rem',
      }),
      Style.pseudo(':hover', { color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.muted,
        color: t.text.overt,
        cursor: 'default',
        fontWeight: t.weight.semibold,
      }),
    ),
    searchBox: Style.compose(
      Style.self({
        alignItems: 'center',
        color: t.text.muted,
        display: 'flex',
        gap: t.space['2xs'],
        minWidth: '14rem',
        position: 'relative',
      }),
      Style.media(phone, { flex: '1 1 100%', minWidth: '0' }),
      Style.nest('> svg', { insetInlineStart: '0.7rem', position: 'absolute' }),
    ),
    editorScreen: Style.self({ display: 'flex', flexDirection: 'column', minHeight: '100vh' }),
    editorBar: Style.compose(
      Style.self({
        alignItems: 'center',
        background: `color-mix(in oklch, ${t.surface.base} 88%, transparent)`,
        backdropFilter: 'blur(8px)',
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.lg}`,
        position: 'sticky',
        top: '0',
        zIndex: '5',
      }),
      // Its actions go under the status where the bar is too narrow for both.
      Style.media(phone, {
        flexWrap: 'wrap',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.md}`,
      }),
      Style.nest('& a, & button', { whiteSpace: 'nowrap' }),
    ),
    barActions: Style.self({
      alignItems: 'center',
      display: 'flex',
      gap: t.space.xs,
      marginInlineStart: 'auto',
    }),
    editorBody: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        flex: '1',
        gridTemplateColumns: 'minmax(0, 1fr) 20rem',
      }),
      Style.media('(max-width: 64rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    workbench: Style.compose(
      Style.self({ padding: t.space.lg }),
      Style.media(phone, { padding: t.space.sm }),
    ),
    canvas: Style.self({
      boxSizing: 'border-box',
      margin: '0 auto',
      maxWidth: '46rem',
      padding: `${t.space['2xl']} ${t.space.xl} ${t.space['3xl']}`,
      width: '100%',
    }),
    aside: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({
        alignSelf: 'stretch',
        background: t.surface.subtle,
        borderInlineStart: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        padding: t.space.lg,
      }),
    ),
    card: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({
        background: t.surface.base,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        padding: t.space.md,
      }),
    ),
    cardTitle: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      margin: '0',
      textTransform: 'uppercase',
    }),
    ghost: Style.compose(
      Style.self({
        alignItems: 'center',
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.md,
        color: t.text.default,
        cursor: 'pointer',
        display: 'inline-flex',
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
        gap: t.space['2xs'],
        padding: '0.45rem 0.65rem',
        textDecoration: 'none',
      }),
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', { background: t.surface.muted, color: t.text.overt }),
    ),
    revision: Style.compose(
      Style.self({
        alignItems: 'center',
        color: t.text.default,
        display: 'flex',
        fontSize: t.size.sm,
        gap: t.space.xs,
      }),
      Style.nest('> button', { flexShrink: '0', marginInlineStart: 'auto' }),
      Style.nest('> :not(button)', { minWidth: '0' }),
    ),
    preview: Style.self({ paddingBlockEnd: t.space['2xl'] }),
    toolbar: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    button: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    primary: primaryButton,
    danger: button({ tone: 'danger', variant: 'outline', size: 'sm' }),
    status: Style.compose(
      Style.self({
        color: t.text.muted,
        fontSize: t.size.sm,
        margin: '0',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      Style.nest('&[data-tone="error"]', { color: t.error.ink }),
    ),
    muted: Style.self({ color: t.text.muted, margin: '0' }),
    list: Style.compose(
      Style.self({
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        listStyle: 'none',
        margin: '0',
        overflow: 'hidden',
        padding: '0',
      }),
      Style.nest('> li + li', { borderBlockStart: `1px solid ${t.outline.subtle}` }),
    ),
    listButton: Style.compose(
      Style.self({
        alignItems: 'center',
        background: t.surface.base,
        border: '0',
        color: t.text.overt,
        cursor: 'pointer',
        display: 'flex',
        font: 'inherit',
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
        gap: t.space.sm,
        padding: `${t.space.md} ${t.space.lg}`,
        textAlign: 'start',
        width: '100%',
      }),
      Style.nest('> svg', { color: t.text.muted }),
      // The state sits at the row's end.
      Style.nest('> :last-child', { marginInlineStart: 'auto' }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ),
    badge: stateBadge('data-state'),
    search: Style.compose(field, Style.self({ paddingInlineStart: '2.1rem' })),
  },
  { name: 'AdminStyle', layer: app },
)

// --- the form, the worklist, and the Builder --------------------------------------

/** Out of sight and still read: a label a field's placeholder stands in for. */
const visuallyHidden = Style.self({
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
})

/** A field with no box, focused or not: the page itself is where one writes. */
const bare = Style.compose(
  Style.self({
    background: 'transparent',
    border: '0',
    borderRadius: '0',
    boxShadow: 'none',
    // As tall as what is written: a page does not scroll inside itself.
    fieldSizing: 'content',
    outline: 'none',
    overflow: 'hidden',
    padding: '0',
    resize: 'none',
  }),
  Style.pseudo(':focus-visible', { outline: 'none' }),
)

const keyIs =
  (...keys: ReadonlyArray<string>) =>
  (input: FieldInput) =>
    keys.includes(input.control.key)
const onKey = (keys: ReadonlyArray<string>, piece: StyleValue) =>
  Style.whenInput(keyIs(...keys), piece)

/**
 * A post's form as a page to write on: the title large, the excerpt beneath it
 * as a standfirst, the body in a serif with room to think, and the address and
 * cover set apart at the end. Each is placed by its key with `order`, since the
 * form draws its keys in the order it declares them.
 */
export const WritingFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
      onKey(['title'], Style.self({ order: '1' })),
      onKey(['excerpt'], Style.self({ order: '2' })),
      onKey(['body'], Style.self({ marginBlockStart: t.space.md, order: '3' })),
      onKey(
        ['slug'],
        Style.self({
          borderBlockStart: `1px solid ${t.outline.subtle}`,
          marginBlockStart: t.space.xl,
          order: '4',
          paddingBlockStart: t.space.lg,
        }),
      ),
      onKey(['cover'], Style.self({ order: '5' })),
    ),
    group: Style.self({ alignItems: 'center', display: 'flex' }),
    affix: Style.self({ color: t.text.muted, paddingInlineEnd: t.space['3xs'] }),
    label: Style.compose(
      Style.self({ fontSize: t.size.sm, fontWeight: t.weight.semibold }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    description: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    error: Style.self({ color: t.error.ink, fontSize: t.size.sm, margin: '0' }),
    text: field,
    multiline: Style.compose(
      field,
      Style.self({ minHeight: '5rem', resize: 'vertical' }),
      onKey(
        ['title'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.overt,
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: t.weight.bold,
            letterSpacing: '-0.025em',
            lineHeight: '1.15',
            minHeight: '0',
          }),
        ),
      ),
      onKey(
        ['excerpt'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.muted,
            fontSize: t.size.lg,
            lineHeight: '1.5',
            minHeight: '0',
          }),
        ),
      ),
      onKey(
        ['body'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.default,
            fontFamily: serif,
            fontSize: '1.2rem',
            lineHeight: '1.8',
            minHeight: '55vh',
          }),
        ),
      ),
    ),
  },
  { name: 'WritingFieldStyle', layer: app },
)

/**
 * A page's form: its title and address side by side above the Builder, which
 * takes the whole width. The Builder's field has no label of its own: it is the
 * page.
 */
export const PageFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['3xs'] })),
      onKey(['document'], Style.self({ gridColumn: '1 / -1', marginBlockStart: t.space.sm })),
    ),
    group: Style.self({ alignItems: 'center', display: 'flex' }),
    affix: Style.self({ color: t.text.muted, paddingInlineEnd: t.space['3xs'] }),
    label: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, fontWeight: t.weight.semibold }),
      onKey(['document'], visuallyHidden),
    ),
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    error: Style.self({ color: t.error.ink, fontSize: t.size.sm, margin: '0' }),
    text: Style.compose(
      field,
      onKey(['title'], Style.self({ fontSize: t.size.lg, fontWeight: t.weight.semibold })),
    ),
  },
  { name: 'PageFieldStyle', layer: app },
)

export const PageFormStyle = Style.forSlots(FormSlots)(
  {
    root: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        gap: t.space.md,
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
      }),
      Style.media('(max-width: 52rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    errors: Style.self({ color: t.error.ink, gridColumn: '1 / -1' }),
  },
  { name: 'PageFormStyle', layer: app },
)

export const FormStyle = Style.forSlots(FormSlots)(
  {
    root: L.in('layouts', Layout.stack({ gap: t.space.md })),
    errors: Style.self({ color: t.error.ink }),
    submit: Style.compose(
      button({ tone: 'accent', variant: 'solid', size: 'md' }),
      // A stack's children are full width unless they say otherwise.
      Layout.intrinsic,
    ),
  },
  { name: 'FormStyle', layer: app },
)

export const ListStyle = Style.forSlots(ListSlots)(
  {
    table: Style.self({ borderCollapse: 'collapse', fontSize: t.size.sm, width: '100%' }),
    badge: stateBadge('data-cms-state'),
    headCell: Style.self({
      borderBottom: `1px solid ${t.outline.subtle}`,
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.04em',
      padding: '0.4rem 0.5rem',
      textAlign: 'start',
      textTransform: 'uppercase',
    }),
    // The whole row opens its entry: the title's button reaches across it.
    row: Style.compose(
      Style.self({ position: 'relative' }),
      Style.pseudo(':hover', { background: t.surface.muted }),
    ),
    cell: Style.self({
      borderBottom: `1px solid ${t.outline.subtle}`,
      padding: '0.95rem 0.5rem',
      verticalAlign: 'middle',
    }),
    open: Style.compose(
      Style.self({
        background: 'none',
        border: '0',
        color: t.text.default,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
        padding: '0',
        textAlign: 'start',
      }),
      Style.nest('&::after', { content: '""', inset: '0', position: 'absolute' }),
      Style.pseudo(':hover', { color: t.accent.ink }),
    ),
    status: Style.self({ color: t.text.muted, fontSize: t.size.sm, margin: '0' }),
    more: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  },
  { name: 'ListStyle', layer: app },
)

/** A panel of the Builder's: a white card on the editor's grey, scrolling on its own. */
const builderPanel = Style.self({
  background: t.surface.base,
  border: `1px solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
  boxSizing: 'border-box',
  minHeight: '0',
  overflow: 'auto',
  padding: t.space.sm,
})

/** A panel's name above it: its `aria-label` says the same to assistive technology. */
const panelName = (name: string) =>
  Style.nest('&::before', {
    color: t.text.muted,
    content: `"${name}"`,
    display: 'block',
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
    gridColumn: '1 / -1',
    letterSpacing: '0.05em',
    marginBlockEnd: t.space.xs,
    textTransform: 'uppercase',
  })

/** A small heading inside a panel. */
const smallCaps = Style.self({
  color: t.text.muted,
  fontSize: '0.68rem',
  fontWeight: t.weight.semibold,
  letterSpacing: '0.06em',
  margin: '0',
  textTransform: 'uppercase',
})

/** Draws the icon in `--icon` before the element's words, in their color. */
const glyph = (size: string) =>
  Style.nest('&::before', {
    WebkitMask: 'var(--icon) center / contain no-repeat',
    background: 'currentColor',
    content: '""',
    flexShrink: '0',
    height: size,
    mask: 'var(--icon) center / contain no-repeat',
    width: size,
  })

/** Sets `--icon` by an attribute's value: each Block, action or viewport its own. */
const iconsBy = (attribute: string, names: Readonly<Record<string, IconName>>) =>
  Style.compose(
    ...Object.entries(names).map(([value, name]) =>
      Style.nest(`&[${attribute}="${value}"]`, { '--icon': iconUrl(name) }),
    ),
  )

const blockIcons = iconsBy('data-block', {
  Hero: 'hero',
  Section: 'section',
  Columns: 'columns',
  Divider: 'divider',
  Heading: 'heading',
  Text: 'text',
  Quote: 'quote',
  Callout: 'callout',
  Image: 'image',
  Button: 'button',
  PostList: 'list',
  FeaturedPost: 'star',
  LatestPages: 'files',
})

/** A square button showing only its icon; its words stay its accessible name. */
const iconButton = Style.compose(
  Style.self({
    alignItems: 'center',
    background: 'transparent',
    border: '0',
    borderRadius: t.radius.md,
    color: t.text.muted,
    cursor: 'pointer',
    display: 'inline-flex',
    // The words are there to be read, not seen: the icon is drawn at its own size.
    fontSize: '0',
    height: '2rem',
    justifyContent: 'center',
    padding: '0',
    width: '2rem',
  }),
  glyph('1rem'),
  Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
    background: t.surface.muted,
    color: t.text.overt,
  }),
  Style.pseudo(':is(:disabled, [aria-disabled="true"])', { cursor: 'default', opacity: '0.35' }),
  Style.pseudo(':focus-visible', {
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '1px',
  }),
)

/** Where the selection is marked on the page: a blue that shows on the site's colors. */
const selection = 'oklch(62% 0.19 255)'

/**
 * The Builder, as a page builder's three columns filling the screen: the
 * blocks to add over the page's layers on the left; the page in the middle,
 * under a bar with undo, where the selection is, and the viewport; the
 * selected block's settings on the right. Each column scrolls on its own. The
 * Builder draws its parts in one order, so each is placed on the grid by its
 * Slot. The canvas marks the selection, the hovered node and where a drop
 * would land on the element inside each node's wrapper, since a wrapper is
 * `display: contents` and draws nothing.
 */
// The inspector's fields, whether the Builder draws them (a look, a condition) or a
// Block's settings form does (a prop): a label over its control, both small.
const inspectorField = L.in('layouts', Layout.stack({ gap: '0.3rem' }))
const inspectorLabel = Style.self({
  color: t.text.default,
  fontSize: t.size.xs,
  fontWeight: t.weight.medium,
})
const inspectorControl = Style.compose(
  field,
  Style.self({ fontSize: t.size.sm, padding: '0.4rem 0.55rem' }),
)

/** A Block's props in the inspector, drawn by its settings form: as the inspector's own fields. */
export const InspectorFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: inspectorField,
    label: inspectorLabel,
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    error: Style.self({ color: t.error.ink, fontSize: t.size.xs, margin: '0' }),
    text: inspectorControl,
    multiline: inspectorControl,
    number: inspectorControl,
    select: inspectorControl,
  },
  { name: 'InspectorFieldStyle', layer: app },
)

/** The settings form around those fields: spaced as the inspector's sections are. */
export const InspectorFormStyle = Style.forSlots(FormSlots)(
  { root: L.in('layouts', Layout.stack({ gap: t.space.sm })) },
  { name: 'InspectorFormStyle', layer: app },
)

export const BuilderStyle = Style.forSlots(BuilderSlots)(
  {
    // Laid out by the editor's own width (`builder`), so a narrow editor stacks in a wide window.
    regions: Style.compose(
      Style.self({
        columnGap: t.space.md,
        display: 'grid',
        // The palette and the layers, the page under its bar, then the inspector.
        gridTemplateAreas: '"start bar end" "start stage end"',
        gridTemplateColumns: '15.5rem minmax(0, 1fr) 19rem',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: 'calc(100vh - 12.75rem)',
        minHeight: '34rem',
        position: 'relative',
      }),
      Style.container('builder (max-width: 64rem)', {
        gridTemplateAreas: 'none',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'none',
        height: 'auto',
        rowGap: t.space.sm,
      }),
    ),
    start: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.sm,
        gridArea: 'start',
        minHeight: '0',
      }),
      // Narrow, the panel a tab shows sits under the tabs, before the page: the
      // inspector too, which is drawn after the page.
      Style.container('builder (max-width: 64rem)', { gridArea: 'auto', order: '1' }),
    ),
    bar: Style.compose(
      Style.self({ alignItems: 'center', display: 'flex', gap: t.space.md, gridArea: 'bar' }),
      Style.container('builder (max-width: 64rem)', {
        flexWrap: 'wrap',
        gridArea: 'auto',
        order: '3',
      }),
    ),
    // The alert lies over the top of the page, in the same cell.
    stage: Style.compose(
      Style.self({ display: 'grid', gridArea: 'stage', minHeight: '0' }),
      Style.container('builder (max-width: 64rem)', { gridArea: 'auto', order: '4' }),
    ),
    end: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gridArea: 'end', minHeight: '0' }),
      Style.container('builder (max-width: 64rem)', { gridArea: 'auto', order: '2' }),
    ),
    palette: Style.compose(
      builderPanel,
      panelName('Add a block'),
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ flexShrink: '0', maxHeight: '26rem' }),
      // On a phone the page comes into view under it; the tiles scroll within.
      Style.container('builder (max-width: 64rem)', { maxHeight: '40vh' }),
    ),
    paletteGroup: Style.self({
      display: 'grid',
      gap: '0.3rem',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    }),
    paletteHeading: Style.compose(smallCaps, Style.self({ gridColumn: '1 / -1' })),
    paletteItem: Style.compose(
      blockIcons,
      Style.self({
        alignItems: 'center',
        background: t.surface.subtle,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        color: t.text.default,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        font: 'inherit',
        gap: '0.35rem',
        padding: '0.6rem 0.2rem 0.5rem',
        transition: 'background 120ms ease, border-color 120ms ease',
      }),
      glyph('1.15rem'),
      Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
        background: t.accent.subtle,
        borderColor: t.accent.default,
        color: t.accent.ink,
      }),
      Style.pseudo(':is(:disabled, [aria-disabled="true"])', {
        cursor: 'not-allowed',
        opacity: '0.4',
      }),
    ),
    paletteLabel: Style.self({
      fontSize: '0.7rem',
      fontWeight: t.weight.medium,
      lineHeight: '1.2',
      textAlign: 'center',
    }),
    // The tile has room for a name; what it is for is its title's to say, and is read.
    paletteHint: visuallyHidden,
    layers: Style.compose(
      builderPanel,
      panelName('Layers'),
      Style.self({ flex: '1', minHeight: '0' }),
      Style.container('builder (max-width: 64rem)', { maxHeight: '40vh' }),
    ),
    tree: Style.self({ listStyle: 'none', margin: '0', padding: '0' }),
    row: Style.compose(
      blockIcons,
      Style.self({
        alignItems: 'center',
        borderRadius: t.radius.sm,
        cursor: 'pointer',
        // A drag begun on a row moves the row, not a selection of every row's text.
        userSelect: 'none',
        display: 'flex',
        fontSize: t.size.sm,
        gap: '0.35rem',
        padding: '0.3rem 0.4rem',
        // TreeNavigation writes each row's depth, 1 at the top.
        paddingInlineStart: 'calc(0.4rem + (var(--fk-tree-level) - 1) * 1rem)',
      }),
      // A row with nothing to open is set in by the width of the toggle it lacks.
      Style.nest('&:not([aria-expanded])', {
        paddingInlineStart: 'calc(1.5rem + (var(--fk-tree-level) - 1) * 1rem)',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${t.accent.default}` }),
      Style.nest('&[aria-selected="true"]', { background: t.accent.subtle, color: t.accent.ink }),
      Style.nest('&[data-builder-dragging]', { opacity: '0.5' }),
      Style.nest('&[data-builder-drop="inside"]', {
        boxShadow: `inset 0 0 0 2px ${t.accent.default}`,
      }),
      Style.nest('&[data-builder-drop="before"]', {
        boxShadow: `inset 0 2px 0 ${t.accent.default}`,
      }),
      Style.nest('&[data-builder-drop="after"]', {
        boxShadow: `inset 0 -2px 0 ${t.accent.default}`,
      }),
    ),
    rowToggle: Style.compose(
      Style.self({
        '--icon': iconUrl('chevron'),
        alignItems: 'center',
        color: t.text.muted,
        display: 'inline-flex',
        height: '1rem',
        justifyContent: 'center',
        width: '1rem',
      }),
      glyph('0.8rem'),
      Style.nest('&::before', { transition: 'transform 120ms ease' }),
      Style.nest('[aria-expanded="true"] > &::before', { transform: 'rotate(90deg)' }),
    ),
    rowLabel: Style.compose(
      Style.self({
        alignItems: 'center',
        display: 'inline-flex',
        flexShrink: '0',
        fontWeight: t.weight.medium,
        gap: '0.4rem',
      }),
      glyph('0.9rem'),
    ),
    rowSummary: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    inspector: Style.compose(
      builderPanel,
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({ flex: '1', minHeight: '0', padding: t.space.md }),
      Style.container('builder (max-width: 64rem)', { maxHeight: '50vh' }),
    ),
    inspectorHead: L.in('layouts', Layout.stack({ gap: '0.3rem' })),
    inspectorTitle: Style.self({
      color: t.text.overt,
      fontSize: t.size.md,
      fontWeight: t.weight.semibold,
      margin: '0',
    }),
    inspectorHint: Style.self({ color: t.text.muted, fontSize: t.size.sm, margin: '0' }),
    actions: Style.compose(
      Style.self({
        borderBlock: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        gap: '2px',
        justifyContent: 'space-between',
        marginBlockStart: t.space.xs,
        paddingBlock: '0.25rem',
      }),
    ),
    action: Style.compose(
      iconButton,
      iconsBy('data-action', {
        'move-up': 'up',
        'move-down': 'down',
        'move-out': 'outdent',
        'move-in': 'indent',
        duplicate: 'copy',
        copy: 'clipboard',
        cut: 'scissors',
        delete: 'trash',
      }),
      Style.nest('&[data-action="delete"]:hover:not(:disabled, [aria-disabled="true"])', {
        background: t.error.subtle,
        color: t.error.ink,
      }),
    ),
    inspectorSection: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.nest('& + &', {
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        paddingBlockStart: t.space.md,
      }),
    ),
    inspectorSectionTitle: smallCaps,
    field: inspectorField,
    label: inspectorLabel,
    control: inspectorControl,
    option: Style.self({
      alignItems: 'center',
      display: 'flex',
      fontSize: t.size.sm,
      gap: t.space['2xs'],
    }),
    choices: Style.self({
      background: t.surface.muted,
      borderRadius: t.radius.md,
      display: 'flex',
      gap: '2px',
      padding: '2px',
    }),
    choice: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.sm,
        color: t.text.muted,
        cursor: 'pointer',
        flex: '1',
        font: 'inherit',
        fontSize: t.size.xs,
        fontWeight: t.weight.medium,
        padding: '0.35rem 0.4rem',
      }),
      Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', { color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.base,
        boxShadow: '0 1px 2px rgb(0 0 0 / 10%)',
        color: t.text.overt,
      }),
    ),
    shortcuts: Style.self({
      alignItems: 'baseline',
      columnGap: t.space.sm,
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      margin: '0',
      rowGap: '0.45rem',
    }),
    shortcutKeys: Style.self({
      background: t.surface.subtle,
      border: `1px solid ${t.outline.default}`,
      borderBottomWidth: '2px',
      borderRadius: t.radius.sm,
      fontFamily: t.font.mono,
      fontSize: '0.68rem',
      justifySelf: 'start',
      padding: '0.05rem 0.35rem',
      whiteSpace: 'nowrap',
    }),
    shortcutWhat: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    toolbar: Style.self({ display: 'flex', gap: '2px' }),
    toolbarAction: Style.compose(
      iconButton,
      iconsBy('data-action', { undo: 'undo', redo: 'redo', paste: 'paste' }),
    ),
    // Each crumb whole, never squeezed into its neighbour: a trail longer than the
    // bar scrolls sideways, and a narrow editor gives it a row of its own.
    crumbs: Style.compose(
      Style.self({
        alignItems: 'center',
        display: 'flex',
        flex: '1',
        minWidth: '0',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }),
      Style.container('builder (max-width: 40rem)', { flexBasis: '100%', order: '1' }),
    ),
    crumb: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.sm,
        color: t.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        flexShrink: '0',
        fontSize: t.size.sm,
        minHeight: '2rem',
        padding: '0.25rem 0.4rem',
        whiteSpace: 'nowrap',
      }),
      // A finger is wider than a pointer: a target it can hit.
      Style.media('(pointer: coarse)', { minHeight: '2.75rem' }),
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
      Style.nest('& + &::before', {
        color: t.text.subtle,
        content: '"/"',
        marginInlineEnd: '0.5rem',
      }),
      Style.nest('&[aria-current]', { color: t.text.overt, fontWeight: t.weight.semibold }),
    ),
    viewports: Style.compose(
      Style.self({
        background: t.surface.muted,
        borderRadius: t.radius.md,
        display: 'flex',
        gap: '2px',
        padding: '2px',
      }),
    ),
    // The narrow editor's tabs, a segmented control like the viewports. Their `display`
    // is the Builder's: hidden while the editor is wide.
    panelTabs: Style.self({
      background: t.surface.muted,
      borderRadius: t.radius.md,
      gap: '2px',
      padding: '2px',
    }),
    panelTab: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.sm,
        color: t.text.muted,
        cursor: 'pointer',
        flex: '1',
        font: 'inherit',
        fontSize: t.size.sm,
        padding: '0.4rem 0.75rem',
      }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.base,
        boxShadow: '0 1px 2px rgb(0 0 0 / 10%)',
        color: t.text.overt,
        fontWeight: t.weight.semibold,
      }),
    ),
    viewport: Style.compose(
      iconButton,
      iconsBy('data-viewport', { wide: 'monitor', medium: 'tablet', narrow: 'phone' }),
      Style.self({ height: '1.75rem', width: '2.25rem' }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.base,
        boxShadow: '0 1px 2px rgb(0 0 0 / 10%)',
        color: t.text.overt,
      }),
    ),
    alert: Style.compose(
      Style.self({
        background: t.error.subtle,
        borderRadius: t.radius.md,
        color: t.error.ink,
        fontSize: t.size.sm,
        // Over the top of the page, as a notice: it comes and goes without moving the page.
        alignSelf: 'start',
        boxShadow: '0 4px 12px rgb(0 0 0 / 12%)',
        gridArea: '1 / 1',
        margin: `${t.space.md} ${t.space.lg} 0`,
        padding: `${t.space.xs} ${t.space.sm}`,
        zIndex: '1',
      }),
    ),
    canvas: Style.compose(
      Style.self({
        background: `radial-gradient(${t.outline.default} 1px, transparent 1px) 0 0 / 16px 16px, ${t.surface.subtle}`,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        boxSizing: 'border-box',
        gridArea: '1 / 1',
        marginBlockStart: t.space.sm,
        minHeight: '0',
        overflow: 'auto',
        padding: t.space.lg,
      }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${t.accent.default}` }),
      Style.container('builder (max-width: 64rem)', { minHeight: '30rem' }),
      Style.container('builder (max-width: 30rem)', { padding: t.space.xs }),
      Style.nest('[data-composition-drop="before"] > *', { boxShadow: `0 -3px 0 ${selection}` }),
      Style.nest('[data-composition-drop="after"] > *', { boxShadow: `0 3px 0 ${selection}` }),
      Style.nest('[data-composition-drop="inside"] > *', {
        outline: `2px dashed ${selection}`,
      }),
    ),
    // Drawn over the page by the Builder, where the selected and hovered nodes are.
    selectionBox: Style.self({
      outline: `2px solid ${selection}`,
      // Clear of the block's own edge, so its text never touches the line.
      outlineOffset: '4px',
      borderRadius: t.radius.sm,
    }),
    selectionLabel: Style.self({
      background: selection,
      borderRadius: `${t.radius.sm} ${t.radius.sm} 0 0`,
      color: 'white',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      lineHeight: '1.6',
      marginBlockEnd: '3px',
      marginInlineStart: '-3px',
      paddingInline: '0.45rem',
      whiteSpace: 'nowrap',
    }),
    hoverBox: Style.self({ outline: `1px dashed ${selection}`, outlineOffset: '4px' }),
    frame: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        background: t.surface.base,
        borderRadius: t.radius.md,
        boxShadow: '0 1px 2px rgb(0 0 0 / 6%), 0 12px 32px rgb(0 0 0 / 8%)',
        margin: '0 auto',
        minHeight: '100%',
        padding: t.space.md,
        transition: 'max-width 200ms ease',
      }),
      Style.container('builder (max-width: 30rem)', { padding: t.space.xs }),
    ),
    empty: Style.self({
      border: `2px dashed ${t.outline.default}`,
      borderRadius: t.radius.lg,
      color: t.text.muted,
      margin: '0',
      padding: `${t.space['2xl']} ${t.space.lg}`,
      textAlign: 'center',
    }),
    // The live region is read, not seen; hidden absolutely, it takes no cell of the grid.
    live: visuallyHidden,
  },
  { name: 'BuilderStyle', layer: app },
)

// --- the public site --------------------------------------------------------------

export const SiteSlots = Slots.define({
  root: part,
  /** The bar across the top: the brand, the site's sections, and the way to the studio. */
  header: part,
  brand: part,
  brandMark: part,
  nav: part,
  navLink: control,
  /** The way back to the studio, for an author reading the site. */
  studio: control,
  main: part,
  /** The top of the blog: its name and what it is about. */
  masthead: part,
  heading: part,
  lede: part,
  article: part,
  /** A post's date, title and excerpt, centred above its cover. */
  articleHead: part,
  meta: part,
  title: part,
  standfirst: part,
  cover: part,
  body: part,
  back: control,
  footer: part,
  footerNav: part,
  status: part,
})

/** At most `width` wide, in the middle of what holds it. */
const centred = (width: string) =>
  Style.self({ marginInline: 'auto', maxWidth: width, width: '100%' })

export const SiteStyle = Style.forSlots(SiteSlots)(
  {
    root: Style.self({
      background: t.surface.base,
      color: t.text.default,
      display: 'grid',
      fontFamily: t.font.body,
      gridTemplateRows: 'auto 1fr auto',
      minHeight: '100vh',
    }),
    header: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        backdropFilter: 'saturate(180%) blur(12px)',
        background: `color-mix(in oklch, ${t.surface.base} 82%, transparent)`,
        borderBottom: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        // As wide as the page's content, without a wrapper around the header's parts.
        paddingBlock: t.space.sm,
        paddingInline: `max(${t.space.lg}, calc((100% - 72rem) / 2 + ${t.space.lg}))`,
        position: 'sticky',
        top: '0',
        zIndex: '10',
      }),
    ),
    brand: Style.compose(
      touchTarget,
      Style.self({
        alignItems: 'center',
        color: t.text.overt,
        display: 'inline-flex',
        fontFamily: t.font.heading,
        fontSize: t.size.lg,
        fontWeight: t.weight.bold,
        gap: t.space.xs,
        letterSpacing: '-0.02em',
        textDecoration: 'none',
      }),
    ),
    brandMark: Style.self({
      alignItems: 'center',
      background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 50%, ${t.tertiary.default}))`,
      borderRadius: t.radius.md,
      color: t.accent['on-fill'],
      display: 'inline-flex',
      fontSize: t.size.sm,
      height: '1.75rem',
      justifyContent: 'center',
      width: '1.75rem',
    }),
    nav: L.in('layouts', Layout.cluster({ gap: '2px', align: 'center' })),
    navLink,
    studio: Style.compose(primaryButton, Style.self({ marginInlineStart: t.space.xs })),
    main: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      centred('72rem'),
      Style.self({
        // The page's container, as the builder's frame is: a look measures the page.
        containerType: 'inline-size',
        containerName: PAGE_CONTAINER,
        boxSizing: 'border-box',
        paddingBlock: `${t.space.xl} ${t.space['3xl']}`,
        paddingInline: t.space.lg,
      }),
      touchTargets,
    ),
    masthead: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({ paddingBlockStart: t.space.xl, textAlign: 'center' }),
    ),
    heading: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: 'clamp(2.4rem, 6vw, 3.6rem)',
      letterSpacing: '-0.03em',
      lineHeight: '1.05',
      margin: '0',
    }),
    lede: Style.self({
      color: t.text.muted,
      fontSize: t.size.lg,
      margin: '0 auto',
      maxWidth: '36rem',
    }),
    article: L.in('layouts', Layout.stack({ gap: t.space.xl })),
    articleHead: Style.compose(
      centred('48rem'),
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ paddingBlockStart: t.space.lg, textAlign: 'center' }),
    ),
    meta: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.06em',
      margin: '0',
      textTransform: 'uppercase',
    }),
    title: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: 'clamp(2.2rem, 5.5vw, 3.4rem)',
      letterSpacing: '-0.03em',
      lineHeight: '1.08',
      margin: '0',
      textWrap: 'balance',
    }),
    standfirst: Style.self({
      color: t.text.muted,
      fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
      lineHeight: '1.5',
      margin: '0',
      textWrap: 'pretty',
    }),
    cover: Style.compose(
      centred('68rem'),
      Style.self({ aspectRatio: '21 / 9', borderRadius: t.radius.xl }),
    ),
    body: Style.compose(
      L.in('components', Prose.style({ measure: '44rem', leading: '1.75' })),
      Style.self({ fontFamily: serif, fontSize: '1.25rem', marginInline: 'auto', width: '100%' }),
    ),
    back: Style.compose(
      centred('44rem'),
      Style.self({
        color: t.accent.ink,
        fontWeight: t.weight.semibold,
        textDecoration: 'none',
      }),
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
    footer: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        background: t.surface.subtle,
        borderTop: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        color: t.text.muted,
        fontSize: t.size.sm,
        paddingBlock: t.space.lg,
        paddingInline: `max(${t.space.lg}, calc((100% - 72rem) / 2 + ${t.space.lg}))`,
      }),
    ),
    footerNav: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.md })),
      Style.nest('a', {
        alignItems: 'center',
        color: 'inherit',
        display: 'inline-flex',
        textDecoration: 'none',
      }),
      Style.at('@media (pointer: coarse)', Style.nest('a', { minHeight: '2.75rem' })),
      Style.nest('a:hover', { color: t.text.overt }),
    ),
    status: Style.self({
      color: t.text.muted,
      padding: `${t.space['3xl']} 0`,
      textAlign: 'center',
    }),
  },
  { name: 'SiteStyle', layer: app },
)
