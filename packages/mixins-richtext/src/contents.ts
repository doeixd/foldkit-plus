/**
 * The table of contents: the document's headings as links, drawn through slots. It is a read of
 * the document (`RichText.outlineOf`) and holds no state; choosing a heading is the caller's
 * Message, since moving the caret there and scrolling to it are the caller's to do.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'

/**
 * The elements the contents publish: the `nav`, its list, and one entry per heading. An entry
 * carries its depth as `--fk-toc-level` (1 for the shallowest level the document uses) and
 * `aria-current="location"` for the section the selection is in.
 */
export const TableOfContentsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  entry: Slot.make({ capability: Capability.Interactive }),
})

export interface TableOfContentsInput<Message> {
  readonly document: RichText.Document
  /** Where the caret is, whose section is marked current. */
  readonly selection: RichText.Selection | null
  /** A heading was chosen. */
  readonly chosen: (node: RichText.NodeId) => Message
}

/** The contents as a slot view; nothing is drawn for a document with no headings. */
export const tableOfContents = <Message>(): SlotView.SlotView<
  typeof TableOfContentsSlots,
  TableOfContentsInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(TableOfContentsSlots, (input, slots, h): Html => {
    const entries = RichText.outlineOf(input.document)
    if (entries.length === 0) return h.empty
    const top = Math.min(...entries.map(entry => entry.level))
    const current = RichText.sectionAt(input.document, input.selection)
    return h.nav(slots.root.attrs([h.AriaLabel('Contents')]), [
      h.ul(
        slots.list.attrs(),
        entries.map(entry =>
          h.li(
            [h.Key(entry.node)],
            [
              h.button(
                slots.entry.attrs([
                  h.Type('button'),
                  h.Style({ '--fk-toc-level': String(entry.level - top + 1) }),
                  ...(entry.node === current ? [h.AriaCurrent('location')] : []),
                  h.OnClick(input.chosen(entry.node)),
                ]),
                [entry.text],
              ),
            ],
          ),
        ),
      ),
    ])
  })
