/**
 * The example's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped Button recipe and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Style, type Piece } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * A colorless, near-black accent, so the recipe's solid button is black on
 * white like upstream's. The server writes `stylesheet` into each page's head,
 * with the classes that page draws. `colorScheme: 'light'` keeps the page
 * white in a dark browser, as upstream's is.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 0, c: 0, l: '12%' } }),
  colorScheme: 'light',
})

export { stylesheet }

// PAGE

const smallPrint: Piece = [U.m('0'), U.text('sm'), U.color('text.muted')]

export const PageStyle = slots(
  {
    // Upstream's `min-h-screen flex flex-col items-center justify-center gap-6 p-6`.
    page: [
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      U.items('center'),
      U.justify('center'),
      U.p('lg'),
      { boxSizing: 'border-box', minHeight: '100vh' },
    ],
    heading: [U.m('0'), U.text('2xl'), U.font('semibold'), U.color('text.default')],
    count: [
      U.m('0'),
      U.font('bold'),
      U.color('text.default'),
      { fontSize: '3.75rem', lineHeight: '1' },
    ],
    controls: L.in('layouts', Layout.cluster({ gap: t.space.md, justify: 'center' })),
    provenance: smallPrint,
    note: [smallPrint, U.textCenter, { maxWidth: '28rem' }],
    // Upstream's `hidden`: drawn for the parse check, never shown.
    equivalence: U.hidden,
    equivalenceSelect: Style.slot({ capability: Capability.Focusable }),
    equivalenceOption: [],
    equivalencePre: [],
    equivalenceTextarea: Style.slot({ capability: Capability.Focusable }),
  },
  { name: 'PageStyle' },
)

// BUTTON

/**
 * The shipped Button recipe, squared off and lightened on hover like
 * upstream's `hover:bg-gray-700`; the recipe's own hover darkens the fill.
 */
const CounterButton = Recipes.Button.extend({
  base: {
    button: [
      { borderRadius: '0' },
      Style.pseudo(':hover:not(:disabled)', { background: t.text.subtle }),
    ],
  },
})

export const ButtonStyle = forSlots(ButtonSlots)(CounterButton(), { name: 'ButtonStyle' })
