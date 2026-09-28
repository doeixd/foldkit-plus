/**
 * The auth example's appearance, as `foldkit-mixins` data. The views draw the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'
import * as FieldValidation from 'foldkit/fieldValidation'

/**
 * Blue, as upstream's Tailwind `blue-500`, over near-neutral grey surfaces.
 * A white base, so the cards stand out from the page's `surface.muted`.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 260, c: 0.21, l: '62%' },
      surfaceSaturation: 0.003,
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

/** Upstream's `max-w-4xl mx-auto px-4`. */
const content = L.in('layouts', Layout.center({ max: '56rem' }))

const heading = [
  U.text('4xl'),
  U.font('bold'),
  U.color('text.default'),
  { margin: `0 0 ${t.space.lg}` },
]

const lead = [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.xl}` }]

const link = [
  U.color('accent.default'),
  { textDecoration: 'none' },
  Style.pseudo(':hover', { textDecoration: 'underline' }),
]

const card = [
  U.p('lg'),
  U.rounded('lg'),
  U.bg('surface.base'),
  { boxShadow: '0 4px 6px -1px rgb(0 0 0 / 10%), 0 2px 4px -2px rgb(0 0 0 / 10%)' },
]

const cardTitle = [
  U.text('xl'),
  U.font('semibold'),
  U.color('text.default'),
  { margin: `0 0 ${t.space.sm}` },
]

/** One column, three from `md` up, as upstream's `grid-cols-1 md:grid-cols-3`. */
const threeColumns = (gap: string) => [
  { display: 'grid', gridTemplateColumns: '1fr', gap },
  Style.media('(min-width: 48rem)', { gridTemplateColumns: 'repeat(3, 1fr)' }),
]

// PAGE

export const AuthPage = slots(
  {
    page: [U.bg('surface.muted'), U.color('text.default'), { minHeight: '100vh' }],
  },
  { name: 'PageStyle' },
)

// NOT FOUND

export const NotFoundPart = slots(
  {
    content: [content, U.textCenter],
    heading: [heading, U.color('error.ink')],
    message: [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.md}` }],
    link,
  },
  { name: 'NotFoundStyle' },
)

// LOGGED OUT

export const LoggedOutPart = slots({ content: U.py('xl') }, { name: 'LoggedOutStyle' })

// HOME

export const HomePart = slots(
  {
    content,
    hero: [U.textCenter, U.py('3xl')],
    title: [heading, { fontSize: '3rem' }],
    lead: [lead, U.text('xl')],
    signIn: [
      U.font('medium'),
      U.rounded('lg'),
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      {
        display: 'inline-block',
        padding: `${t.space.sm} ${t.space.xl}`,
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
    ],
    features: [threeColumns(t.space.xl), { marginTop: t.space['3xl'] }],
    feature: card,
    featureTitle: cardTitle,
    featureText: [U.color('text.muted'), { margin: '0' }],
  },
  { name: 'HomeStyle' },
)

// LOGIN

export const LoginPart = slots(
  {
    content: L.in('layouts', Layout.center({ max: '28rem' })),
    card: [
      U.p('xl'),
      U.rounded('xl'),
      U.bg('surface.base'),
      { boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)' },
    ],
    heading: [
      U.textCenter,
      U.text('3xl'),
      U.font('bold'),
      U.color('text.default'),
      { margin: `0 0 ${t.space.xl}` },
    ],
    hint: [
      U.p('sm'),
      U.rounded('lg'),
      U.bg('info.subtle'),
      { marginBottom: t.space.lg, border: `${t.border.thin} solid ${t.info.outline}` },
    ],
    hintText: [U.text('sm'), U.color('info.ink'), { margin: '0' }],
    form: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    field: {},
    fieldHeader: [
      L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
      { marginBottom: t.space['2xs'] },
    ],
    // Beside a label once its field is valid.
    validMark: [U.text('sm'), U.color('success.default')],
    footer: [U.textCenter, { marginTop: t.space.lg }],
    footerText: U.color('text.muted'),
    homeLink: link,
  },
  { name: 'LoginStyle' },
)

const isValidField = (field: FieldValidation.Field<string>): boolean =>
  FieldValidation.match(field, {
    onNotValidated: () => false,
    onValidating: () => false,
    onValid: () => true,
    onInvalid: () => false,
  })

/** The recipe draws an invalid field's border from `aria-invalid`; a valid one's is green. */
export const LoginInputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({
    base: {
      input: [
        U.py('xs'),
        U.px('md'),
        Style.whenInput(isValidField, Style.self({ borderColor: t.success.default })),
      ],
      label: [{ marginBlockEnd: '0' }, U.color('text.subtle')],
      description: U.color('error.ink'),
    },
  })(),
  { name: 'LoginInputStyle' },
)

/** The shipped solid button, full width, and grey while it cannot submit. */
export const SubmitButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [
        U.rounded('lg'),
        {
          width: '100%',
          paddingBlock: t.space.sm,
        },
        // `@foldkit/ui` marks a disabled button with `aria-disabled`, not `disabled`.
        Style.pseudo('[aria-disabled="true"]', {
          opacity: '1',
          background: t.surface.default,
          color: t.text.muted,
        }),
      ],
    },
  })(),
  { name: 'SubmitButtonStyle' },
)

// LOGGED IN

export const LoggedInPart = slots(
  {
    shell: { minHeight: '100vh' },
    nav: [U.p('md'), U.bg('accent.default'), U.color('accent.on-fill')],
    navInner: [
      L.in('layouts', Layout.center({ max: '56rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ justify: 'space-between' })),
    ],
    navList: [
      L.in('layouts', Layout.cluster({ gap: t.space.lg })),
      { margin: '0', padding: '0', listStyle: 'none' },
    ],
    navItem: {},
    // The link to the page shown carries `aria-current="page"`.
    navLink: [
      U.font('medium'),
      {
        display: 'inline-block',
        padding: `${t.space['2xs']} ${t.space.sm}`,
        borderRadius: t.radius.sm,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo('[aria-current="page"]', {
        background: `color-mix(in oklch, ${t.accent.active} 50%, transparent)`,
      }),
    ],
    signedInAs: U.text('sm'),
    main: U.py('xl'),
  },
  { name: 'LoggedInStyle' },
)

// DASHBOARD

export const DashboardPart = slots(
  {
    content,
    heading,
    lead,
    stats: threeColumns(t.space.lg),
    stat: card,
    statTitle: [
      U.text('sm'),
      U.font('medium'),
      U.color('text.muted'),
      U.uppercase,
      { margin: `0 0 ${t.space['2xs']}` },
    ],
    statValue: [U.text('3xl'), U.font('bold'), U.color('text.default'), { margin: '0' }],
  },
  { name: 'DashboardStyle' },
)

// SETTINGS

export const SettingsPart = slots(
  {
    content,
    heading,
    card: [card, Style.pseudo(':not(:last-child)', { marginBottom: t.space.lg })],
    cardTitle,
    rows: L.in('layouts', Layout.stack({ gap: t.space.md })),
    row: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.py('xs'),
      { borderBottom: `${t.border.thin} solid ${t.outline.subtle}` },
    ],
    rowLabel: [U.color('text.muted'), { margin: '0' }],
    rowValue: [U.font('medium'), U.color('text.default'), { margin: '0' }],
  },
  { name: 'SettingsStyle' },
)

/** Upstream's red Sign Out button: the shipped button in its danger tone. */
export const SignOutButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [{ padding: `${t.space.sm} ${t.space.lg}`, borderRadius: t.radius.lg }],
    },
  })({ tone: 'danger' }),
  { name: 'SignOutButtonStyle' },
)
