import { FluidHover, fluidHovered } from 'foldkit-primitives/dom'
import type { TableFluid } from '../table.js'

/** The name of the rows' highlight: its place is `--fk-table-hover-x`, `-y`, `-w`, `-h`. */
export const TABLE_HOVER = 'table-hover'

const hover = fluidHovered(TABLE_HOVER)

// The detail and empty rows are not rows a reader picks out.
const dataRow = 'tbody > tr:not([data-detail], [data-empty])'

/**
 * One highlight that follows the pointer to the nearest body row, in place of
 * a hover on each. Pass it as `Table.view`'s `fluid`: a table given none draws
 * no highlight and ships none of this.
 */
export const fluid: TableFluid = {
  // Where the highlight rests until FluidHover first writes, so a page drawn
  // without it reads defined values; the same each render, so none undoes a write.
  resting: {
    [hover.x]: '0px',
    [hover.y]: '0px',
    [hover.w]: '0px',
    [hover.h]: '0px',
    [hover.shown]: '0',
    [hover.moving]: '0',
  },
  mount: () => FluidHover({ name: TABLE_HOVER, item: dataRow, axis: 'y', gapClick: false }),
}
