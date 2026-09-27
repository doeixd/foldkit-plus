/**
 * The block handle (§11, §144): the moves one block can make as a whole, drawn through slots
 * like the rest of the chrome.
 *
 * It holds no state. Which block it stands for is the caller's, usually one of
 * `RichText.blocksAt(document, selection)`: the outermost to move a whole list, an item to
 * reorder a list. Its siblings are a read of the document, and what it sends is the editor's
 * `MovedBlock`, wrapped for the caller.
 */
import type { Html } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'
import { blockDrag } from 'foldkit-richtext-dom/toolbar'

/** The elements the handle publishes: its wrapper, the grip it is dragged by, and its two moves. */
export const BlockHandleSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  grip: Slot.make({ capability: Capability.Interactive }),
  up: Slot.make({ capability: Capability.Interactive }),
  down: Slot.make({ capability: Capability.Interactive }),
})

export interface BlockHandleInput<Message> {
  readonly document: RichText.Document
  /** The editor host's id, whose blocks a drag measures. */
  readonly hostId: string
  /** The block the handle stands for. */
  readonly node: RichText.NodeId
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/** The blocks either side of a block in its own container. */
const siblingsOf = (document: RichText.Document, node: RichText.NodeId) => {
  const found = RichText.locateBlock(document, node)
  if (found === undefined) return {}
  const container = found.path.slice(0, -1)
  const parent = container.length === 0 ? undefined : RichText.blockAtPath(document, container)
  const blocks = parent?.type === 'Node' ? (parent.blocks ?? []) : document.children
  const index = found.path[found.path.length - 1]!
  return { previous: blocks[index - 1], next: blocks[index + 1] }
}

/** The drag Mount lifted into the caller's Messages, as the grip carries it. */
export const dragMount = <Message>(
  hostId: string,
  node: RichText.NodeId,
  wrap: (message: EditorEvent) => Message,
): Mount.MountAction<Message> => Mount.mapMessage(blockDrag({ hostId, node }), wrap)

/**
 * The handle as a slot view. The grip drags the block among its container's blocks
 * (`blockDrag`), and is keyed by the block, since a Mount reads its args once. Up moves the
 * block before its previous sibling and down after its next one, the same moves from the
 * keyboard; each is disabled at its end of the container, and both when the block is not there.
 */
export const blockHandle = <Message>(): SlotView.SlotView<
  typeof BlockHandleSlots,
  BlockHandleInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(BlockHandleSlots, (input, slots, h): Html => {
    const { previous, next } = siblingsOf(input.document, input.node)
    const move = (to: RichText.Beside) =>
      input.wrap(EditorMessage.MovedBlock({ node: input.node, to }))
    return h.div(slots.root.attrs([h.Role('group'), h.AriaLabel('Block')]), [
      h.button(
        slots.grip.attrs([
          h.Key(input.node),
          h.Type('button'),
          h.DataAttribute('handle', 'grip'),
          h.AriaLabel('Drag to move'),
          h.OnMount(dragMount(input.hostId, input.node, input.wrap)),
        ]),
        ['⠿'],
      ),
      h.button(
        slots.up.attrs([
          h.Type('button'),
          h.DataAttribute('handle', 'up'),
          h.AriaLabel('Move up'),
          h.Disabled(previous === undefined),
          ...(previous === undefined ? [] : [h.OnClick(move({ before: previous.id }))]),
        ]),
        ['↑'],
      ),
      h.button(
        slots.down.attrs([
          h.Type('button'),
          h.DataAttribute('handle', 'down'),
          h.AriaLabel('Move down'),
          h.Disabled(next === undefined),
          ...(next === undefined ? [] : [h.OnClick(move({ after: next.id }))]),
        ]),
        ['↓'],
      ),
    ])
  })
