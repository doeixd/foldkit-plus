/**
 * The game's appearance, as `foldkit-mixins` data. `main.ts` draws the markup
 * through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the `Layout` pieces by layer order rather
 * than by specificity.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'

import type { Cell } from './main.js'

/**
 * A gray palette read in its dark scheme, for the page's text, and the board's
 * own colors: the Tailwind shades upstream names (`green-700` head,
 * `green-500` body, `red-500` apple, `gray-800` cells, `gray-600` edge) on
 * a black page. `colorScheme: 'dark'` reads the palette's light text, since
 * upstream's page is black in any browser.
 */
const { t, L, slots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
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
  ),
  colorScheme: 'dark',
})

export { stylesheet }

// PAGE

export const SnakePage = slots(
  {
    page: [
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      U.p('xl'),
      U.items('center'),
      U.justify('center'),
      U.color('text.overt'),
      { boxSizing: 'border-box', minHeight: '100vh', background: t.game.page },
    ],
    title: [U.m('0'), U.text('4xl'), U.font('bold')],
    scores: L.in('layouts', Layout.cluster({ gap: t.space.xl, justify: 'center' })),
    score: [U.m('0'), U.text('xl')],
    status: [U.m('0'), U.text('lg')],
    instructions: [U.textCenter, U.text('sm'), U.color('text.muted')],
    instruction: U.m('0'),
  },
  { name: 'SnakeStyle' },
)

// BOARD

/** Upstream's `w-6 h-6`. */
const CELL_SIZE = '1.5rem'

const cellColors = {
  Empty: { background: t.game.empty },
  Head: { background: t.game.head },
  Body: { background: t.game.body },
  Apple: { background: t.game.apple },
} satisfies Record<Cell, { readonly background: string }>

export const BoardPart = slots(
  {
    board: { border: `2px solid ${t.game.edge}` },
    row: U.flex,
    cell: [{ width: CELL_SIZE, height: CELL_SIZE }, Style.states(cellColors, 'data-cell')],
  },
  { name: 'BoardStyle' },
)
