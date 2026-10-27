/**
 * The page's look: the demos' theme (`demoStyle`), the frame, the search box
 * and the notices from `foldkit-mixins-ui`, and the grid's frame over the
 * grid's own style; and the sandbox's page around the two devices, a card
 * for each with its status.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { GridSlots } from 'foldkit-mixins-data-grid'
import {
  AlertSlots,
  AppShellSlots,
  BadgeSlots,
  CardSlots,
  InputSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t, L } = demoStyle

export const stylesheet = demoStyle.stylesheet

export const ShellStyle = demoStyle.forSlots(AppShellSlots)(Recipes.AppShell({}), {
  name: 'ShellStyle',
})
export const SearchStyle = demoStyle.forSlots(InputSlots)(Recipes.Input({ size: 'sm' }), {
  name: 'SearchStyle',
})
/** What the server refused. */
export const RefusedStyle = demoStyle.forSlots(AlertSlots)(Recipes.Alert({ tone: 'error' }), {
  name: 'RefusedStyle',
})
/** What another device's edit replaced, or what an undo left alone. */
export const ReplacedStyle = demoStyle.forSlots(AlertSlots)(Recipes.Alert({ tone: 'warning' }), {
  name: 'ReplacedStyle',
})

/** The grid's frame, over the grid's own style: the room the page leaves it. */
export const GridFrame = demoStyle.forSlots(GridSlots)(
  {
    root: Style.self({
      height: 'calc(100dvh - 12rem)',
      minHeight: '20rem',
      border: `1px solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
      boxShadow: t.shadow.sm,
    }),
  },
  { name: 'GridFrame' },
)

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    toolbar: L.in('layouts', Layout.cluster({ gap: t.space.sm, justify: 'space-between' })),
    counts: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    // Always in the page, so a change is announced; drawn as a pill only when it says something.
    exchange: Style.compose(
      Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
      Style.nest('&:not(:empty)', {
        padding: `${t.space['3xs']} ${t.space.sm}`,
        borderRadius: t.radius.full,
        background: t.surface.muted,
      }),
      Style.states(
        { true: { background: t.warning.subtle, color: t.warning.ink } },
        'data-waiting',
      ),
    ),
    controls: L.in('layouts', Layout.cluster({ gap: t.space.md })),
    // The box's own recipe fills this; the controls give it up to 16rem.
    search: Style.self({ inlineSize: '16rem', maxInlineSize: '100%' }),
    offline: Style.self({
      display: 'inline-flex',
      alignItems: 'center',
      gap: t.space.xs,
      fontSize: t.size.sm,
      cursor: 'pointer',
      userSelect: 'none',
    }),
    box: Style.self({
      flexShrink: '0',
      inlineSize: '1rem',
      blockSize: '1rem',
      margin: '0',
      accentColor: t.accent.default,
    }),
    // A list of notices, not drawn at all while it has none, so it adds no gap.
    notices: Style.compose(
      Style.self({
        display: 'grid',
        gap: t.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
      Style.nest('&:empty', { display: 'none' }),
    ),
    // Who owns what, folded away until asked for.
    ownership: Style.self({
      padding: `${t.space.xs} ${t.space.sm}`,
      border: `1px solid ${t.outline.subtle}`,
      borderRadius: t.radius.md,
      fontSize: t.size.sm,
    }),
    summary: Style.self({ cursor: 'pointer', fontWeight: t.weight.medium }),
    owners: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
      gap: `${t.space.sm} ${t.space.lg}`,
      paddingBlockStart: t.space.xs,
    }),
    owner: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: 'inherit',
      fontWeight: t.weight.semibold,
    }),
    facts: Style.self({
      display: 'grid',
      gridTemplateColumns: 'max-content 1fr',
      gap: `${t.space['3xs']} ${t.space.sm}`,
      margin: '0',
    }),
    field: Style.self({ color: t.text.muted, fontFamily: t.font.mono }),
    value: Style.self({ margin: '0' }),
  },
  { name: 'Page' },
)

/** A device's card: its frame flush to the edges, under a header that keeps its padding. */
export const DeviceCardStyle = demoStyle.forSlots(CardSlots)(
  Recipes.Card.extend({
    base: {
      // The header meets the frame: no gap between the regions.
      root: { gap: '0' },
      header: {
        padding: `${t.space.xs} ${t.space.md}`,
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        background: t.surface.subtle,
      },
    },
  })({ padding: 'flush' }),
  { name: 'DeviceCardStyle' },
)
/** Where a device's edits stand: settled, or waiting on the device. */
export const DeviceBadgeStyle = demoStyle.forSlots(BadgeSlots)(
  Recipes.Badge({ attribute: 'data-tone', tones: { synced: 'success', waiting: 'warning' } }),
  { name: 'DeviceBadgeStyle' },
)

export const Sandbox = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    intro: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    eyebrow: Style.self({
      margin: '0',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.subtle,
    }),
    heading: Style.self({ margin: '0', fontSize: t.size['2xl'], color: t.text.overt }),
    lede: Style.self({ margin: '0', maxInlineSize: '44rem', color: t.text.muted }),
    devices: Style.self({
      display: 'grid',
      gap: t.space.md,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 36rem), 1fr))',
    }),
    frame: Style.self({
      display: 'block',
      inlineSize: '100%',
      blockSize: '80vh',
      minBlockSize: '34rem',
      border: '0',
    }),
  },
  { name: 'Sandbox' },
)
