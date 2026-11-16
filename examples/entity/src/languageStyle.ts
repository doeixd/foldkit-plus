/**
 * The language page's look: the demos' theme, the shipped frame, card, table
 * and controls, and a few Slots of its own. Code and statements read in the
 * theme's monospace face and scroll inside their own box, never the page.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import {
  AppShellSlots,
  BadgeSlots,
  CardSlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
  TableSlots,
} from 'foldkit-mixins-ui'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t, L } = demoStyle

export const stylesheet = demoStyle.stylesheet

export const ShellStyle = demoStyle.forSlots(AppShellSlots)(
  Recipes.AppShell({ width: 'contained' }),
  { name: 'LanguageShell' },
)
export const CardStyle = demoStyle.forSlots(CardSlots)(Recipes.Card({}), { name: 'LanguageCard' })
export const TableStyle = demoStyle.forSlots(TableSlots)(Recipes.Table({ density: 'compact' }), {
  name: 'LanguageTable',
})
export const InputStyle = demoStyle.forSlots(InputSlots)(Recipes.Input({}), {
  name: 'LanguageInput',
})
export const ViewerStyle = demoStyle.forSlots(SegmentedSlots)(Recipes.Segmented({}), {
  name: 'LanguageViewer',
})
/** Where a reader stands against SQLite: it agrees, it disagrees, or it did not answer. */
export const MarkStyle = demoStyle.forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { agree: 'success', disagree: 'error', refused: 'warning' },
  }),
  { name: 'LanguageMark' },
)

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    intro: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    eyebrow: Style.self({
      margin: '0',
      fontSize: t.size.sm,
      color: t.text.muted,
      fontFamily: t.font.mono,
    }),
    heading: Style.self({ margin: '0', fontSize: t.size['2xl'], color: t.text.overt }),
    lede: Style.self({ margin: '0', color: t.text.muted, maxInlineSize: '60ch' }),
    // Choice, inputs and viewer: side by side where there is room.
    controls: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))',
      gap: t.space.md,
      alignItems: 'start',
    }),
    control: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.overt }),
    // The shipped select's look, on a native select of the page's own.
    select: Recipes.Select({}).select,
    what: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    // A live region: what the page says when the choice changes.
    status: Style.self({
      margin: '0',
      padding: `${t.space.xs} ${t.space.sm}`,
      borderRadius: t.radius.md,
      background: t.surface.muted,
      fontWeight: t.weight.medium,
    }),
    // One card per reader, as many to a row as fit.
    readers: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 26rem), 1fr))',
      gap: t.space.md,
      alignItems: 'start',
    }),
    reader: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    code: Style.self({
      margin: '0',
      padding: t.space.sm,
      overflowX: 'auto',
      maxInlineSize: '100%',
      boxSizing: 'border-box',
      borderRadius: t.radius.md,
      background: t.surface.muted,
      fontFamily: t.font.mono,
      fontSize: t.size.sm,
      whiteSpace: 'pre',
    }),
    // A long statement wraps inside its box rather than scrolling a page.
    statement: Style.self({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }),
    link: Style.self({ color: t.accent.default, textDecoration: 'underline' }),
    note: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    mono: Style.self({ fontFamily: t.font.mono }),
    // What a reader says when it will not run the body, in the package's own words.
    refusal: Style.self({
      margin: '0',
      padding: t.space.sm,
      borderRadius: t.radius.md,
      border: `1px dashed ${t.outline.subtle}`,
      color: t.text.muted,
    }),
    // A table that is wider than its card scrolls in its card.
    frame: Style.self({ overflowX: 'auto', maxInlineSize: '100%' }),
  },
  { name: 'LanguagePage' },
)
