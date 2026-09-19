/**
 * The page: the post list as a table, and the editor beside it. The table is
 * drawn from the list's own columns and the form from its controls, so neither
 * names a field.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { RemoteData } from 'foldkit-remote'
import {
  EditForm,
  Message,
  PostEditor,
  PostList,
  PostRemover,
  Posts,
  RemoverMessage,
  pickers,
  type Model,
} from './app.js'

const cell = (value: unknown): string =>
  typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value ?? '')

const table = (model: Model, h: HtmlBuilder<Message>): Html =>
  RemoteData.match(Posts.page(model), {
    Initial: () => h.p([h.Class('muted')], ['…']),
    Loading: () => h.p([h.Class('muted')], ['Loading posts…']),
    Failed: error => h.p([h.Role('alert')], [`Could not read the posts: ${error.message}`]),
    NotFound: () => h.p([], ['No posts.']),
    Refreshing: page => rows(page, h),
    Ready: page => rows(page, h),
  })

const rows = (
  page: {
    readonly items: ReadonlyArray<Readonly<Record<string, unknown>>>
    readonly hasNext: boolean
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.table(
        [h.Id('posts')],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                PostList.columns.map(column => h.th([], [column.label])),
              ),
            ],
          ),
          h.tbody(
            [],
            page.items.map(row =>
              h.tr(
                [h.Key(String(row.id)), h.OnClick(Message.OpenedPost({ id: String(row.id) }))],
                PostList.columns.map(column => h.td([], [cell(row[column.key])])),
              ),
            ),
          ),
        ],
      ),
      ...(page.hasNext ? [h.button([h.OnClick(Message.RequestedMorePosts())], ['More'])] : []),
    ],
  )

const saveLine: Readonly<Record<string, string>> = {
  Loading: 'Loading…',
  NotFound: 'That post does not exist.',
  LoadFailed: 'The post could not be read.',
  Saving: 'Saving…',
  Saved: 'Saved.',
}

const editor = (model: Model, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  if (status === 'Closed') return h.p([h.Class('muted')], ['Choose a post to edit.'])
  const error = PostEditor.saveError(model)
  return h.section(
    [h.Id('editor')],
    [
      h.p(
        [h.Id('status'), h.Role('status')],
        [status === 'SaveFailed' ? `Not saved: ${error?.message ?? ''}` : (saveLine[status] ?? '')],
      ),
      ...(status === 'Loading' || status === 'NotFound' || status === 'LoadFailed'
        ? []
        : [EditForm.view(model, h, { options: pickers(model), submitLabel: 'Save' })]),
      h.button([h.Id('close'), h.OnClick(Message.ClosedEditor())], ['Close']),
      ...remove(model, h),
    ],
  )
}

/** Delete, with a yes in between. Once it is gone the editor above reads that for itself. */
const remove = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const id = model.editPost.target
  if (id === null) return []
  const answer = (message: typeof RemoverMessage.Type) => Message.GotRemovePostMessage({ message })
  switch (PostRemover.status(model)) {
    case 'Confirming':
      return [
        h.p([h.Id('confirm')], [`Delete ${PostRemover.target(model) ?? ''}?`]),
        h.button([h.Id('yes'), h.OnClick(answer(RemoverMessage.Confirmed()))], ['Yes, delete']),
        h.button([h.Id('no'), h.OnClick(answer(RemoverMessage.Cancelled()))], ['No']),
      ]
    case 'Deleting':
      return [h.p([h.Role('status')], ['Deleting…'])]
    case 'Deleted':
      return []
    case 'DeleteFailed':
      return [h.p([h.Role('alert')], [`Not deleted: ${PostRemover.error(model)?.message ?? ''}`])]
    case 'Idle':
      return [h.button([h.Id('delete'), h.OnClick(Message.AskedToDeletePost({ id }))], ['Delete'])]
  }
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main([], [h.h1([], ['Posts']), table(model, h), editor(model, h)])
