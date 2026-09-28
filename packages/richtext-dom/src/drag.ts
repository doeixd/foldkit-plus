/**
 * Dragging a block by its handle (§148): the pointer picks a place beside any block the block may
 * move beside (`RichText.moveTargets`, so across containers where the vocabulary allows, §149), a
 * line outside the editable subtree shows it, and the drop sends `MovedBlock` there.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { Message } from './editor.js'
import { attachmentIn, vocabularyFor } from './host.js'

/** A block the dragged one may land beside: its place in the document and on the page. */
export interface Placed {
  readonly id: RichText.NodeId
  /** Its container, as a key its siblings share, and its index there. */
  readonly container: string
  readonly index: number
  readonly top: number
  readonly bottom: number
}

/**
 * Where a pointer at `y` drops block `moving`, itself one of `targets` (in document order): beside
 * the target whose edge is nearest, before one at its top and after one at its bottom. Of two
 * edges equally near, the later target's wins. Undefined when that is where the block already is.
 *
 * A container's edge and its first or last block's are one edge: the block's wins while the
 * pointer is inside that block, and the container's once it is past it, or the container's own
 * edge could never be reached.
 */
export const dropBeside = (
  targets: ReadonlyArray<Placed>,
  moving: RichText.NodeId,
  y: number,
): RichText.Beside | undefined => {
  const self = targets.find(target => target.id === moving)
  let nearest:
    | {
        readonly target: Placed
        readonly after: boolean
        readonly edge: number
        readonly distance: number
      }
    | undefined
  for (const target of targets) {
    for (const after of [false, true]) {
      const edge = after ? target.bottom : target.top
      const distance = Math.abs(y - edge)
      if (
        nearest === undefined ||
        distance < nearest.distance ||
        (distance === nearest.distance &&
          (edge !== nearest.edge || (y >= target.top && y <= target.bottom)))
      )
        nearest = { target, after, edge, distance }
    }
  }
  if (self === undefined || nearest === undefined) return undefined
  const { target, after } = nearest
  const stays =
    target.id === moving ||
    (target.container === self.container && target.index === self.index + (after ? -1 : 1))
  return stays ? undefined : after ? { after: target.id } : { before: target.id }
}

/** Each block's container key and index, from one walk of the document. */
const placesOf = (
  blocks: ReadonlyArray<RichText.Block>,
  container = '',
  into = new Map<RichText.NodeId, { readonly container: string; readonly index: number }>(),
) => {
  for (const [index, block] of blocks.entries()) {
    into.set(block.id, { container, index })
    if (block.type === 'Node' && block.blocks !== undefined) placesOf(block.blocks, block.id, into)
  }
  return into
}

interface Pointed extends Event {
  readonly clientY?: number
  readonly buttons?: number
  readonly pointerId?: number
  readonly button?: number
  readonly key?: string
}

/**
 * Lets `handle` drag block `node` of the editor in `hostId`: a press on it starts, the pointer
 * moving picks the place, release drops there through `dropped`, and Escape or a cancelled
 * pointer ends it without a drop. The page is listened to only while a press is under way, in
 * the capture phase, so a handler that stops a release does not hide it. The line is an element
 * of its own, `[data-richtext-drop]`, fixed at the edge the block would land on, for a
 * stylesheet to draw. The handle takes `touch-action: none` while attached, or a touch would
 * pan the page and cancel the drag.
 */
