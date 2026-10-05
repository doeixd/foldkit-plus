/**
 * The site's appearance, as `foldkit-mixins` data: `main.ts` draws through
 * these Slots, and everything it looks like lives here.
 */
import { Capability, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'

const { t, L, slots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 270, c: 0.17, l: '52%' } }),
})

export { stylesheet }

const link = Style.slot({ capability: Capability.Focusable }, [
  U.color('accent.default'),
  { textDecoration: 'underline', textUnderlineOffset: '0.15em' },
  Style.pseudo(':hover', { color: t.accent.hover }),
])

export const SiteStyle = slots(
  {
    open: Style.slot({ capability: Capability.Focusable }, [
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      U.font('semibold'),
      {
        width: 'fit-content',
        padding: `${t.space.xs} ${t.space.md}`,
        borderRadius: t.radius.md,
        textDecoration: 'none',
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
    ]),
    page: [
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      U.mx('auto'),
      U.p('xl'),
      { boxSizing: 'border-box', maxWidth: '72rem' },
    ],
    header: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    eyebrow: [U.m('0'), U.text('sm'), U.font('semibold'), U.color('accent.default')],
    heading: [U.m('0'), U.text('4xl'), U.font('bold'), U.color('text.overt')],
    lede: [U.m('0'), U.color('text.muted'), { maxWidth: '44rem' }],
    cards: [
      L.in('layouts', Layout.autoGrid({ minItemSize: '20rem', gap: t.space.lg })),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
    ],
    card: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      U.p('lg'),
      U.bg('surface.base'),
      { border: `${t.border.thin} solid ${t.outline.subtle}`, borderRadius: t.radius.lg },
    ],
    cardTitle: [U.m('0'), U.text('xl'), U.font('semibold'), U.color('text.overt')],
    titleLink: Style.slot({ capability: Capability.Focusable }, [
      { color: 'inherit', textDecoration: 'none' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ]),
    proves: [U.m('0'), U.color('text.muted')],
    label: [
      U.m('0'),
      U.text('xs'),
      U.font('semibold'),
      U.color('text.muted'),
      { textTransform: 'uppercase', letterSpacing: '0.04em' },
    ],
    steps: [
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      U.m('0'),
      { paddingInlineStart: '1.25rem' },
    ],
    step: U.m('0'),
    meta: [U.m('0'), U.text('sm')],
    packages: [
      L.in('layouts', Layout.cluster({ gap: t.space.xs })),
      U.m('0'),
      U.p('0'),
      { listStyle: 'none' },
    ],
    package: U.text('sm'),
    link,
    footer: [U.m('0'), U.text('sm'), U.color('text.muted')],
  },
  { name: 'SiteStyle' },
)
