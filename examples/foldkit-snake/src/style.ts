/**
 * The game's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the `Layout` pieces by layer order
 * rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'

import type { Cell } from './main.js'

const L = Layers.standard
const app = L.layer('app')

// THEME

/**
 * A gray palette read in its dark scheme, for the page's text, and the board's
 * own colors: the Tailwind shades upstream names (`green-700` head,
 * `green-500` body, `red-500` apple, `gray-800` cells, `gray-600` edge) on
 * a black page.
 */
const palette = Theme.compose(
  Theme.oklch({ accent: { h: 0, c: 0, l: '50%' }, surfaceSaturation: 0 }),
  Theme.define({
    game: {
      page: 'oklch(0% 0 0)',
      head: 'oklch(52.7% 0.154 150.069)',
      body: 'oklch(72.3% 0.219 149.579)',
      apple: 'oklch(63.7% 0.237 25.331)',
      empty: 'oklch(27.8% 0.033 256.848)',
      edge: 'oklch(44.6% 0.03 256.802)',
    },
  }),
)

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

// PAGE

export const SnakeSlots = Slots.define({
  page: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  scores: Slot.make({ capability: Capability.Container }),
  score: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  instructions: Slot.make({ capability: Capability.Container }),
  instruction: Slot.make({ capability: Capability.Container }),
})

export const SnakeStyle = Style.forSlots(SnakeSlots)(
  {
    page: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({
        boxSizing: 'border-box',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.xl,
        background: t.game.page,
        color: t.text.overt,
      }),
    ),
    title: Style.self({
      margin: '0',
      fontSize: t.size['4xl'],
      fontWeight: t.weight.bold,
    }),
    scores: L.in('layouts', Layout.cluster({ gap: t.space.xl, justify: 'center' })),
    score: Style.self({ margin: '0', fontSize: t.size.xl }),
    status: Style.self({ margin: '0', fontSize: t.size.lg }),
    instructions: Style.self({
      textAlign: 'center',
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    instruction: Style.self({ margin: '0' }),
  },
  { name: 'SnakeStyle', layer: app },
)

// BOARD

export const BoardSlots = Slots.define({
  board: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Container }),
})

/** Upstream's `w-6 h-6`. */
const CELL_SIZE = '1.5rem'

const cellColors = {
  Empty: { background: t.game.empty },
  Head: { background: t.game.head },
  Body: { background: t.game.body },
  Apple: { background: t.game.apple },
} satisfies Record<Cell, { readonly background: string }>

export const BoardStyle = Style.forSlots(BoardSlots)(
  {
    board: Style.self({ border: `2px solid ${t.game.edge}` }),
    row: Style.self({ display: 'flex' }),
    cell: Style.compose(
      Style.self({ width: CELL_SIZE, height: CELL_SIZE }),
      Style.states(cellColors, 'data-cell'),
    ),
  },
  { name: 'BoardStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'dark'`
 * reads the palette's light text, since upstream's page is black in any
 * browser.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'dark' })),
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'dark' })),
  L.in('defaults', Defaults.body),
)
