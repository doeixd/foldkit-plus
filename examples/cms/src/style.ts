/**
 * The example's appearance, as `foldkit-mixins` Style: a theme from one accent
 * color, a page style for each application, and the page Builder's panels and
 * edit marks. `sheet.ts` compiles them into the one stylesheet `client.ts`
 * injects; the views attach the same values, so their classes are the sheet's.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { BuilderSlots } from 'foldkit-mixins-builder'

export const theme = Theme.compose(
  Theme.tokens,
  Theme.oklch({
    accent: { h: 250, c: 0.14, l: '52%', dark: { l: '70%', c: 0.12 } },
    surfaceSaturation: 0.006,
  }),
)
const t = Theme.ref(theme)

const L = Layers.standard
/** Every slot style is born in `app`, so the value a view attaches is the one the sheet ships. */
const app = L.layer('app')

export const PageSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

/** A column of sections, `width` wide at most, with the worklist's table and muted notes in it. */
const page = (width: string): StyleValue =>
  Style.compose(
    L.in('layouts', Layout.stack({ gap: '1.25rem' })),
    Style.self({
      boxSizing: 'border-box',
      margin: '0 auto',
      maxWidth: width,
      padding: '1.5rem 1rem',
      color: t.text.default,
    }),
    Style.nest('.muted', { color: t.text.muted }),
    Style.nest('table', { borderCollapse: 'collapse', width: '100%' }),
    Style.nest('th, td', {
      borderBottom: `1px solid ${t.outline.subtle}`,
      padding: '0.4rem 0.5rem',
      textAlign: 'left',
    }),
    Style.nest('tbody tr', { cursor: 'pointer' }),
    Style.nest('tbody tr:hover', { background: t.surface.muted }),
  )

export const PostsPageStyle = Style.forSlots(PageSlots)(
  { root: page('44rem') },
  { name: 'PostsPageStyle', layer: app },
)

/** Wider: the Builder's panels sit beside the page it edits. */
export const PagesPageStyle = Style.forSlots(PageSlots)(
  { root: page('76rem') },
  { name: 'PagesPageStyle', layer: app },
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
        columnGap: '1.5rem',
        display: 'grid',
        gridTemplateColumns: '17rem minmax(0, 1fr)',
      }),
      // Spaced by margins, not a row gap: the canvas spans rows the panels leave empty.
      Style.nest('> *', { marginBlockEnd: '0.75rem' }),
    ),
    palette: L.in('layouts', Layout.cluster({ gap: '0.4rem' })),
    tree: Style.self({ listStyle: 'none', margin: '0', padding: '0' }),
    row: Style.compose(
      Style.self({ cursor: 'pointer', padding: '0.15rem 0.4rem' }),
      Style.nest('&[aria-selected="true"]', { background: t.accent.subtle }),
      Style.nest('&[data-builder-dragging]', { opacity: '0.5' }),
    ),
    inspector: L.in('layouts', Layout.stack({ gap: '0.5rem' })),
    field: L.in('layouts', Layout.stack({ gap: '0.2rem' })),
    canvas: Style.compose(
      Style.self({
        border: `1px solid ${t.outline.subtle}`,
        gridColumn: '2',
        gridRow: '1 / span 20',
        minHeight: '20rem',
        padding: '1rem',
      }),
      Style.nest('[data-composition-selected] > *', {
        outline: `2px solid ${t.accent.default}`,
      }),
      Style.nest('[data-composition-hovered] > *', { outline: `1px dashed ${t.text.muted}` }),
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
  },
  { name: 'BuilderStyle', layer: app },
)
