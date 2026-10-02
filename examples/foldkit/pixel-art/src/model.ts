import { Option, Schema } from 'effect'
import { HistoryModel } from 'foldkit-primitives/state'

import { Dialog, Listbox, RadioGroup } from '@foldkit/ui'

// CONSTANT

export const PaletteIndex = Schema.Literals([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
export type PaletteIndex = typeof PaletteIndex.Type

export const HexColor = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/)).pipe(
  Schema.brand('HexColor'),
)
export type HexColor = typeof HexColor.Type

export const Tool = Schema.Literals(['Brush', 'Fill', 'Eraser'])
export type Tool = typeof Tool.Type

export const MirrorMode = Schema.Literals(['None', 'Horizontal', 'Vertical', 'Both'])
export type MirrorMode = typeof MirrorMode.Type

export const Cell = Schema.Option(PaletteIndex)
export type Cell = typeof Cell.Type

const Row = Schema.Array(Cell)
export const Grid = Schema.Array(Row)
export type Grid = typeof Grid.Type

export const Position = Schema.Struct({ x: Schema.Number, y: Schema.Number })

/** A grid as the store keeps it: JSON, an empty cell as `{"_tag":"None"}`, as upstream saved it. */
export const GridJsonString = Schema.fromJsonString(Schema.toCodecJson(Grid))

// MODEL

export const Model = Schema.Struct({
  /** The grid on screen is `history.present`; `past` and `future` are the undo and redo steps. */
  history: HistoryModel(Grid),
  selectedColorIndex: PaletteIndex,
  gridSize: Schema.Number,
  tool: Tool,
  mirrorMode: MirrorMode,
  isDrawing: Schema.Boolean,
  maybeHoveredCell: Schema.Option(Position),
  errorDialog: Dialog.Model,
  maybeExportError: Schema.Option(Schema.String),
  paletteThemeIndex: Schema.Number,
  gridSizeConfirmDialog: Dialog.Model,
  maybePendingGridSize: Schema.Option(Schema.Number),
  themeListbox: Listbox.Model,
  toolRadioGroup: RadioGroup.Model,
  gridSizeRadioGroup: RadioGroup.Model,
  paletteRadioGroup: RadioGroup.Model,
})
export type Model = typeof Model.Type

export const paletteIndexFromValue = (value: string, fallback: PaletteIndex): PaletteIndex =>
  Option.getOrElse(Schema.decodeUnknownOption(PaletteIndex)(Number(value)), () => fallback)
