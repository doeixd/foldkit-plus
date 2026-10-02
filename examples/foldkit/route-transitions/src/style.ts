/**
 * The route-transitions example's appearance, as `foldkit-mixins` data.
 * `main.ts` draws the markup through the Slots declared here; everything it
 * looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the `Layout` pieces it composes by layer
 * order rather than by specificity.
 */
import { Capability, Event, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'

/** Upstream's Tailwind `sm` and `lg`: two columns of paintings, and the log beside the page. */
const sm = '(min-width: 40rem)'
const lg = '(min-width: 64rem)'

/**
 * Indigo, as upstream's nav bar and links are. The secondary hue is violet,
 * for the cold-load badge; success is shifted to emerald, for the entered one.
 * A white base, so the cards and the log stand out from the gray page.
 * `colorScheme: 'light'` keeps the page light in a dark browser, as upstream's is.
 */
const { t, L, slots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 277, c: 0.24, l: '51%' },
      secondaryHueShift: 16,
      feedback: { success: 163 },
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

const shadow = '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'

const heading = [
  U.text('4xl'),
  U.font('bold'),
  U.color('text.overt'),
  { margin: `0 0 ${t.space.lg}` },
]

const link = [
  U.color('accent.default'),
  { textDecoration: 'none' },
  Style.pseudo(':hover', { textDecoration: 'underline' }),
]

const card = [U.rounded('lg'), U.bg('surface.base'), { overflow: 'hidden', boxShadow: shadow }]

const muted = (size: Parameters<typeof U.text>[0]) => [
  U.m('0'),
  U.text(size),
  U.color('text.muted'),
]

const tone = (family: { readonly subtle: string; readonly ink: string }) => ({
  background: family.subtle,
  color: family.ink,
})

// PAGE

export const RoutePage = slots(
  {
    page: [U.bg('surface.muted'), U.color('text.default'), { minHeight: '100vh' }],
    header: {},
    nav: [U.p('md'), U.bg('accent.default'), U.color('accent.on-fill')],
    navList: [
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.md })),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
    ],
    navItem: {},
    // The link to the section the route is in carries `aria-current="page"`.
    navLink: [
      U.rounded('sm'),
      U.font('medium'),
      {
        display: 'inline-block',
        padding: `${t.space['2xs']} ${t.space.sm}`,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', {
        background: `color-mix(in oklch, ${t.accent.default} 80%, white)`,
      }),
      Style.pseudo('[aria-current="page"]', { background: t.accent.active }),
    ],
    main: [
      L.in('layouts', Layout.center({ max: '72rem', gutters: t.space.md })),
      U.grid,
      U.gap('xl'),
      U.py('xl'),
      { alignItems: 'start' },
      Style.media(lg, { gridTemplateColumns: 'minmax(0, 1fr) 360px' }),
    ],
    content: {},
    heading,
    sectionHeading: [heading, { marginBottom: t.space.xs }],
    errorHeading: [heading, U.color('error.ink')],
    lead: [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.md}` }],
    intro: [U.color('text.muted'), { margin: `0 0 ${t.space.lg}` }],
    link,
    tipsLabel: [U.color('text.muted'), { margin: `0 0 ${t.space.xs}` }],
    tips: [
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      U.m('0'),
      U.color('text.muted'),
      { paddingLeft: t.space.lg },
    ],
    tip: { listStyle: 'disc' },
    loading: [
      { border: `${t.border.thin} dashed ${t.outline.default}` },
      U.p('2xl'),
      U.rounded('lg'),
      U.textCenter,
      U.color('text.muted'),
    ],
    paintingGrid: [
      U.grid,
      U.gap('md'),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
      Style.media(sm, { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
    ],
    paintingItem: {},
    paintingCard: [
      card,
      U.block,
      {
        color: 'inherit',
        textDecoration: 'none',
        transition: `box-shadow ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', {
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      }),
    ],
    // The painting's colours arrive on the element as `--painting-gradient`.
    swatch: { height: '7rem', background: 'var(--painting-gradient)' },
    cardBody: U.p('md'),
    cardTitle: [U.m('0'), U.text('md'), U.font('semibold'), U.color('text.overt')],
    cardArtist: muted('sm'),
    backLink: [link, { display: 'inline-block', marginBottom: t.space.md }],
    article: card,
    banner: { height: '14rem', background: 'var(--painting-gradient)' },
    articleBody: U.p('lg'),
    articleTitle: [
      U.text('3xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space['2xs']}` },
    ],
    articleArtist: muted('md'),
    neighbors: [U.flex, U.items('center'), U.justify('between'), { marginTop: t.space.lg }],
    neighborLink: [link, U.font('medium')],
    neighborMissing: U.color('outline.default'),
    position: muted('sm'),
    draft: Style.slot({ capability: Capability.TextInput, events: [Event.Input] }, [
      { border: `${t.border.thin} solid ${t.outline.default}` },
      U.block,
      U.wFull,
      U.p('md'),
      U.rounded('lg'),
      U.color('text.default'),
      U.bg('surface.base'),
      { boxSizing: 'border-box', height: '10rem', font: 'inherit' },
      Style.pseudo(':focus', {
        outline: 'none',
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ]),
    saved: { marginTop: t.space.lg },
    nothingSaved: muted('sm'),
    savedCard: [
      { border: `${t.border.thin} solid ${t.outline.subtle}` },
      U.p('md'),
      U.rounded('lg'),
      U.bg('surface.base'),
    ],
    savedLabel: [
      U.text('sm'),
      U.font('medium'),
      U.color('text.muted'),
      U.uppercase,
      { margin: `0 0 ${t.space['2xs']}`, letterSpacing: '0.025em' },
    ],
    savedText: [U.m('0'), U.color('text.overt')],
    log: [
      U.p('md'),
      U.rounded('lg'),
      U.bg('surface.base'),
      { boxShadow: shadow },
      Style.media(lg, { position: 'sticky', top: t.space.xl }),
    ],
    logTitle: [
      U.text('lg'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space['2xs']}` },
    ],
    logIntro: [muted('sm'), { marginBottom: t.space.md }],
    logList: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
    ],
    logEntry: [
      { border: `${t.border.thin} solid ${t.outline.subtle}` },
      U.p('sm'),
      U.rounded('md'),
    ],
    logSummary: [muted('xs'), { marginBottom: t.space.xs }],
    badges: L.in('layouts', Layout.cluster({ gap: '0.375rem' })),
    badge: [
      U.rounded('full'),
      U.text('xs'),
      U.font('medium'),
      { padding: `${t.space['3xs']} ${t.space.xs}`, whiteSpace: 'nowrap' },
      Style.states(
        {
          coldLoad: tone(t.secondary),
          entered: tone(t.success),
          exited: tone(t.warning),
          stayed: tone(t.info),
          within: { background: t.surface.default, color: t.text.muted },
        },
        'data-tone',
      ),
    ],
  },
  { name: 'PageStyle' },
)
