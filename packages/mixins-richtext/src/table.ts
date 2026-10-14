/**
 * The table toolbar: rows and columns added and removed around the caret's cell, the header row
 * switched, and the table deleted, drawn through slots like the rest of the chrome. It holds no
 * state: where the caret is in which table is a read of the document (`RichText.tableAt`), and
 * what it sends is the editor's own Messages, wrapped for the caller.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the toolbar publishes: its wrapper, its row, and one button per change. */
export const TableToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  toolbar: Slot.make({ capability: Capability.Collection }),
  button: Slot.make({ capability: Capability.Interactive }),
})

export interface TableToolbarInput<Message> {
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/**
 * The table toolbar as a slot view. Every button is disabled outside a table, so a caller can
 * draw it always or only while `RichText.tableAt` finds the caret in one. Each button carries its
 * change as `data-table` and as the slot item's `id`, so a Style or Behavior can single one out;
 * the header button is pressed while the table's first row is its header.
 */
export const tableToolbar = <Message>(): SlotView.SlotView<
  typeof TableToolbarSlots,
  TableToolbarInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(TableToolbarSlots, (input, slots, h): Html => {
    const at = RichText.tableAt(input.document, input.selection)
    const first = at?.rows[0]
    const header = first?.props.header === true
    const changes: ReadonlyArray<
      readonly [id: string, label: string, message: EditorEvent | undefined, pressed?: boolean]
    > = [
      ['row-above', 'Row above', EditorMessage.InsertedRow({ where: 'before' })],
      ['row-below', 'Row below', EditorMessage.InsertedRow({ where: 'after' })],
      ['column-left', 'Column left', EditorMessage.InsertedColumn({ where: 'before' })],
      ['column-right', 'Column right', EditorMessage.InsertedColumn({ where: 'after' })],
      ['delete-row', 'Delete row', EditorMessage.DeletedRow()],
      ['delete-column', 'Delete column', EditorMessage.DeletedColumn()],
      [
        'header',
        'Header row',
        first === undefined
          ? undefined
          : EditorMessage.ChangedProps({ node: first.id, props: { header: !header } }),
        header,
      ],
      [
        'delete-table',
        'Delete table',
        at === undefined ? undefined : EditorMessage.DeletedBlock({ node: at.table.id }),
      ],
    ]
    return h.div(slots.root.attrs(), [
      h.div(
        slots.toolbar.attrs([h.Role('toolbar'), h.AriaLabel('Table')]),
        changes.map(([id, label, message, pressed], index) =>
          h.button(
            slots.button.attrs(
              [
                h.Type('button'),
                h.DataAttribute('table', id),
                ...(pressed === undefined ? [] : [h.AriaPressed(pressed ? 'true' : 'false')]),
                h.Disabled(at === undefined || message === undefined),
                ...(at === undefined || message === undefined
                  ? []
                  : [h.OnClick(input.wrap(message))]),
              ],
              { index, id, count: changes.length },
            ),
            [label],
          ),
        ),
      ),
    ])
  })
