/**
 * The `<br>` an empty line holds. A browser can neither draw a caret in an empty text node nor
 * move one onto it with the arrow keys, so an empty line made with Enter could not be reached;
 * the `<br>` is a line the caret can stand on. It holds no text and no position, `mount` and
 * `renderEditable` both draw it, so server markup is still adopted, and an import drops it.
 */
import type * as RichText from 'foldkit-richtext'

export const FILLER_ATTRIBUTE = 'data-richtext-filler'

/** Whether a block's text is all empty runs: a line the caret has nothing to stand beside. */
export const needsFiller = (block: RichText.Block): boolean =>
  block.type !== 'Unknown' &&
  block.children.length > 0 &&
  block.children.every(run => run.text === '')
