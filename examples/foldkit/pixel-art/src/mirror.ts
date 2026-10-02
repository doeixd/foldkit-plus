import { Option } from 'effect'
import { Mirror } from 'foldkit-mirror'
import { History } from 'foldkit-primitives/state'
import { Surface } from 'foldkit-surface'

import { Dialog, Listbox, RadioGroup } from '@foldkit/ui'

import {
  DEFAULT_COLOR_INDEX,
  DEFAULT_GRID_SIZE,
  DEFAULT_PALETTE_THEME_INDEX,
  STORAGE_KEY,
} from './constant.js'
import { createEmptyGrid } from './grid.js'
import { Message } from './message.js'
import { GridJsonString, Model } from './model.js'
import {
  GRID_SIZE_RADIO_GROUP_ID,
  PALETTE_RADIO_GROUP_ID,
  TOOL_RADIO_GROUP_ID,
} from './view/toolbar.js'

// MIRROR

/** The Model before the store is read. Also the mirror's defaults: an untouched canvas stores nothing. */
export const initialModel: Model = {
  history: History.start(createEmptyGrid(DEFAULT_GRID_SIZE)),
  selectedColorIndex: DEFAULT_COLOR_INDEX,
  gridSize: DEFAULT_GRID_SIZE,
  tool: 'Brush',
  mirrorMode: 'None',
  isDrawing: false,
  maybeHoveredCell: Option.none(),
  errorDialog: Dialog.init({ id: 'export-error-dialog' }),
  maybeExportError: Option.none(),
  paletteThemeIndex: DEFAULT_PALETTE_THEME_INDEX,
  gridSizeConfirmDialog: Dialog.init({ id: 'grid-size-confirm-dialog' }),
  maybePendingGridSize: Option.none(),
  themeListbox: Listbox.init({ id: 'theme-picker' }),
  toolRadioGroup: RadioGroup.init({ id: TOOL_RADIO_GROUP_ID }),
  gridSizeRadioGroup: RadioGroup.init({ id: GRID_SIZE_RADIO_GROUP_ID }),
  paletteRadioGroup: RadioGroup.init({ id: PALETTE_RADIO_GROUP_ID }),
}

const App = Surface.application({ Model, Message })

/**
 * The canvas, remembered in localStorage. The Model owns it: `update` changes
 * it, and the mirror's Subscription writes the store after each change, where
 * upstream returned a `SaveCanvas` Command from every branch that changed it.
 * The store is read once, into Flags, before `init`.
 *
 * The grid size is not stored: it is the grid's, so a stored grid can never
 * disagree with it. `init` reads it back from the grid.
 */
export const CanvasMirror = Mirror.kv(App, {
  key: STORAGE_KEY,
  initial: initialModel,
  fields: [App.model.history.present, App.model.paletteThemeIndex, App.model.selectedColorIndex],
  // `Schema.Option` has no JSON form of its own; upstream's `toCodecJson` gives it one.
  keys: { present: { key: 'grid', codec: GridJsonString } },
  // Upstream wrote at once, so a reload right after a click keeps it. A
  // stroke is written as it paints, where upstream wrote once on release.
  throttle: 0,
})
