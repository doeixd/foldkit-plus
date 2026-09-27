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
 * edges at one height, the later target's wins, which is the deeper where a container's edge
 * meets its first or last block's. Undefined when that is where the block already is.
 */
export const dropBeside = (
  targets: ReadonlyArray<Placed>,
  moving: RichText.NodeId,
  y: number,
): RichText.Beside | undefined => {
  const self = targets.find(target => target.id === moving)
  let nearest:
    { readonly target: Placed; readonly after: boolean; readonly distance: number } | undefined
  for (const target of targets) {
    for (const after of [false, true]) {
      const distance = Math.abs(y - (after ? target.bottom : target.top))
      if (nearest === undefined || distance <= nearest.distance)
        nearest = { target, after, distance }
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
  readonly pointerId?: number
  readonly button?: number
  readonly key?: string
}

/**
 * Lets `handle` drag block `node` of the editor in `hostId`: a press on it starts, the pointer
 * moving picks the place, release drops there through `dropped`, and Escape or a cancelled
 * pointer ends it without a drop. The page is listened to only while a press is under way. The
 * line is an element of its own, `[data-richtext-drop]`, fixed at the edge the block would land
 * on, for a stylesheet to draw.
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
  const moved = (event: Event) => {
    const pointed = event as Pointed
    if (pointer !== undefined && pointed.pointerId !== pointer) return
    const placed = targets.map(each => {
      const box = each.element.getBoundingClientRect()
      return { ...each, top: box.top, bottom: box.bottom, left: box.left, width: box.width }
    })
    target = dropBeside(placed, node, pointed.clientY ?? 0)
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
  const end = (drop: boolean) => {
    const chosen = target
    pressed = false
    pointer = undefined
    target = undefined
    line?.remove()
    line = undefined
    for (const [type, listener] of onPage) owner.removeEventListener(type, listener)
    if (drop && chosen !== undefined) dropped(chosen)
  }
  const onPage: ReadonlyArray<readonly [string, (event: Event) => void]> = [
    ['pointermove', moved],
    ['pointerup', () => end(true)],
    ['pointercancel', () => end(false)],
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
    for (const [type, listener] of onPage) owner.addEventListener(type, listener)
  }
  handle.addEventListener('pointerdown', pressedOn)
  return () => {
    handle.removeEventListener('pointerdown', pressedOn)
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
