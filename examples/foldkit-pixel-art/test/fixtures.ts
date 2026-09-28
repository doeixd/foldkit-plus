import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { History } from 'foldkit-primitives/state'

import { Dialog, RadioGroup } from '@foldkit/ui'

import { createEmptyGrid, setPixel } from '../src/grid.js'
import type { Grid, Model } from '../src/model.js'
import { initialModel } from '../src/mirror.js'

/** A 4 by 4 canvas, the size upstream's tests draw. */
export const emptyModel: Model = modifyFields(initialModel, {
  history: () => History.start(createEmptyGrid(4)),
  gridSize: () => 4,
})

/** `emptyModel` showing `grid`, with nothing to undo or redo. */
export const showing = (grid: Grid): Model =>
  modifyFields(emptyModel, { history: () => History.start(grid) })

/** Cell (1, 1) in color 3 and cell (2, 3) in color 9. */
export const paintedGrid: Grid = setPixel(setPixel(createEmptyGrid(4), 1, 1, 3), 2, 3, 9)

/** What a radio group hands its `toView`, without the attributes only a runtime makes. */
export const radioRender = <Value extends string>(
  values: ReadonlyArray<Value>,
  selected: Value,
): RadioGroup.RenderInfo<Value> => ({
  group: [],
  options: values.map((value, index) => ({
    value,
    index,
    isSelected: value === selected,
    isActive: false,
    isDisabled: false,
    isReadOnly: false,
    option: [],
    label: [],
    description: [],
  })),
  selectedValue: Option.some(selected),
  hiddenInput: [],
})

/** What an open Dialog hands its `toView`, without the attributes only a runtime makes. */
export const openDialogRender: Dialog.RenderInfo = {
  dialog: [],
  backdrop: [],
  panel: [],
  title: [],
  description: [],
  initialFocus: [],
  closeButton: [],
  isVisible: true,
}
