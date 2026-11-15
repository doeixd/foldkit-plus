import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * What a drag carries, shown as an element that follows the pointer, as a Mount.
 * The view draws the element once while a drag is under way, with `popover="manual"`
 * and what it shows; the Mount puts it in the top layer, above every panel and
 * clear of an ancestor's `contain` or `transform`, and the top layer drops it when the
 * element goes (a drop, a cancel, an unmount).
 *
 * It moves nothing: `PointerDrag` writes the pointer's position on the document
 * root (`DRAGGING`, in `./pointer-drag`), so the element's rule reads `var(--fk-drag-x)` and the page is
 * not drawn again per pointer move. A browser without popovers leaves the element
 * where the page flow puts it.
 */
export const DragPreview = Mount.defineStream('DragPreview', {
  messages: [Schema.Never],
  args: {},
  // Nothing to release: the top layer drops an element that leaves the page.
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.sync(() => {
        const popover = element as HTMLElement
        if (typeof popover.showPopover === 'function' && popover.hasAttribute('popover')) {
          popover.showPopover()
        }
      }),
    ),
})
