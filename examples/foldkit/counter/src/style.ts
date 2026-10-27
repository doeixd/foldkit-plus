/**
 * The counter's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped Button recipe and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * The shipped theme (`AppStyle.make`'s default), not upstream's Tailwind palette.
 * `colorScheme: 'light'` keeps the page light in a dark browser, as upstream's is.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  colorScheme: 'light',
})

export { stylesheet }

// PAGE

export const CounterPage = slots(
  {
    root: [
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      U.p('lg'),
      { boxSizing: 'border-box', minHeight: '100vh', justifyContent: 'center' },
    ],
    count: [
      U.textCenter,
      U.font('bold'),
      U.color('text.default'),
      { fontSize: '3.75rem', lineHeight: '1' },
    ],
    controls: L.in('layouts', Layout.cluster({ gap: t.space.md, justify: 'center' })),
  },
  { name: 'CounterStyle' },
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
