/**
 * What the page learns from the browser around the editor, as Mounts: the block the pointer is
 * over, and a press outside an open menu. The editor owns its own subtree's events; these listen
 * on elements the application draws around it.
 */
import { Effect, Queue, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { Message } from './app.js'

/**
 * The pointer over a top-level block names it, and the last one stays named when the pointer
 * leaves, so the handle beside it can be reached.
 */
export const hoverTracking = Mount.defineStream('PagesHover', {
  messages: [Message.HoveredBlock],
  execute: ({ element }) =>
    Stream.callback<Extract<Message, { readonly _tag: 'HoveredBlock' }>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let last: string | undefined
          const onMove = (event: Event) => {
            // While a button is held the hovered block stays: a handle being dragged would
            // otherwise be swapped for the block under the pointer, and its drag ended with it.
            if (!(event instanceof PointerEvent) || event.buttons !== 0) return
            // The outermost block under the pointer: the one whose parent is the editable root.
            let block =
              event.target instanceof Element ? event.target.closest('[data-block]') : null
            while (
              block !== null &&
              block.parentElement?.getAttribute('contenteditable') !== 'true'
            ) {
              block = block.parentElement?.closest('[data-block]') ?? null
            }
            const id = block?.getAttribute('data-block')
            if (id === null || id === undefined || id === last) return
            last = id
            Queue.offerUnsafe(queue, Message.HoveredBlock({ node: RichText.NodeId.make(id) }))
          }
          element.addEventListener('pointermove', onMove)
          return () => element.removeEventListener('pointermove', onMove)
        }),
        release => Effect.sync(release),
      ),
    ),
})

/**
 * Closes the open menu on a press outside the element around it, or on Escape anywhere. Drawn
 * only while a menu is open, as an empty marker inside the menu's anchor (the anchor holds the
 * trigger too, so the trigger's own click is not outside), and so it listens only then.
 */
export const dismissOnOutside = Mount.defineStream('PagesDismiss', {
  messages: [Message.ClosedMenu],
  execute: ({ element }) =>
    Stream.callback<Extract<Message, { readonly _tag: 'ClosedMenu' }>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const region = element.parentElement ?? element
          const close = () => Queue.offerUnsafe(queue, Message.ClosedMenu())
          const onPress = (event: PointerEvent) => {
            if (!(event.target instanceof Node) || !region.contains(event.target)) close()
          }
          const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close()
          }
          const page = element.ownerDocument
          page.addEventListener('pointerdown', onPress, true)
          page.addEventListener('keydown', onKey, true)
          return () => {
            page.removeEventListener('pointerdown', onPress, true)
            page.removeEventListener('keydown', onKey, true)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})
