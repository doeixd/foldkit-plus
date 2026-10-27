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
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { EditorView, RowListView } from 'foldkit-mixins-crud'
import { AppShell, Input } from 'foldkit-mixins-ui'
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
import { EditorStyle, NameStyle, Page, RowsStyle, ShellStyle } from './style.js'

type Slots = SlotBuilders<typeof Page.slots, Message>

const TodoRows = RowListView.forMessages<Message>()
  .define<TodoItem>({ name: 'Todos' })
  .pipe(Style.attach(RowsStyle))

const RenameEditor = EditorView.forMessages<Message>()
  .define({ name: 'Rename' })
  .pipe(Style.attach(EditorStyle))

/** The line above the form: a failure to dismiss, or "Saving…" while a write is out. */
const status = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  Option.match(model.notice, {
    onSome: message =>
      h.p(slots.status.attrs([h.Id('status'), h.Role('alert')]), [
        message,
        h.button(slots.dismiss.attrs([h.Type('button'), h.OnClick(Message.DismissedNotice())]), [
          'Dismiss',
        ]),
      ]),
    onNone: () => {
      const busy = Data.inspect(model).mutations.pending.length > 0
      // Empty while idle: the line stays, and the words are busy-only, so a
      // finished save does not leave "Saving…" on screen.
      return h.p(
        slots.status.attrs([h.Id('status'), h.Role('status'), ...(busy ? [h.AriaBusy(true)] : [])]),
        busy ? ['Saving…'] : [],
      )
    },
  })

const editor = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const state = Rename.status(model)
  if (state === 'Closed') return []
  return [
    RenameEditor(
      {
        id: 'editor',
        status: state,
        title: 'Rename',
        form: RenameForm.view(model, h, { words: { submit: 'Save' } }),
        error: Rename.saveError(model)?.message,
        onClose: Message.ClosedEditor(),
        words: { notFound: 'That todo does not exist.', loadFailed: 'The todo could not be read.' },
      },
      h,
    ),
  ]
}

const rows = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  TodoRows(
    {
      // Remote draws each row where `AllTodos`' order puts it, an inserted one too.
      page: Todos.page(model),
      onMore: Message.RequestedMoreTodos(),
      onRetry: Message.RetriedTodos(),
      words: { empty: 'Nothing to do.', loading: 'Loading…' },
      row: (row, html) => [
        html.input(
          slots.done.attrs([
            html.Type('checkbox'),
            html.Checked(row.done === 1),
            html.AriaLabel(`Done: ${row.title}`),
            html.OnClick(Message.ToggledTodo({ id: row.id, title: row.title, done: row.done })),
          ]),
        ),
        html.button(
          slots.title.attrs([
            html.Type('button'),
            html.DataAttribute('done', String(row.done === 1)),
            html.OnClick(Message.OpenedTodo({ id: row.id })),
          ]),
          [row.title],
        ),
        html.button(
          slots.remove.attrs([
            html.Type('button'),
            html.AriaLabel(`Delete ${row.title}`),
            html.OnClick(Message.RemovedTodo({ id: row.id })),
          ]),
          ['Delete'],
        ),
      ],
    },
    h,
  )

/** Who this tab writes as: sent as `x-actor`, and the key of the rows it keeps. */
const actor = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  Input.view(
    {
      id: 'actor',
      value: model.actorDraft,
      onInput: name => Message.ActorEdited({ name }),
      style: NameStyle,
      draw: (resolved, h) =>
        h.label(slots.actor.attrs(), [
          'Name',
          h.input([...resolved.input, h.OnBlur(Message.ActorCommitted())]),
        ]),
    },
    h,
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  return AppShell.view(
    { title: 'Todos', style: ShellStyle },
    [
      h.div(slots.content.attrs(), [
        h.h1(slots.heading.attrs(), ['Todos']),
        h.p(slots.lede.attrs(), [
          'An edit shows at once. A slow save says Saving… without moving the list. Another tab sees it on the live stream.',
        ]),
        actor(model, slots, h),
        status(model, slots, h),
        AddForm.view(model, h, { words: { submit: 'Add' } }),
        rows(model, slots, h),
        ...editor(model, h),
      ]),
    ],
    h,
  )
}
