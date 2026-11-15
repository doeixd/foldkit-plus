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
  ButtonSlots,
  CardSlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
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
/** The device's go offline / go online button, beside its status. */
export const OfflineButtonStyle = demoStyle.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  { name: 'OfflineButtonStyle' },
)
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
      // The rows at the header's size: the columns are pixels wide, and at the
      // body's fluid size a UPC outgrew its cell in a wider font (DejaVu Sans).
      fontSize: t.size.sm,
    }),
  },
  { name: 'GridFrame' },
)

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    toolbar: L.in('layouts', Layout.cluster({ gap: t.space.sm, justify: 'space-between' })),
    counts: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    // Always in the page, so a change is announced.
    exchange: Style.compose(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space.xs,
        margin: '0',
        padding: `${t.space['3xs']} ${t.space.sm}`,
        borderRadius: t.radius.full,
        fontSize: t.size.sm,
        color: t.text.muted,
        background: t.surface.muted,
      }),
      Style.states(
        { true: { background: t.warning.subtle, color: t.warning.ink } },
        'data-waiting',
      ),
    ),
    dot: Style.compose(
      Style.self({
        flexShrink: '0',
        inlineSize: '0.5rem',
        blockSize: '0.5rem',
        borderRadius: t.radius.full,
        background: t.success.default,
      }),
      Style.states({ offline: { background: t.warning.default } }, 'data-link'),
    ),
    controls: L.in('layouts', Layout.cluster({ gap: t.space.md })),
    // The box's own recipe fills this; the controls give it up to 16rem.
    search: Style.self({ inlineSize: '16rem', maxInlineSize: '100%' }),
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
/** The phone's switch between the two devices. */
export const PaneSwitchStyle = demoStyle.forSlots(SegmentedSlots)(Recipes.Segmented({}), {
  name: 'PaneSwitchStyle',
})
/** Where a device's edits stand: settled, or waiting on the device. */
export const DeviceBadgeStyle = demoStyle.forSlots(BadgeSlots)(
  Recipes.Badge({ attribute: 'data-tone', tones: { synced: 'success', waiting: 'warning' } }),
  { name: 'DeviceBadgeStyle' },
)

export const Sandbox = demoStyle.slots(
  {
    // Room under the devices for the site's fixed "How to try this demo" pill, so scrolled to
    // the end nothing interactive sits under it (on a phone the guide adds its own room). The
    // pill still crosses a device while the page scrolls: a `position` option on `demoGuide`
    // is planned for the website pass.
    content: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.at('@media (min-width: 48.01rem)', Style.self({ paddingBlockEnd: '4.5rem' })),
    ),
    // The lede and the conflict steps side by side where there is room, so the devices start high.
    intro: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
      Style.at(
        '@media (min-width: 64rem)',
        Style.self({
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
          columnGap: t.space.xl,
          alignItems: 'start',
        }),
      ),
    ),
    eyebrow: Style.self({
      gridColumn: '1 / -1',
      margin: '0',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.subtle,
    }),
    heading: Style.self({
      margin: '0',
      fontSize: t.size['2xl'],
      color: t.text.overt,
      gridColumn: '1 / -1',
    }),
    lede: Style.self({ margin: '0', maxInlineSize: '44rem', color: t.text.muted }),
    steps: Style.self({
      margin: '0',
      paddingInlineStart: t.space.lg,
      maxInlineSize: '44rem',
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    // Only a phone, which shows one device at a time, needs the switch.
    switch: Style.compose(
      Style.self({ display: 'none' }),
      Style.media('(max-width: 63.99rem)', { display: 'block' }),
    ),
    devices: Style.compose(
      Style.self({
        display: 'grid',
        gap: t.space.md,
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        position: 'relative',
      }),
      // One column on a phone, and only the chosen device: the other stays mounted, hidden.
      Style.media('(max-width: 63.99rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
      Style.at(
        '@media (max-width: 63.99rem)',
        // Not display: none, which a frame draws no frames under: the hidden device keeps
        // its size, so its grid is measured and painted, and shows at once when chosen.
        Style.nest('& > [data-chosen="false"]', {
          position: 'absolute',
          insetInline: '0',
          visibility: 'hidden',
        }),
      ),
    ),
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
