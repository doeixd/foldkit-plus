/**
 * Dragging a block by its handle (§148): the pointer picks a place among the blocks of the
 * block's own container, a line outside the editable subtree shows it, and the drop sends
 * `MovedBlock` there. Moves stay in the container because `MoveBlock` does (§144).
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { Message } from './editor.js'
import { attachmentIn } from './host.js'

/** A block beside the one being dragged, and where it is on the page. */
export interface Placed {
  readonly id: RichText.NodeId
  readonly top: number
  readonly bottom: number
}

/**
 * Where a pointer at `y` puts block `moving` among its container's blocks, in order: before the
 * first whose middle is below the pointer, else after the last. Undefined when that is where the
 * block already is, since dropping there changes nothing.
 */
export const dropBeside = (
  blocks: ReadonlyArray<Placed>,
  moving: RichText.NodeId,
  y: number,
): RichText.Beside | undefined => {
  const from = blocks.findIndex(block => block.id === moving)
  const below = blocks.findIndex(block => y < (block.top + block.bottom) / 2)
  const place = below === -1 ? blocks.length : below
  if (from === -1 || place === from || place === from + 1) return undefined
  return below === -1 ? { after: blocks[blocks.length - 1]!.id } : { before: blocks[below]!.id }
}

/** The blocks of the container `node` stands in, placed; empty when the editor does not hold it. */
const containerOf = (host: Element, node: RichText.NodeId) => {
  const dom = attachmentIn(host)?.current()
  const found = dom === undefined ? undefined : RichText.locateBlock(dom.content, node)
  if (dom === undefined || found === undefined) return []
  const path = found.path.slice(0, -1)
  const parent = path.length === 0 ? undefined : RichText.blockAtPath(dom.content, path)
  const blocks = parent?.type === 'Node' ? (parent.blocks ?? []) : dom.content.children
  return blocks.flatMap(block => {
    const element = dom.elements.get(block.id)
    if (element === undefined) return []
    const box = element.getBoundingClientRect()
    return [{ id: block.id, top: box.top, bottom: box.bottom, left: box.left, width: box.width }]
  })
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
  const moved = (event: Event) => {
    const pointed = event as Pointed
    if (pointer !== undefined && pointed.pointerId !== pointer) return
    const host = owner.getElementById(hostId)
    const blocks = host === null ? [] : containerOf(host, node)
    target = dropBeside(blocks, node, pointed.clientY ?? 0)
    const edge =
      target === undefined
        ? undefined
        : 'before' in target
          ? { id: target.before, top: true }
          : { id: target.after, top: false }
    const block = edge === undefined ? undefined : blocks.find(each => each.id === edge.id)
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
