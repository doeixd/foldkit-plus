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
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { BuilderSlots } from 'foldkit-mixins-builder'
import { ListSlots } from 'foldkit-mixins-crud'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
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
  header: part,
  brand: part,
  nav: part,
  navLink: control,
  who: part,
  whoLink: control,
  main: part,
  /** The list beside the editor. */
  workspace: part,
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
    borderRadius: t.radius.md,
    color: t.text.muted,
    fontWeight: t.weight.medium,
    padding: '0.4rem 0.75rem',
    textDecoration: 'none',
  }),
  Style.pseudo(':hover', { background: t.surface.muted, color: t.text.default }),
  Style.nest('&[aria-current="page"]', { background: t.accent.subtle, color: t.accent.ink }),
)

/** The state of an entry, by its tag, in the colors its family says. */
const badgeFor = (state: string, family: 'success' | 'warning' | 'info' | 'error') =>
  Style.nest(`&[data-state="${state}"]`, { background: t[family].subtle, color: t[family].ink })

export const AdminStyle = Style.forSlots(AdminSlots)(
  {
    root: Style.self({
      background: t.surface.muted,
      color: t.text.default,
      display: 'grid',
      fontFamily: t.font.body,
      gridTemplateRows: 'auto 1fr',
      minHeight: '100vh',
    }),
    header: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.lg, align: 'center' })),
      Style.self({
        background: t.surface.base,
        borderBottom: `1px solid ${t.outline.subtle}`,
        padding: `${t.space.sm} ${t.space.lg}`,
        position: 'sticky',
        top: '0',
        zIndex: '10',
      }),
    ),
    brand: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: t.size.lg,
      fontWeight: t.weight.bold,
      letterSpacing: '-0.01em',
      textDecoration: 'none',
    }),
    nav: L.in('layouts', Layout.cluster({ gap: t.space['2xs'] })),
    navLink,
    who: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space['2xs'], align: 'center' })),
      Style.self({ color: t.text.muted, fontSize: t.size.sm, marginInlineStart: 'auto' }),
    ),
    whoLink: Style.compose(navLink, Style.self({ fontSize: t.size.sm, padding: '0.25rem 0.6rem' })),
    main: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '84rem',
        padding: t.space.lg,
        width: '100%',
      }),
    ),
    workspace: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        gap: t.space.lg,
        gridTemplateColumns: 'minmax(15rem, 20rem) minmax(0, 1fr)',
      }),
      Style.media('(max-width: 56rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
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
    primary: button({ tone: 'accent', variant: 'solid', size: 'sm' }),
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
    badge: Style.compose(
      Style.self({
        background: t.surface.muted,
        borderRadius: t.radius.full,
        color: t.text.muted,
        fontSize: t.size.xs,
        fontWeight: t.weight.medium,
        padding: '0.1rem 0.55rem',
        whiteSpace: 'nowrap',
      }),
      badgeFor('Published', 'success'),
      badgeFor('Changed', 'warning'),
      badgeFor('New', 'info'),
      badgeFor('Unpublished', 'warning'),
      badgeFor('Archived', 'error'),
    ),
    search: field,
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
      padding: '0.55rem 0.5rem',
      verticalAlign: 'middle',
    }),
    open: Style.compose(
      Style.self({
        background: 'none',
        border: '0',
        color: t.text.default,
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: t.weight.medium,
        padding: '0',
        textAlign: 'start',
      }),
      Style.pseudo(':hover', { color: t.accent.ink, textDecoration: 'underline' }),
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
