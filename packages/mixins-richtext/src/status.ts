/**
 * The editor's status line (§124 §11, §141): how long the document is, and what the application
 * found wrong with it, drawn through slots like the rest of the chrome.
 *
 * It sends nothing. The counts are `RichText.count`; the problems are whatever the caller
 * passes, usually `RichText.validate` against its Kit, which this view does not run, because
 * which Kit a document answers to is the application's.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'

/** The elements the status line publishes: its wrapper, the counts, and one item per problem. */
export const EditorStatusSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  counts: Slot.make({ capability: Capability.Base }),
  problems: Slot.make({ capability: Capability.Collection }),
  problem: Slot.make({ capability: Capability.Base }),
})

export interface EditorStatusInput {
  readonly document: RichText.Document
  /** What the application found wrong with the document. None is shown when absent. */
  readonly diagnostics?: ReadonlyArray<RichText.Diagnostic> | undefined
}

// A caret move redraws the status without changing the document, so counts are kept per
// document value; each edit makes a new one, and a dropped one is collected with its entry.
const counted = new WeakMap<RichText.Document, ReturnType<typeof RichText.count>>()
const countOf = (document: RichText.Document) => {
  const kept = counted.get(document)
  if (kept !== undefined) return kept
  const counts = RichText.count(document)
  counted.set(document, counts)
  return counts
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The status line as a slot view. Each problem carries its code, and its node when it has
 * one, as data attributes, so a Style can mark a kind and a Behavior can find the block.
 */
export const editorStatus = <Message>(): SlotView.SlotView<
  typeof EditorStatusSlots,
  EditorStatusInput,
  Message
> =>
  SlotView.forMessages<Message>().define(EditorStatusSlots, (input, slots, h): Html => {
    const { words, characters } = countOf(input.document)
    const problems = input.diagnostics ?? []
    return h.div(slots.root.attrs(), [
      h.p(slots.counts.attrs([h.DataAttribute('status', 'counts')]), [
        `${plural(words, 'word', 'words')} · ${plural(characters, 'character', 'characters')}`,
      ]),
      h.ul(
        slots.problems.attrs([h.DataAttribute('status', 'problems')]),
        problems.map((problem, index) =>
          h.li(
            slots.problem.attrs(
              [
                h.DataAttribute('code', problem.code),
                ...(problem.node === undefined ? [] : [h.DataAttribute('node', problem.node)]),
              ],
              {
                index,
                id: `${problem.code}:${problem.node ?? ''}:${index}`,
                count: problems.length,
              },
            ),
            [problem.message],
          ),
        ),
      ),
    ])
  })
