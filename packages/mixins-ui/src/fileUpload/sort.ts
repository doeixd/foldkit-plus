import { FocusRecovery } from 'foldkit-primitives/interaction'
import { FileUploadSlots } from '../fileUpload.js'

/**
 * Focus for what no widget Message causes: a keyed move (the browser drops the
 * focus of a button whose element moved, so a grip keeps it with `same`) and
 * `FileUpload.without`. Beside the widget's own focus Commands, which pick the
 * same targets: the next remove button, else the previous. In a module of its
 * own so a field with no sorting does not load FocusRecovery; pass it in
 * `mixins`.
 */
export const keepFocus = [
  FocusRecovery.behavior(FileUploadSlots)<unknown, never>({
    owner: 'list',
    parts: {
      grip: ['same'],
      remove: ['next', 'previous'],
      retry: [{ part: 'remove' }],
    },
  }).mixin,
]
