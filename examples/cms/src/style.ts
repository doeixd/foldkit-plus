/**
 * The example's appearance, as `foldkit-mixins` Style: one theme, derived from
 * an accent color, and the Slots the views publish, styled here and nowhere
 * else. `sheet.ts` compiles every rule into the one stylesheet `client.ts`
 * injects; the views attach the same values, so their classes are the sheet's.
 *
 * - `AdminSlots`: the authoring shell of the posts and the pages.
 * - `SiteSlots`: the public site's shell and its article.
 * - The mixins' own Slots: the form's fields, the worklist's table, the Builder.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { BuilderSlots } from 'foldkit-mixins-builder'
import { ListSlots } from 'foldkit-mixins-crud'
import { FieldSlots, FormSlots, type FieldInput } from 'foldkit-mixins-form'
import { Recipes } from 'foldkit-mixins-ui'
import { Layout } from 'foldkit-mixins/layout'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'

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
/** Every slot style is born in `app`, so the value a view attaches is the one the sheet ships. */
const app = L.layer('app')

const part = Slot.make({ capability: Capability.Container })
const control = Slot.make({ capability: Capability.Interactive })

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
    outline: `3px solid color-mix(in oklch, ${t.accent.default} 25%, transparent)`,
  }),
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
  /** Beside a link's words, at its end: an external mark, a role. */
  navAside: part,
  account: part,
  accountLabel: part,
  whoLink: control,
  avatar: part,
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
  panel: part,
  panelHead: part,
  panelTitle: part,
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
  Style.pseudo(':hover:not(:disabled)', {
    background: `color-mix(in oklch, ${t.text.overt} 85%, ${t.surface.base})`,
  }),
  Style.pseudo(':disabled', { cursor: 'not-allowed', opacity: '0.45' }),
  Style.pseudo(':focus-visible', {
    outline: `3px solid color-mix(in oklch, ${t.accent.default} 40%, transparent)`,
    outlineOffset: '2px',
  }),
)

/** An entry's state as a pill, colored by its tag, which `attribute` names. */
const stateBadge = (attribute: string) => {
  const tone = (state: string, family: 'success' | 'warning' | 'info' | 'error') =>
    Style.nest(`&[${attribute}="${state}"]`, {
      background: t[family].subtle,
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
      Style.media('(max-width: 52rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
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
      Style.media('(max-width: 52rem)', {
        flexDirection: 'row',
        flexWrap: 'wrap',
        height: 'auto',
        position: 'static',
      }),
    ),
    brand: Style.self({
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
    nav: Style.self({ display: 'flex', flexDirection: 'column', gap: '2px' }),
    navLink,
    navAside: Style.self({
      color: t.text.muted,
      display: 'inline-flex',
      fontSize: t.size.xs,
      fontWeight: t.weight.normal,
      marginInlineStart: 'auto',
    }),
    account: Style.compose(
      Style.self({
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        marginBlockStart: 'auto',
        paddingBlockStart: t.space.sm,
      }),
      Style.media('(max-width: 52rem)', { marginBlockStart: '0' }),
    ),
    accountLabel: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      margin: `0 0 ${t.space['3xs']}`,
      padding: `0 ${t.space['2xs']}`,
      textTransform: 'uppercase',
    }),
    whoLink: Style.compose(navLink, Style.self({ padding: '0.35rem 0.5rem' })),
    avatar: Style.compose(
      Style.self({
        alignItems: 'center',
        background: t.surface.overt,
        borderRadius: t.radius.full,
        color: t.surface.base,
        display: 'inline-flex',
        fontSize: t.size.xs,
        fontWeight: t.weight.bold,
        height: '1.5rem',
        justifyContent: 'center',
        width: '1.5rem',
      }),
      Style.nest('&[data-chair="wren"]', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
      Style.nest('&[data-chair="edda"]', {
        background: t.tertiary.default,
        color: t.tertiary['on-fill'],
      }),
    ),
    main: Style.self({ minWidth: '0' }),
    screen: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '64rem',
        padding: `${t.space['2xl']} ${t.space.xl}`,
      }),
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
      Style.nest('> svg', { insetInlineStart: '0.7rem', position: 'absolute' }),
    ),
    editorScreen: Style.self({ display: 'flex', flexDirection: 'column', minHeight: '100vh' }),
    editorBar: Style.self({
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
      Style.nest('> button', { marginInlineStart: 'auto' }),
    ),
    preview: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.nest('> p', { fontFamily: serif, fontSize: '1.2rem', lineHeight: '1.8', margin: '0' }),
    ),
    panel: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({
        background: t.surface.base,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        boxShadow: '0 1px 2px rgb(0 0 0 / 4%), 0 8px 24px rgb(0 0 0 / 4%)',
        padding: t.space.lg,
      }),
    ),
    panelHead: L.in(
      'layouts',
      Layout.cluster({ gap: t.space.sm, justify: 'space-between', align: 'center' }),
    ),
    panelTitle: Style.self({
      fontFamily: t.font.heading,
      fontSize: t.size.lg,
      fontWeight: t.weight.semibold,
      margin: '0',
    }),
    toolbar: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    button: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    primary: primaryButton,
    danger: button({ tone: 'danger', variant: 'outline', size: 'sm' }),
    status: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.sm, margin: '0' }),
      Style.nest('&[data-tone="error"]', { color: t.error.ink }),
    ),
    muted: Style.self({ color: t.text.muted, margin: '0' }),
    list: Style.self({
      display: 'grid',
      gap: t.space['3xs'],
      listStyle: 'none',
      margin: '0',
      padding: '0',
    }),
    listButton: Style.compose(
      Style.self({
        alignItems: 'center',
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.md,
        color: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        font: 'inherit',
        gap: t.space.xs,
        justifyContent: 'space-between',
        padding: '0.5rem 0.65rem',
        textAlign: 'start',
        width: '100%',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('&[aria-current="page"]', {
        background: t.accent.subtle,
        color: t.accent.ink,
        fontWeight: t.weight.semibold,
      }),
    ),
    badge: stateBadge('data-state'),
    search: Style.compose(field, Style.self({ paddingInlineStart: '2.1rem' })),
  },
  { name: 'AdminStyle', layer: app },
)

