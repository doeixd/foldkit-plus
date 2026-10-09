/**
 * The list, the add form, and the rename editor. The list view is Crud's:
 * "Loading…" until the first page, the stored rows on a later visit, and
 * those rows again while a refetch is in flight. A write's "Saving…" is
 * Remote's pending mutations.
 *
 * Every indicator keeps its line from the first paint. `Loading.shown` leaves
 * the words invisible until the wait has lasted, so a fast answer never
 * flashes and nothing below moves when the words appear.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Loading, RowListSlots, RowListView } from 'foldkit-mixins-crud'
import {
  AddForm,
  Data,
  Message,
  Rename,
  RenameForm,
  Todos,
  type Model,
  type TodoItem,
} from './app.js'
import { orderedPage } from './order.js'

/** Busy words fade in only once the wait has lasted. The line's box is page.css. */
const held = Loading.shown

const IndicatorSlots = Slots.define({
  line: Slot.make({ capability: Capability.Base }),
})

const Indicator = SlotView.forMessages<Message>()
  .define(
    IndicatorSlots,
    (
      input: {
        readonly id: string
        readonly busy: boolean
        readonly alert: boolean
        readonly text: string
        readonly dismiss: boolean
      },
      slots,
      h,
    ) =>
      h.p(
        slots.line.attrs([
          h.Id(input.id),
          h.Role(input.alert ? 'alert' : 'status'),
          ...(input.busy ? [h.AriaBusy(true)] : []),
        ]),
        [
          input.text,
          ...(input.dismiss
            ? [' ', h.button([h.Type('button'), h.OnClick(Message.DismissedNotice())], ['Dismiss'])]
            : []),
        ],
      ),
  )
  .pipe(Style.attach(Style.forSlots(IndicatorSlots)({ line: held })))

const TodoRows = RowListView.forMessages<Message>()
  .define<TodoItem>({ name: 'Todos' })
  .pipe(Style.attach(Style.forSlots(RowListSlots)({ status: held })))

const status = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(model.notice, {
    onSome: message =>
      Indicator({ id: 'status', busy: false, alert: true, text: message, dismiss: true }, h),
    onNone: () => {
      const busy = Data.inspect(model).mutations.pending.length > 0
      return Indicator(
        {
          id: 'status',
          busy,
          alert: false,
          // Absent while idle: the line stays, and the words are busy-only,
          // so a finished save does not leave "Saving…" on screen.
          text: busy ? 'Saving…' : '',
          dismiss: false,
        },
        h,
      )
    },
  })

const saveLine: Readonly<Record<string, string>> = {
  Loading: 'Loading…',
  NotFound: 'That todo does not exist.',
  LoadFailed: 'The todo could not be read.',
  Saving: 'Saving…',
  Saved: 'Saved.',
}

const editor = (model: Model, h: HtmlBuilder<Message>): Html => {
  const state = Rename.status(model)
  if (state === 'Closed') return h.span([h.Hidden(true)], [])
  const error = Rename.saveError(model)
  const busy = state === 'Loading' || state === 'Saving'
  return h.section(
    [h.Id('editor')],
    [
      Indicator(
        {
          id: 'editor-status',
          busy,
          alert: state === 'SaveFailed' || state === 'NotFound' || state === 'LoadFailed',
          text:
            state === 'SaveFailed' ? `Not saved: ${error?.message ?? ''}` : (saveLine[state] ?? ''),
          dismiss: false,
        },
        h,
      ),
      ...(state === 'Loading' || state === 'NotFound' || state === 'LoadFailed'
        ? []
        : [RenameForm.view(model, h, { words: { submit: 'Save' } })]),
      h.button([h.Type('button'), h.OnClick(Message.ClosedEditor())], ['Close']),
    ],
  )
}

const rows = (model: Model, h: HtmlBuilder<Message>): Html =>
  TodoRows(
    {
      // A prepended row is membership, not a place. This is the query's order,
      // so a live insert does not move it.
      page: orderedPage(Todos.page(model)),
      onMore: Message.RequestedMoreTodos(),
      onRetry: Message.RetriedTodos(),
      words: { empty: 'Nothing to do.', loading: 'Loading…' },
      row: (row, html) => [
        html.input([
          html.Type('checkbox'),
          html.Checked(row.done === 1),
          html.AriaLabel(`Done: ${row.title}`),
          html.OnClick(Message.ToggledTodo({ id: row.id, title: row.title, done: row.done })),
        ]),
        html.button(
          [
            html.Type('button'),
            html.Class(row.done === 1 ? 'done' : 'title'),
            html.OnClick(Message.OpenedTodo({ id: row.id })),
          ],
          [row.title],
        ),
        html.button(
          [
            html.Type('button'),
            html.AriaLabel(`Delete ${row.title}`),
            html.OnClick(Message.RemovedTodo({ id: row.id })),
          ],
          ['Delete'],
        ),
      ],
    },
    h,
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.h1([], ['Todos']),
      h.p(
        [h.Class('lede')],
        [
          'An edit shows at once. A slow save says Saving… without moving the list. Another tab sees it on the live stream.',
        ],
      ),
      h.label(
        [],
        [
          'Name ',
          h.input([
            h.Id('actor'),
            h.Value(model.actorDraft),
            h.OnInput(name => Message.ActorEdited({ name })),
            h.OnBlur(Message.ActorCommitted()),
          ]),
        ],
      ),
      status(model, h),
      AddForm.view(model, h, { words: { submit: 'Add' } }),
      rows(model, h),
      editor(model, h),
    ],
  )
