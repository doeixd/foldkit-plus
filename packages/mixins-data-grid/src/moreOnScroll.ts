import { Behavior, type SlotView } from 'foldkit-mixins'
import * as Mount from 'foldkit/mount'
import { Nearing } from './nearEnd.js'
import { GridSlots } from './slots.js'
import { isBusy, type GridInput } from './view.js'

/**
 * Sends the grid's `onMore` as its More button comes within 200px of the
 * grid's visible box, and again after each load while the button stays
 * there; the button stays for the keyboard. Nothing is asked while the rows'
 * source is busy. Attach it to a grid's view:
 * `DataGridView<Message>().define(Grid).pipe(MoreOnScroll)`.
 */
export const MoreOnScroll = <Row, Id extends string, GridMessage, Message>(
  view: SlotView.SlotView<typeof GridSlots, GridInput<Row, Id, GridMessage, Message>, Message>,
): SlotView.SlotView<typeof GridSlots, GridInput<Row, Id, GridMessage, Message>, Message> =>
  Behavior.attach(
    Behavior.forSlots(GridSlots)<GridInput<Row, Id, GridMessage, Message>, Message>(
      {
        more: Behavior.slot({
          // The view keys the button by the rows loaded and whether a load is
          // in flight, so this starts afresh after each load and, still in
          // view, asks again. It is drawn only when there is an `onMore`.
          mount: input =>
            Mount.mapMessage(Nearing({ watching: !isBusy(input.status) }), () => input.onMore!),
        }),
      },
      { name: 'MoreOnScroll' },
    ),
  )(view)
