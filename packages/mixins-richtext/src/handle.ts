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
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the handle publishes: its wrapper and its two moves. */
export const BlockHandleSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  up: Slot.make({ capability: Capability.Interactive }),
  down: Slot.make({ capability: Capability.Interactive }),
})

export interface BlockHandleInput<Message> {
  readonly document: RichText.Document
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

/**
 * The handle as a slot view. Up moves the block before its previous sibling and down after its
 * next one; each is disabled at its end of the container, and both when the block is not there.
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
