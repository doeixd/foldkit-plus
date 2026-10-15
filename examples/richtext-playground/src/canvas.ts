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

/** The largest image this page reads into the document, which keeps it in memory. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** The widest an added image starts, in CSS pixels; its handle's menu makes it wider. */
const MAX_IMAGE_WIDTH = 640

type ImageMessage = Extract<Message, { readonly _tag: 'ImageRead' | 'ImageRefused' }>
type CanvasMessage = ImageMessage | Extract<Message, { readonly _tag: 'HoveredBlock' }>
type Found = (message: ImageMessage) => void

/** Reads image files into `data:` URLs, one Message each; anything else is refused by name. */
const readImages = (files: ReadonlyArray<File>, found: Found): void => {
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) {
      found(
        Message.ImageRefused({
          reason: `${file.name} is not a PNG, JPEG, GIF, WebP or AVIF image.`,
        }),
      )
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      found(Message.ImageRefused({ reason: `${file.name} is larger than 5 MB.` }))
      continue
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const src = reader.result
      if (typeof src !== 'string') return
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
          Message.ImageRefused({ reason: `${file.name} is not an image this browser can show.` }),
        ),
      )
      picture.src = src
    })
    reader.addEventListener('error', () =>
      found(Message.ImageRefused({ reason: `${file.name} could not be read.` })),
    )
    reader.readAsDataURL(file)
  }
}

const imagesIn = (transfer: DataTransfer | null): ReadonlyArray<File> =>
  Array.from(transfer?.files ?? [])

/**
 * Listens on the element around the editor. The pointer over a top-level block names it (the
 * last one stays named when the pointer leaves, so the handle beside it can be reached). A
 * paste or drop carrying files is taken here instead of by the browser, which would put the
 * file into the editable subtree itself.
 */
export const canvasEvents = Mount.defineStream('PlaygroundCanvas', {
  messages: [Message.HoveredBlock, Message.ImageRead, Message.ImageRefused],
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
            const files = imagesIn(event.clipboardData)
            if (files.length === 0) return
            event.preventDefault()
            event.stopPropagation()
            readImages(files, found)
          }
          const onDragOver = (event: DragEvent) => {
            if (event.dataTransfer?.types.includes('Files') === true) event.preventDefault()
          }
          const onDrop = (event: DragEvent) => {
            const files = imagesIn(event.dataTransfer)
            if (files.length === 0) return
            event.preventDefault()
            readImages(files, found)
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

/** Reads the images a file field is given, then empties it so the same file can be chosen again. */
export const imagePicker = Mount.defineStream('PlaygroundImagePicker', {
  messages: [Message.ImageRead, Message.ImageRefused],
  execute: ({ element }) =>
    Stream.callback<ImageMessage>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onChange = () => {
            if (!(element instanceof HTMLInputElement)) return
            readImages(Array.from(element.files ?? []), message =>
              Queue.offerUnsafe(queue, message),
            )
            element.value = ''
          }
          element.addEventListener('change', onChange)
          return () => element.removeEventListener('change', onChange)
        }),
        release => Effect.sync(release),
      ),
    ),
})
