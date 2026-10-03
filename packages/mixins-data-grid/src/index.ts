/**
 * `foldkit-mixins-data-grid` — a `foldkit-data-grid` grid drawn through slots.
 *
 * `foldkit-data-grid` holds the grid's state and geometry and draws nothing.
 * This package draws the grid as a WAI-ARIA `grid`: only the rows and columns
 * the viewport shows, every cell's logical row and column in ARIA, one tab
 * stop, and the keyboard moving focus. Every element is a Slot, so an
 * application styles it the way it does any other SlotView; the geometry the
 * virtual window depends on is protected from attachments.
 */
export { GridSlots } from './slots.js'
export { GridStyle } from './style.js'
export { DataGridView, type GridInput, type GridWords } from './view.js'
