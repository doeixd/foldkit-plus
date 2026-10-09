/**
 * The list, the add form, and the rename editor. The list view is Crud's:
 * "Loading…" until the first page, the previous rows while a refresh is in
 * flight. A write's "Saving…" is Remote's pending mutations.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { RowListView } from 'foldkit-mixins-crud'
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

const TodoRows = RowListView.forMessages<Message>().define<TodoItem>({ name: 'Todos' })

const status = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(model.notice, {
    onSome: message =>
      h.p(
        [h.Id('status'), h.Role('alert')],
        [
          message,
          ' ',
          h.button([h.Type('button'), h.OnClick(Message.DismissedNotice())], ['Dismiss']),
        ],
      ),
    onNone: () =>
      Data.inspect(model).mutations.pending.length > 0
        ? h.p([h.Id('status'), h.Role('status')], ['Saving…'])
        : h.span([h.Id('status'), h.Hidden(true)], []),
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
  return h.section(
    [h.Id('editor')],
    [
      h.p(
        [h.Id('editor-status'), h.Role('status')],
        [state === 'SaveFailed' ? `Not saved: ${error?.message ?? ''}` : (saveLine[state] ?? '')],
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
      page: Todos.page(model),
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
          'An edit shows at once. Saving… stays until the server confirms it. Another tab sees it on the next refresh.',
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
