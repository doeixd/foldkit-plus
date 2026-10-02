/**
 * The page's appearance, as `foldkit-mixins` data. `main.ts` draws the markup
 * through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout` pieces
 * by layer order rather than by specificity.
 */
import { Event, Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * Tailwind's blue-500 as the accent, so the button and the numbers are
 * upstream's blue, over neutral surfaces so the card is a plain near-white.
 * `colorScheme: 'light'` keeps the page light in a dark browser, as upstream's is.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' }, surfaceSaturation: 0 }),
  colorScheme: 'light',
})

export { stylesheet }

/** The accent at `percent` over the base surface: upstream's blue-50 to blue-300. */
const wash = (percent: number): string =>
  `color-mix(in oklch, ${t.surface.base} ${percent}%, ${t.accent.default})`

/**
 * A column that centers its children, like upstream's `flex-col items-center`.
 * A stack's children are full width unless they compose `intrinsic`, which
 * then keeps its own width, centered.
 */
const centered = (gap: string): StyleValue =>
  Style.compose(
    L.in('layouts', Layout.stack({ gap, align: 'center' })),
    Style.vars({ '--fk-l-intrinsic-align': 'center' }),
  )

const intrinsic: StyleValue = L.in('layouts', Layout.intrinsic)

// PAGE

export const WeatherPage = slots(
  {
    page: [
      centered(t.space.lg),
      U.p('lg'),
      U.items('center'),
      U.justify('center'),
      {
        boxSizing: 'border-box',
        minHeight: '100vh',
        background: `linear-gradient(to bottom right, ${wash(85)}, ${wash(55)})`,
      },
    ],
    title: [
      intrinsic,
      U.text('4xl'),
      U.font('bold'),
      {
        // The stack sets its children's block margins to 0; this is upstream's `mb-8`.
        marginBlockEnd: t.space.xl,
        // Upstream's blue-900: the accent, darker.
        color: `oklch(from ${t.accent.default} 0.38 calc(c * 0.7) h)`,
      },
    ],
    // Upstream's `w-full max-w-md`; the stack already makes its children full width.
    form: Style.slot({ events: [Event.Submit] }, [centered(t.space.md), { maxWidth: '28rem' }]),
    loading: [intrinsic, U.textCenter, U.font('semibold'), U.color('accent.default')],
    error: [
      intrinsic,
      U.p('md'),
      U.rounded('lg'),
      U.bg('error.subtle'),
      U.color('error.ink'),
      { boxSizing: 'border-box', border: `1px solid ${t.error.outline}` },
    ],
    result: { maxWidth: '28rem' },
    card: [
      U.p('xl'),
      U.rounded('xl'),
      U.bg('surface.base'),
      { boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)' },
    ],
    zipCode: [
      U.textCenter,
      U.text('2xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space.sm}` },
    ],
    location: [U.textCenter, U.color('text.muted'), { margin: `0 0 ${t.space.lg}` }],
    current: [U.textCenter, { marginBlockEnd: t.space.lg }],
    temperature: [
      U.font('bold'),
      U.color('accent.default'),
      { fontSize: '3.75rem', lineHeight: '1' },
    ],
    description: [U.text('xl'), U.color('text.muted'), { marginBlockStart: t.space.xs }],
    details: [
      U.grid,
      U.gap('md'),
      U.textCenter,
      { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
    ],
    detail: [U.p('md'), U.rounded('lg'), { background: wash(94) }],
    detailLabel: [U.text('sm'), U.color('text.muted')],
    detailValue: [U.text('lg'), U.font('semibold')],
  },
  { name: 'WeatherStyle' },
)

// ZIP CODE INPUT

/** The shipped text field, with upstream's thick blue border. */
const ZipCodeInput = Recipes.Input.extend({
  base: {
    input: [
      U.rounded('lg'),
      { boxSizing: 'border-box', border: `${t.border.thick} solid ${wash(55)}`, outline: 'none' },
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: wash(40) }),
      Style.pseudo(':focus', { borderColor: t.accent.default }),
    ],
  },
})

export const ZipCodeInputStyle = forSlots(InputSlots)(ZipCodeInput({ size: 'md' }), {
  name: 'ZipCodeInputStyle',
})

// SUBMIT BUTTON

/** The solid accent button, as wide as its label and rounded like upstream's. */
const SubmitButton = Recipes.Button.extend({
  base: { button: [intrinsic, U.px('lg'), U.rounded('lg')] },
})

export const SubmitButtonStyle = forSlots(ButtonSlots)(SubmitButton(), {
  name: 'SubmitButtonStyle',
})
