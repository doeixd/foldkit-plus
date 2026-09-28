/**
 * The chat's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes by layer order rather
 * than by specificity.
 */
import { Capability, Event, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Tailwind's blue-500 as the accent, over near-gray surfaces, as upstream's `gray-*`. */
const palette = Theme.oklch({
  accent: { h: 260, c: 0.214, l: '62.3%' },
  surfaceSaturation: 0.003,
})

/** A white base, so the card is upstream's `bg-white`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

/** Upstream's purple-100 to blue-100 page gradient. */
const pageGradient =
  'linear-gradient(to bottom right, oklch(94.6% 0.033 307.2), oklch(93.2% 0.032 255.6))'

const container = Slot.make({ capability: Capability.Container })

const row = (gap: string): StyleValue => Style.self({ display: 'flex', alignItems: 'center', gap })

/** The bottom band of the card: upstream's `p-6 border-t border-gray-200`. */
const band: StyleValue = Style.self({
  padding: t.space.lg,
  borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
})

const pulse = Style.keyframes({ '50%': { opacity: '0.5' } })

// PAGE

export const ChatSlots = Slots.define({
  page: container,
  card: container,
  header: container,
  heading: container,
  title: container,
  subtitle: container,
  status: container,
  statusDot: container,
  statusLabel: container,
  messages: container,
  empty: container,
  emptyTitle: container,
  emptyHint: container,
  messageList: container,
  messageRow: container,
  bubble: container,
  bubbleText: container,
  bubbleTime: container,
  footer: container,
  connecting: container,
  composer: Slot.make({ capability: Capability.Container, events: [Event.Submit] }),
  composerRow: container,
  errorFooter: container,
  errorBox: container,
  errorTitle: container,
  errorText: container,
})

export const ChatStyle = Style.forSlots(ChatSlots)(
  {
    page: Style.self({
      boxSizing: 'border-box',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.space.lg,
      background: pageGradient,
    }),
    card: Style.self({
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '42rem',
      height: '600px',
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 25px 50px -12px rgb(0 0 0 / 25%)',
    }),
    header: Style.compose(
      row(t.space.md),
      Style.self({
        justifyContent: 'space-between',
        padding: t.space.lg,
        borderBlockEnd: `${t.border.thin} solid ${t.outline.subtle}`,
      }),
    ),
    title: Style.self({ fontSize: t.size['2xl'], fontWeight: t.weight.bold, color: t.text.overt }),
    subtitle: Style.self({
      marginBlockStart: t.space['2xs'],
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    status: row(t.space.xs),
    statusDot: Style.compose(
      pulse.style,
      Style.self({ width: '0.75rem', height: '0.75rem', borderRadius: t.radius.full }),
      Style.states({
        disconnected: { background: t.error.default },
        connecting: {
          background: t.warning.default,
          animation: `${pulse.name} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
        },
        connected: { background: t.success.default },
        error: { background: t.error.default },
      }),
    ),
    statusLabel: Style.compose(
      Style.self({ fontSize: t.size.sm, color: t.text.muted }),
      Style.states({ error: { color: t.error.ink } }),
    ),
    messages: Style.compose(
      Style.self({ flex: '1', padding: t.space.lg, overflowY: 'auto' }),
      Style.states({
        empty: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }),
    ),
    empty: Style.self({ textAlign: 'center', color: t.text.subtle }),
    emptyTitle: Style.self({ margin: `0 0 ${t.space.xs}`, fontSize: t.size.lg }),
    emptyHint: Style.self({ margin: '0', fontSize: t.size.sm }),
    messageList: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
    ),
    messageRow: Style.compose(
      Style.self({ display: 'flex' }),
      Style.states({
        sent: { justifyContent: 'flex-end' },
        received: { justifyContent: 'flex-start' },
      }),
    ),
    bubble: Style.compose(
      Style.self({
        maxWidth: '20rem',
        padding: `${t.space.xs} ${t.space.md}`,
        borderRadius: t.radius.lg,
      }),
      Style.states({
        sent: { background: t.accent.default, color: t.accent['on-fill'] },
        received: { background: t.surface.subtle, color: t.text.overt },
      }),
    ),
    bubbleText: Style.self({ margin: '0', overflowWrap: 'break-word' }),
    bubbleTime: Style.compose(
      Style.self({ margin: `${t.space['2xs']} 0 0`, fontSize: t.size.xs }),
      Style.states({
        sent: { color: `color-mix(in oklch, ${t.accent['on-fill']} 75%, transparent)` },
        received: { color: t.text.muted },
      }),
    ),
    footer: Style.compose(band, row(t.space.md), Style.self({ justifyContent: 'center' })),
    connecting: Style.self({ fontWeight: t.weight.semibold, color: t.text.muted }),
    composer: Style.compose(band, Style.self({ margin: '0' })),
    composerRow: Style.self({ display: 'flex', gap: t.space.sm }),
    errorFooter: band,
    errorBox: Style.self({
      marginBlockEnd: t.space.md,
      padding: t.space.md,
      border: `${t.border.thin} solid ${t.error.outline}`,
      borderRadius: t.radius.lg,
      background: t.error.subtle,
    }),
    errorTitle: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontWeight: t.weight.semibold,
      color: t.error.ink,
    }),
    errorText: Style.self({ margin: '0', fontSize: t.size.sm, color: t.error.ink }),
  },
  { name: 'ChatStyle', layer: app },
)

// MESSAGE INPUT

/** The recipe's field, sharing its row with Send: it takes the room the button leaves. */
export const MessageInputStyle = Style.forSlots(InputSlots)(
  Recipes.Input.extend({
    base: {
      input: Style.self({ flex: '1', minWidth: '0', borderRadius: t.radius.lg }),
    },
  })({ size: 'lg' }),
  { name: 'MessageInputStyle', layer: app },
)

// BUTTONS

/** The solid accent button, rounded like upstream's `rounded-lg`, at `padding`. */
const solid = (paddingInline: string, extra: StyleValue = Style.self({})) =>
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        Style.self({ paddingInline, borderRadius: t.radius.lg, fontWeight: t.weight.semibold }),
        extra,
      ),
    },
  })({ size: 'lg' })

export const ConnectButtonStyle = Style.forSlots(ButtonSlots)(solid(t.space.xl), {
  name: 'ConnectButtonStyle',
  layer: app,
})

export const SendButtonStyle = Style.forSlots(ButtonSlots)(solid(t.space.lg), {
  name: 'SendButtonStyle',
  layer: app,
})

export const RetryButtonStyle = Style.forSlots(ButtonSlots)(
  solid(t.space.lg, Style.self({ width: '100%' })),
  { name: 'RetryButtonStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. `colorScheme: 'light'` keeps the page light in a dark
 * browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)
