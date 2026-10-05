/**
 * The site's appearance, as `foldkit-mixins` data: `main.ts` draws through
 * these Slots, and everything it looks like lives here. A quiet page: grey
 * surfaces, one column, hairlines between the demos, and the accent kept for
 * the way into each.
 */
import { Capability, Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'

const { t, L, slots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 270, c: 0.17, l: '52%' }, surfaceSaturation: 0.004 }),
})

export { stylesheet }

const focus = Style.pseudo(':focus-visible', {
  outline: `2px solid ${t.accent.default}`,
  outlineOffset: '2px',
  borderRadius: '2px',
})

/** Words that are a link only on a closer look: the text's colour, the accent under the pointer. */
const quiet = (color: string, ...more: ReadonlyArray<StyleValue>) =>
  Style.slot({ capability: Capability.Focusable }, [
    ...more,
    { color, textDecoration: 'none' },
    Style.pseudo(':hover', { color: t.accent.default }),
    focus,
  ])

export const SiteStyle = slots(
  {
    page: [
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      U.mx('auto'),
      {
        boxSizing: 'border-box',
        maxWidth: '46rem',
        padding: `clamp(2.5rem, 8vw, 5rem) ${t.space.lg} ${t.space['2xl']}`,
      },
    ],
    header: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    eyebrow: [U.m('0'), U.text('sm'), U.font('semibold'), U.color('text.muted')],
    heading: [
      U.m('0'),
      U.font('semibold'),
      U.color('text.overt'),
      { fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', letterSpacing: '-0.025em' },
    ],
    lede: [U.m('0'), U.color('text.muted'), { maxWidth: '36rem' }],
    rows: [U.m('0'), U.p('0'), { listStyle: 'none' }],
    // Each demo a row under a hairline; on a phone the way in goes below.
    row: [
      {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'start',
        gap: `${t.space.sm} ${t.space.xl}`,
        paddingBlock: t.space.lg,
        borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
      },
      Style.media('(max-width: 36rem)', { gridTemplateColumns: '1fr' }),
    ],
    about: L.in('layouts', Layout.stack({ gap: '0.375rem' })),
    rowTitle: [
      U.m('0'),
      U.font('semibold'),
      U.color('text.overt'),
      { fontSize: '1.0625rem', letterSpacing: '-0.01em' },
    ],
    titleLink: quiet('inherit'),
    proves: [U.m('0'), U.color('text.muted'), { maxWidth: '34rem' }],
    packages: [U.m('0'), U.color('text.muted'), { fontSize: '0.8125rem' }],
    package: quiet(t.text.muted),
    actions: [
      U.m('0'),
      { display: 'flex', alignItems: 'center', gap: t.space.md, paddingBlockStart: '0.125rem' },
    ],
    open: Style.slot({ capability: Capability.Focusable }, [
      U.text('sm'),
      U.font('medium'),
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      {
        padding: `0.375rem ${t.space.md}`,
        borderRadius: '999px',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      focus,
    ]),
    source: quiet(t.text.muted, U.text('sm'), U.font('medium')),
    link: quiet(t.text.default),
    footer: [
      U.m('0'),
      U.text('sm'),
      U.color('text.muted'),
      {
        paddingBlockStart: t.space.lg,
        borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
  },
  { name: 'SiteStyle' },
)