// --- the form, the worklist, and the Builder --------------------------------------

export const FieldStyle = Style.forSlots(FieldSlots)(
  {
    root: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    group: Style.self({ alignItems: 'center', display: 'flex' }),
    affix: Style.self({ color: t.text.muted, paddingInlineEnd: t.space['3xs'] }),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.semibold }),
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    error: Style.self({ color: t.error.ink, fontSize: t.size.sm, margin: '0' }),
    text: field,
    number: field,
    select: field,
    multiline: Style.compose(field, Style.self({ minHeight: '7rem', resize: 'vertical' })),
    choices: L.in('layouts', Layout.cluster({ gap: t.space.sm })),
  },
  { name: 'FieldStyle', layer: app },
)

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
    row: Style.pseudo(':hover', { background: t.surface.muted }),
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
      Style.pseudo(':hover', { color: t.accent.ink }),
    ),
    status: Style.self({ color: t.text.muted, fontSize: t.size.sm, margin: '0' }),
    more: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  },
  { name: 'ListStyle', layer: app },
)

/**
 * The Builder: its panels in a column, the canvas beside them for as many rows
 * as they take. The canvas marks the selection, the hovered node and where a
 * drop would land on the element inside each node's wrapper, since a wrapper is
 * `display: contents` and draws nothing.
 */
