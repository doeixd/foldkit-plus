/**
 * The routing example's appearance, as `foldkit-mixins` data. `main.ts` and
 * `page/people.ts` draw the markup through the Slots declared here;
 * everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped Button recipe and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * Blue, as upstream's `blue-500` nav bar and links are, over a white base so
 * the cards and the search field stand out from the gray page.
 * `colorScheme: 'light'` keeps the page light in a dark browser, as upstream's is.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

const content = L.in('layouts', Layout.center({ max: '56rem' }))

const heading = [
  U.text('4xl'),
  U.font('bold'),
  U.color('text.overt'),
  { margin: `0 0 ${t.space.lg}` },
]

const lead = [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.md}` }]

const link = [
  U.color('accent.ink'),
  { textDecoration: 'none' },
  Style.pseudo(':hover', { textDecoration: 'underline' }),
]

const bordered = [{ border: `${t.border.thin} solid ${t.outline.subtle}` }, U.rounded('lg')]

const meta = [U.text('sm'), U.color('text.muted')]

// PAGE

export const RoutingPage = slots(
  {
    page: [U.bg('surface.muted'), U.color('text.default'), { minHeight: '100vh' }],
    header: { marginBottom: t.space.lg },
    nav: [U.p('md'), U.bg('accent.default'), U.color('accent.on-fill')],
    navList: [
      L.in('layouts', Layout.center({ max: '56rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.lg })),
      U.m('0'),
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
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo('[aria-current="page"]', {
        background: `color-mix(in oklch, ${t.accent.active} 50%, transparent)`,
      }),
    ],
    main: U.py('xl'),
    content,
    heading,
    errorHeading: [heading, U.color('error.ink')],
    lead,
    link,
    backLink: [link, { display: 'inline-block', marginBottom: t.space.md }],
    article: {},
    card: [bordered, U.p('lg'), U.bg('surface.subtle')],
    details: [U.grid, U.gap('md'), { gridTemplateColumns: '1fr 1fr' }],
    detail: {},
    detailLabel: [
      U.m('0'),
      U.text('sm'),
      U.font('medium'),
      U.color('text.muted'),
      U.uppercase,
      { letterSpacing: '0.025em' },
    ],
    detailValue: [U.text('lg'), U.color('text.overt'), { margin: `${t.space['2xs']} 0 0` }],
    entries: [bordered, U.m('0'), U.p('0'), U.bg('surface.base'), { listStyle: 'none' }],
    entry: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      { padding: `${t.space.sm} ${t.space.md}` },
      Style.pseudo(':not(:first-child)', {
        borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
      }),
    ],
    entryMeta: meta,
    breadcrumb: [
      L.in('layouts', Layout.cluster({ gap: t.space.xs })),
      U.text('sm'),
      { marginBottom: t.space.lg },
    ],
    crumb: L.in('layouts', Layout.cluster({ gap: t.space.xs })),
    crumbSeparator: U.color('text.subtle'),
    crumbCurrent: [U.font('medium'), U.color('text.overt')],
    fileName: [
      U.text('2xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space.xs}` },
    ],
    fileSize: [U.m('0'), U.color('text.muted')],
    missing: {},
  },
  { name: 'PageStyle' },
)

// PEOPLE

export const PeoplePart = slots(
  {
    content,
    heading,
    search: [U.block, { marginBottom: t.space.lg }],
    form: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'stretch' })),
    field: { flex: '1' },
    history: [
      L.in('layouts', Layout.cluster({ gap: t.space.xs })),
      { marginBottom: t.space.lg },
      meta,
    ],
    historyLabel: U.font('medium'),
    historyTerm: [
      U.rounded('sm'),
      U.bg('surface.overt'),
      U.color('text.overt'),
      { padding: `${t.space['2xs']} ${t.space.xs}`, fontFamily: t.font.mono },
    ],
    status: [lead, { marginBottom: t.space.lg }],
    people: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    person: [
      bordered,
      U.bg('surface.base'),
      { listStyle: 'none' },
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ],
    personLink: [U.block, U.p('md'), { color: 'inherit', textDecoration: 'none' }],
    personRow: [U.flex, U.items('center'), U.justify('between')],
    personName: [U.m('0'), U.text('xl'), U.font('semibold'), U.color('text.overt')],
    personRole: [U.m('0'), U.color('text.muted')],
  },
  { name: 'PeopleStyle' },
)

// SEARCH

/** The label is for screen readers only, as upstream's `sr-only` is. */
export const SearchInputStyle = forSlots(InputSlots)(
  {
    input: [
      bordered,
      U.wFull,
      U.color('text.default'),
      U.bg('surface.base'),
      {
        boxSizing: 'border-box',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
        borderColor: t.outline.default,
      },
      Style.pseudo(':focus', {
        outline: 'none',
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ],
    label: {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    },
  },
  { name: 'SearchInputStyle' },
)

export const SearchButtonStyle = forSlots(ButtonSlots)(Recipes.Button(), {
  name: 'SearchButtonStyle',
})
