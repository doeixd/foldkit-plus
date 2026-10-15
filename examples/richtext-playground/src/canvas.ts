/**
 * What the page learns from the browser around the editor, as Mounts: the block the pointer is
 * over, and image files chosen, pasted or dropped. The editor
 * owns its own subtree's events; these listen on elements the application draws around it.
 */
import { Effect, Queue, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { Message } from './app.js'
import { IMAGE_TYPES } from './vocabulary.js'

/** The largest file this page reads into the document, which keeps it in memory. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024

/** The widest an added image starts, in CSS pixels; its handle's menu makes it wider. */
const MAX_IMAGE_WIDTH = 640

type FileMessage = Extract<Message, { readonly _tag: 'ImageRead' | 'FileRead' | 'FileRefused' }>
type CanvasMessage = FileMessage | Extract<Message, { readonly _tag: 'HoveredBlock' }>
type Found = (message: FileMessage) => void

/**
 * Reads files into `data:` URLs, one Message each: an image this browser shows, at its own
 * width; anything else as what its type says, a video, a sound or an attachment. A file too large
 * to keep in the page is refused by name.
 */
const readFiles = (files: ReadonlyArray<File>, found: Found): void => {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      found(Message.FileRefused({ reason: `${file.name} is larger than 8 MB.` }))
      continue
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const src = reader.result
      if (typeof src !== 'string') return
      if (!IMAGE_TYPES.includes(file.type)) {
        found(Message.FileRead({ src, name: file.name, type: file.type, size: file.size }))
        return
      }
      // Shown at its own width, up to a column's, rather than stretched: a small image stays small.
      const picture = new Image()
      picture.addEventListener('load', () =>
        found(
          Message.ImageRead({
            src,
            alt: file.name.replace(/\.[^.]+$/, ''),
            width: Math.min(picture.naturalWidth, MAX_IMAGE_WIDTH),
          }),
        ),
      )
      picture.addEventListener('error', () =>
        found(
          Message.FileRefused({ reason: `${file.name} is not an image this browser can show.` }),
        ),
      )
      picture.src = src
    })
    reader.addEventListener('error', () =>
      found(Message.FileRefused({ reason: `${file.name} could not be read.` })),
    )
    reader.readAsDataURL(file)
  }
}

const filesIn = (transfer: DataTransfer | null): ReadonlyArray<File> =>
  Array.from(transfer?.files ?? [])

/**
 * Listens on the element around the editor. The pointer over a top-level block names it (the
 * last one stays named when the pointer leaves, so the handle beside it can be reached). A
 * paste or drop carrying files is taken here instead of by the browser, which would put the
 * file into the editable subtree itself.
 */
export const canvasEvents = Mount.defineStream('PlaygroundCanvas', {
  messages: [Message.HoveredBlock, Message.ImageRead, Message.FileRead, Message.FileRefused],
  execute: ({ element }) =>
    Stream.callback<CanvasMessage>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // A Mount's element is one the view drew; this one is a `div`.
          if (!(element instanceof HTMLElement)) return () => {}
          const found = (message: CanvasMessage) => Queue.offerUnsafe(queue, message)
          let last: string | undefined
          const onMove = (event: PointerEvent) => {
            // While a button is held the hovered block stays: a handle being dragged would
            // otherwise be swapped for the block under the pointer, and its drag ended with it.
            if (event.buttons !== 0) return
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
            found(Message.HoveredBlock({ node: RichText.NodeId.make(id) }))
          }
          const onPaste = (event: ClipboardEvent) => {
            const files = filesIn(event.clipboardData)
            if (files.length === 0) return
            event.preventDefault()
            event.stopPropagation()
            readFiles(files, found)
          }
          const onDragOver = (event: DragEvent) => {
            if (event.dataTransfer?.types.includes('Files') === true) event.preventDefault()
          }
          const onDrop = (event: DragEvent) => {
            const files = filesIn(event.dataTransfer)
            if (files.length === 0) return
            event.preventDefault()
            readFiles(files, found)
          }
          element.addEventListener('pointermove', onMove)
          // Capture: the editor's own paste handler would read the file's name as text first.
          element.addEventListener('paste', onPaste, true)
          element.addEventListener('dragover', onDragOver)
          element.addEventListener('drop', onDrop)
          return () => {
            element.removeEventListener('pointermove', onMove)
            element.removeEventListener('paste', onPaste, true)
            element.removeEventListener('dragover', onDragOver)
            element.removeEventListener('drop', onDrop)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

/** Reads the files a file field is given, then empties it so the same file can be chosen again. */
export const filePicker = Mount.defineStream('PlaygroundFilePicker', {
  messages: [Message.ImageRead, Message.FileRead, Message.FileRefused],
  execute: ({ element }) =>
    Stream.callback<FileMessage>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onChange = () => {
            if (!(element instanceof HTMLInputElement)) return
            readFiles(Array.from(element.files ?? []), message => Queue.offerUnsafe(queue, message))
            element.value = ''
          }
          element.addEventListener('change', onChange)
          return () => element.removeEventListener('change', onChange)
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
export const dismissOnOutside = Mount.defineStream('PlaygroundDismiss', {
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
          const view = element.ownerDocument
          view.addEventListener('pointerdown', onPress, true)
          view.addEventListener('keydown', onKey, true)
          return () => {
            view.removeEventListener('pointerdown', onPress, true)
            view.removeEventListener('keydown', onKey, true)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

/**
 * Ctrl+F (Cmd+F) anywhere on the page opens the find bar instead of the browser's, which cannot
 * see a match the editor has not drawn yet. Listening on the document, it works wherever the
 * focus is: in the text, on a toolbar, or on nothing at all.
 */
export const findShortcut = Mount.defineStream('PlaygroundFindShortcut', {
  messages: [Message.OpenedFind],
  execute: ({ element }) =>
    Stream.callback<Extract<Message, { readonly _tag: 'OpenedFind' }>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'f' || event.altKey || !(event.ctrlKey || event.metaKey)) return
            event.preventDefault()
            Queue.offerUnsafe(queue, Message.OpenedFind())
          }
          const page = element.ownerDocument
          page.addEventListener('keydown', onKey)
          return () => page.removeEventListener('keydown', onKey)
        }),
        release => Effect.sync(release),
      ),
    ),
})
