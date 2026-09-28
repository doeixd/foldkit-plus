/**
 * The example's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped Button recipe and the
 * `Layout` pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** A colorless, near-black accent, so the recipe's solid button is black on white like upstream's. */
const palette = Theme.oklch({ accent: { h: 0, c: 0, l: '12%' } })

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  heading: container,
  count: container,
  controls: container,
  provenance: container,
  note: container,
  equivalence: container,
  equivalenceSelect: Slot.make({ capability: Capability.Focusable }),
  equivalenceOption: container,
  equivalencePre: container,
  equivalenceTextarea: Slot.make({ capability: Capability.Focusable }),
})

const smallPrint = Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted })

export const PageStyle = Style.forSlots(PageSlots)(
  {
    // Upstream's `min-h-screen flex flex-col items-center justify-center gap-6 p-6`.
    page: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        boxSizing: 'border-box',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.lg,
      }),
    ),
    heading: Style.self({
      margin: '0',
      fontSize: t.size['2xl'],
      fontWeight: t.weight.semibold,
      color: t.text.default,
    }),
    count: Style.self({
      margin: '0',
      fontSize: '3.75rem',
      fontWeight: t.weight.bold,
      lineHeight: '1',
      color: t.text.default,
    }),
    controls: L.in('layouts', Layout.cluster({ gap: t.space.md, justify: 'center' })),
    provenance: smallPrint,
    note: Style.compose(smallPrint, Style.self({ maxWidth: '28rem', textAlign: 'center' })),
    // Upstream's `hidden`: drawn for the parse check, never shown.
    equivalence: Style.self({ display: 'none' }),
  },
  { name: 'PageStyle', layer: app },
)

// BUTTON

/**
 * The shipped Button recipe, squared off and lightened on hover like
 * upstream's `hover:bg-gray-700`; the recipe's own hover darkens the fill.
 */
const CounterButton = Recipes.Button.extend({
  base: {
    button: Style.compose(
      Style.self({ borderRadius: '0' }),
      Style.pseudo(':hover:not(:disabled)', { background: t.text.subtle }),
    ),
  },
})

export const ButtonStyle = Style.forSlots(ButtonSlots)(CounterButton(), {
  name: 'ButtonStyle',
  layer: app,
})

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The server writes it into each page's head, with the
 * classes that page draws. `colorScheme: 'light'` keeps the page white in a
 * dark browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)
