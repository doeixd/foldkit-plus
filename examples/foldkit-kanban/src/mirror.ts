import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Option } from 'effect'
import { Mirror } from 'foldkit-mirror'
import { Surface } from 'foldkit-surface'

import { DEFAULT_COLUMNS, STORAGE_KEY } from './constant.js'
import { Message } from './message.js'
import { Model } from './model.js'

// MIRROR

/** The board before anything is stored; also the mirror's default, so the sample board is not stored. */
export const initialModel: Model = {
  columns: DEFAULT_COLUMNS,
  dragAndDrop: DragAndDrop.init({ id: 'kanban' }),
  maybeNewCardColumnId: Option.none(),
  newCardTitle: '',
  announcement: '',
}

const App = Surface.application({ Model, Message })

/**
 * The columns, remembered in localStorage. The Model owns them: `update`
 * changes them, and the mirror's Subscription writes the store after each
 * change, where upstream returned a `SaveBoard` Command from each branch that
 * changed them. The store is read once, into Flags, before `init`.
 */
export const BoardMirror = Mirror.kv(App, {
  key: STORAGE_KEY,
  initial: initialModel,
  fields: [App.model.columns],
  // The columns change only on a drop or a new card, so nothing is gained by
  // waiting, and upstream wrote at once: a reload right after a drop keeps it.
  throttle: 0,
})