export const BuilderStyle = Style.forSlots(BuilderSlots)(
  {
    root: Style.compose(
      Style.self({
        alignItems: 'start',
        columnGap: t.space.lg,
        display: 'grid',
        gridTemplateColumns: '18rem minmax(0, 1fr)',
      }),
      // Spaced by margins, not a row gap: the canvas spans rows the panels leave empty.
      Style.nest('> *', { marginBlockEnd: t.space.sm }),
      Style.media('(max-width: 56rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    palette: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space['2xs'] })),
      Style.self({
        background: t.surface.muted,
        borderRadius: t.radius.md,
        padding: t.space.xs,
      }),
    ),
    paletteItem: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    layers: Style.self({
      border: `1px solid ${t.outline.subtle}`,
      borderRadius: t.radius.md,
      maxHeight: '18rem',
      overflow: 'auto',
      padding: t.space['2xs'],
    }),
    tree: Style.self({ listStyle: 'none', margin: '0', padding: '0' }),
    row: Style.compose(
      Style.self({
        borderRadius: t.radius.sm,
        cursor: 'pointer',
        fontSize: t.size.sm,
        padding: '0.25rem 0.5rem',
        // TreeNavigation writes each row's depth, 1 at the top.
        paddingInlineStart: 'calc(0.5rem + (var(--fk-tree-level) - 1) * 1rem)',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('&[aria-selected="true"]', {
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
      Style.nest('&[data-builder-dragging]', { opacity: '0.5' }),
      Style.nest('&[data-builder-drop]', { boxShadow: `inset 0 0 0 2px ${t.accent.default}` }),
    ),
    actions: L.in('layouts', Layout.cluster({ gap: t.space['3xs'] })),
    action: button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
    inspector: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        padding: t.space.sm,
      }),
    ),
    field: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['3xs'] })),
      Style.nest('> label, > span', {
        color: t.text.muted,
        fontSize: t.size.xs,
        fontWeight: t.weight.semibold,
      }),
    ),
    control: Style.compose(field, Style.self({ fontSize: t.size.sm, padding: '0.35rem 0.5rem' })),
    history: L.in('layouts', Layout.cluster({ gap: t.space['3xs'] })),
    undo: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    redo: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    viewports: L.in('layouts', Layout.cluster({ gap: t.space['3xs'] })),
    viewport: Style.compose(
      button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
    ),
    preview: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    alert: Style.self({
      background: t.error.subtle,
      borderRadius: t.radius.md,
      color: t.error.ink,
      fontSize: t.size.sm,
      margin: '0',
      padding: t.space.xs,
    }),
    canvas: Style.compose(
      Style.self({
        background: t.surface.muted,
        borderRadius: t.radius.lg,
        gridColumn: '2',
        gridRow: '1 / span 20',
        minHeight: '28rem',
        padding: t.space.md,
      }),
      Style.media('(max-width: 56rem)', { gridColumn: 'auto', gridRow: 'auto' }),
      // Warm, so it shows on the accent a Hero or a Button is drawn in.
      Style.nest('[data-composition-mark="hovered"] > *', {
        outline: `1px dashed ${t.warning.default}`,
        outlineOffset: '3px',
      }),
      Style.nest('[data-composition-mark="selected"] > *', {
        outline: `2px solid ${t.warning.default}`,
        outlineOffset: '3px',
      }),
      Style.nest('[data-composition-drop="before"] > *', {
        boxShadow: `0 -3px 0 ${t.accent.default}`,
      }),
      Style.nest('[data-composition-drop="after"] > *', {
        boxShadow: `0 3px 0 ${t.accent.default}`,
      }),
      Style.nest('[data-composition-drop="inside"] > *', {
        outline: `2px dashed ${t.accent.default}`,
      }),
    ),
    frame: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        background: t.surface.base,
        borderRadius: t.radius.md,
        boxShadow: '0 1px 3px rgb(0 0 0 / 8%)',
        padding: t.space.md,
      }),
    ),
  },
  { name: 'BuilderStyle', layer: app },
)

// --- the public site --------------------------------------------------------------

export const SiteSlots = Slots.define({
  root: part,
  header: part,
  brand: part,
  nav: part,
  navLink: control,
  main: part,
  footer: part,
  heading: part,
  article: part,
  cover: part,
  title: part,
  meta: part,
  body: part,
  back: control,
  status: part,
})

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
        Layout.cluster({ gap: t.space.lg, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '72rem',
        padding: `${t.space.md} ${t.space.lg}`,
        width: '100%',
      }),
    ),
    brand: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: t.size.xl,
      fontWeight: t.weight.bold,
      letterSpacing: '-0.02em',
      textDecoration: 'none',
    }),
    nav: L.in('layouts', Layout.cluster({ gap: t.space['2xs'] })),
    navLink,
    main: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xl })),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '72rem',
        padding: `${t.space.md} ${t.space.lg} ${t.space['3xl']}`,
        width: '100%',
      }),
    ),
    footer: Style.self({
      borderTop: `1px solid ${t.outline.subtle}`,
      color: t.text.muted,
      fontSize: t.size.sm,
      padding: t.space.lg,
      textAlign: 'center',
    }),
    heading: Style.self({
      fontFamily: t.font.heading,
      fontSize: 'clamp(2rem, 5vw, 3rem)',
      letterSpacing: '-0.02em',
      margin: '0',
    }),
    article: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({ margin: '0 auto', maxWidth: '46rem', width: '100%' }),
    ),
    cover: Style.self({ aspectRatio: '21 / 9', borderRadius: t.radius.xl }),
    title: Style.self({
      fontFamily: t.font.heading,
      fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
      letterSpacing: '-0.02em',
      lineHeight: '1.1',
      margin: '0',
    }),
    meta: Style.self({ color: t.text.muted, margin: '0' }),
    body: Style.compose(
      L.in('components', Prose.style({ measure: '68ch' })),
      Style.self({ fontSize: t.size.lg }),
    ),
    back: Style.self({ color: t.accent.ink, fontWeight: t.weight.semibold }),
    status: Style.self({
      color: t.text.muted,
      padding: `${t.space['3xl']} 0`,
      textAlign: 'center',
    }),
  },
  { name: 'SiteStyle', layer: app },
)