export const dragBlock = (
  handle: Element,
  hostId: string,
  node: RichText.NodeId,
  dropped: (to: RichText.Beside) => void,
): (() => void) => {
  const owner = handle.ownerDocument
  let pointer: number | undefined
  let pressed = false
  let target: RichText.Beside | undefined
  let line: HTMLElement | undefined
  // Where the pointer last was, for a scroll that moves the blocks under a still pointer.
  let lastY = 0
  const { style } = handle as Element & ElementCSSInlineStyle
  const touchAction = style.getPropertyValue('touch-action')
  style.setProperty('touch-action', 'none')

  const draw = (at: { readonly top: number; readonly left: number; readonly width: number }) => {
    line ??= owner.body.appendChild(owner.createElement('div'))
    line.setAttribute('data-richtext-drop', '')
    line.style.position = 'fixed'
    line.style.top = `${at.top}px`
    line.style.left = `${at.left}px`
    line.style.width = `${at.width}px`
  }
  // What a drag can land beside is fixed when it starts; where those blocks are on the page is
  // read again as the pointer moves, since the page can scroll under it.
  let targets: ReadonlyArray<{
    readonly id: RichText.NodeId
    readonly container: string
    readonly index: number
    readonly element: HTMLElement
  }> = []
  /** Whether an event is the pressing pointer's: another finger or pen does not steer the drag. */
  const ours = (event: Event) => pointer === undefined || (event as Pointed).pointerId === pointer
  /** Picks the place for a pointer at `y` from where the blocks are now, and draws its line. */
  const place = (y: number) => {
    lastY = y
    const placed = targets.map(each => {
      const box = each.element.getBoundingClientRect()
      return { ...each, top: box.top, bottom: box.bottom, left: box.left, width: box.width }
    })
    target = dropBeside(placed, node, y)
    const edge =
      target === undefined
        ? undefined
        : 'before' in target
          ? { id: target.before, top: true }
          : { id: target.after, top: false }
    const block = edge === undefined ? undefined : placed.find(each => each.id === edge.id)
    if (edge === undefined || block === undefined) {
      line?.remove()
      line = undefined
      return
    }
    draw({ top: edge.top ? block.top : block.bottom, left: block.left, width: block.width })
  }
  const moved = (event: Event) => {
    const pointed = event as Pointed
    if (!ours(pointed)) return
    // A move with the button up is a release this page never heard: over a frame, say.
    if (((pointed.buttons ?? 1) & 1) === 0) return end(false)
    place(pointed.clientY ?? lastY)
  }
  const end = (drop: boolean): void => {
    const chosen = target
    pressed = false
    pointer = undefined
    target = undefined
    targets = []
    line?.remove()
    line = undefined
    for (const [type, listener] of onPage) owner.removeEventListener(type, listener, true)
    if (drop && chosen !== undefined) dropped(chosen)
  }
  const onPage: ReadonlyArray<readonly [string, (event: Event) => void]> = [
    ['pointermove', moved],
    [
      'pointerup',
      event => {
        if (!ours(event)) return
        // The place is the release's own, not the last move's: the page may have scrolled.
        place((event as Pointed).clientY ?? lastY)
        end(true)
      },
    ],
    ['scroll', () => place(lastY)],
    [
      'pointercancel',
      event => {
        if (ours(event)) end(false)
      },
    ],
    [
      'keydown',
      event => {
        if ((event as Pointed).key !== 'Escape') return
        event.preventDefault()
        end(false)
      },
    ],
  ]
  const pressedOn = (event: Event) => {
    const pointed = event as Pointed
    if (pressed || (pointed.button ?? 0) !== 0) return
    pressed = true
    pointer = pointed.pointerId
    lastY = pointed.clientY ?? 0
    const host = owner.getElementById(hostId)
    const dom = host === null ? undefined : attachmentIn(host)?.current()
    if (dom !== undefined) {
      const places = placesOf(dom.content.children)
      targets = RichText.moveTargets(dom.content, node, vocabularyFor(hostId).nodes).flatMap(id => {
        const place = places.get(id)
        const element = dom.elements.get(id)
        return place === undefined || element === undefined ? [] : [{ id, ...place, element }]
      })
    }
    // The press is the handle's, not the start of a text selection in the page.
    event.preventDefault()
    for (const [type, listener] of onPage) owner.addEventListener(type, listener, true)
  }
  handle.addEventListener('pointerdown', pressedOn)
  return () => {
    handle.removeEventListener('pointerdown', pressedOn)
    if (touchAction === '') style.removeProperty('touch-action')
    else style.setProperty('touch-action', touchAction)
    if (pressed) end(false)
  }
}

/** `dragBlock` as a Mount, for a block handle's grip; its drop is the editor's `MovedBlock`. */
export const blockDrag = Mount.defineStream('RichTextBlockDrag', {
  args: {
    /** The editor host's id. */
    hostId: Schema.String,
    /** The block the handle stands for. */
    node: RichText.NodeId,
  },
  messages: [Message.MovedBlock],
  execute: ({ element, hostId, node }) =>
    Stream.callback<typeof Message.MovedBlock.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          dragBlock(element, hostId, node, to =>
            Queue.offerUnsafe(queue, Message.MovedBlock({ node, to })),
          ),
        ),
        release => Effect.sync(release),
      ),
    ),
})
