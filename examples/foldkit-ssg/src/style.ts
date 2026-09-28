/**
 * The example's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the `Layout` pieces by layer order rather
 * than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** A colorless, near-black accent, so the button is black on white like upstream's. */
const palette = Theme.oklch({ accent: { h: 0, c: 0, l: '12%' } })

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  nav: container,
  navLink: container,
  section: container,
  heading: container,
  text: container,
  button: Slot.make({ capability: Capability.Focusable }),
})

const stack = L.in('layouts', Layout.stack({ gap: t.space.md }))

export const PageStyle = Style.forSlots(PageSlots)(
  {
    // Upstream's `mx-auto grid min-h-screen max-w-3xl content-center gap-10 p-8`.
    page: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      Style.self({
        boxSizing: 'border-box',
        maxWidth: '48rem',
        minHeight: '100vh',
        marginInline: 'auto',
        justifyContent: 'center',
        padding: t.space.xl,
      }),
    ),
    nav: L.in('layouts', Layout.cluster({ gap: t.space.md })),
    navLink: Style.self({ color: 'inherit', textDecoration: 'underline' }),
    section: stack,
    heading: Style.self({
      margin: '0',
      fontSize: t.size['4xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    text: Style.self({ margin: '0' }),
    button: Style.compose(
      Style.self({
        width: 'fit-content',
        padding: `${t.space.xs} ${t.space.md}`,
        border: '0',
        font: 'inherit',
        color: t.accent['on-fill'],
        background: t.accent.default,
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { background: t.accent.hover }),
    ),
  },
  { name: 'PageStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. `colorScheme: 'light'` keeps the page white in a dark
 * browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)

/**
 * Marks the `<style>` that carries `stylesheet`, so a page the build rendered
 * with it in the head is not given a second copy by `entry.ts`.
 */
export const STYLESHEET_ATTRIBUTE = 'data-ssg-stylesheet'
