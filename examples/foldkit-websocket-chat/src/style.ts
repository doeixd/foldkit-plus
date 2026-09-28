/**
 * The chat's appearance, as `foldkit-mixins` data. `main.ts` draws the markup
 * through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes by layer order rather
 * than by specificity.
 */
import { Event, Style, type Piece } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U, type Space } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * Tailwind's blue-500 as the accent, over near-gray surfaces, as upstream's
 * `gray-*`, and a white base, so the card is upstream's `bg-white`.
 * `colorScheme: 'light'` keeps the page light in a dark browser, as upstream's is.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({ accent: { h: 260, c: 0.214, l: '62.3%' }, surfaceSaturation: 0.003 }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

/** Upstream's purple-100 to blue-100 page gradient. */
const pageGradient =
  'linear-gradient(to bottom right, oklch(94.6% 0.033 307.2), oklch(93.2% 0.032 255.6))'

const row = (gap: Space): Piece => [U.flex, U.items('center'), U.gap(gap)]

/** The bottom band of the card: upstream's `p-6 border-t border-gray-200`. */
const band: Piece = [U.p('lg'), { borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}` }]

const pulse = Style.keyframes({ '50%': { opacity: '0.5' } })

// PAGE

export const ChatPage = slots(
  {
    page: [
      U.column,
      U.items('center'),
      U.justify('center'),
      U.p('lg'),
      { boxSizing: 'border-box', minHeight: '100vh', background: pageGradient },
    ],
    card: [
      U.column,
      U.wFull,
      U.rounded('xl'),
      U.bg('surface.base'),
      { maxWidth: '42rem', height: '600px', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 25%)' },
    ],
    header: [
      row('md'),
      U.justify('between'),
      U.p('lg'),
      { borderBlockEnd: `${t.border.thin} solid ${t.outline.subtle}` },
    ],
    heading: [],
    title: [U.text('2xl'), U.font('bold'), U.color('text.overt')],
    subtitle: [U.text('sm'), U.color('text.muted'), { marginBlockStart: t.space['2xs'] }],
    status: row('xs'),
    statusDot: [
      pulse.style,
      U.rounded('full'),
      { width: '0.75rem', height: '0.75rem' },
      Style.states({
        disconnected: { background: t.error.default },
        connecting: {
          background: t.warning.default,
          animation: `${pulse.name} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
        },
        connected: { background: t.success.default },
        error: { background: t.error.default },
      }),
    ],
    statusLabel: [
      U.text('sm'),
      U.color('text.muted'),
      Style.states({ error: { color: t.error.ink } }),
    ],
    messages: [
      U.p('lg'),
      { flex: '1', overflowY: 'auto' },
      Style.states({
        empty: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }),
    ],
    empty: [U.textCenter, U.color('text.subtle')],
    emptyTitle: [U.text('lg'), { margin: `0 0 ${t.space.xs}` }],
    emptyHint: [U.m('0'), U.text('sm')],
    messageList: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
    ],
    messageRow: [
      U.flex,
      Style.states({
        sent: { justifyContent: 'flex-end' },
        received: { justifyContent: 'flex-start' },
      }),
    ],
    bubble: [
      U.rounded('lg'),
      { maxWidth: '20rem', padding: `${t.space.xs} ${t.space.md}` },
      Style.states({
        sent: { background: t.accent.default, color: t.accent['on-fill'] },
        received: { background: t.surface.subtle, color: t.text.overt },
      }),
    ],
    bubbleText: [U.m('0'), { overflowWrap: 'break-word' }],
    bubbleTime: [
      U.text('xs'),
      { margin: `${t.space['2xs']} 0 0` },
      Style.states({
        sent: { color: `color-mix(in oklch, ${t.accent['on-fill']} 75%, transparent)` },
        received: { color: t.text.muted },
      }),
    ],
    footer: [band, row('md'), U.justify('center')],
    connecting: [U.font('semibold'), U.color('text.muted')],
    composer: Style.slot({ events: [Event.Submit] }, [band, U.m('0')]),
    composerRow: [U.flex, U.gap('sm')],
    errorFooter: band,
    errorBox: [
      U.p('md'),
      U.rounded('lg'),
      U.bg('error.subtle'),
      { marginBlockEnd: t.space.md, border: `${t.border.thin} solid ${t.error.outline}` },
    ],
    errorTitle: [U.font('semibold'), U.color('error.ink'), { margin: `0 0 ${t.space['2xs']}` }],
    errorText: [U.m('0'), U.text('sm'), U.color('error.ink')],
  },
  { name: 'ChatStyle' },
)

// MESSAGE INPUT

/** The recipe's field, sharing its row with Send: it takes the room the button leaves. */
export const MessageInputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({
    base: { input: [U.rounded('lg'), { flex: '1', minWidth: '0' }] },
  })({ size: 'lg' }),
  { name: 'MessageInputStyle' },
)

// BUTTONS

/** The solid accent button, rounded like upstream's `rounded-lg`, at `padding`. */
const solid = (padding: Space, extra: Piece = []) =>
  Recipes.Button.extend({
    base: { button: [U.px(padding), U.rounded('lg'), U.font('semibold'), extra] },
  })({ size: 'lg' })

export const ConnectButtonStyle = forSlots(ButtonSlots)(solid('xl'), {
  name: 'ConnectButtonStyle',
})

export const SendButtonStyle = forSlots(ButtonSlots)(solid('lg'), { name: 'SendButtonStyle' })

export const RetryButtonStyle = forSlots(ButtonSlots)(solid('lg', U.wFull), {
  name: 'RetryButtonStyle',
})
