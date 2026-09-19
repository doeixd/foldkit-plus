/**
 * The page: the post list as a table, and the editor beside it. The table is
 * drawn from the list's own columns and the form from its controls, so neither
 * names a field.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ListView } from 'foldkit-mixins-crud'
import { PostSort } from './operations.js'
import { words } from './words.js'
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

// The list's table is `foldkit-mixins-crud`'s: columns, labels and cell text come
// from the list and its Displays. What a click means is this page's, so the
// Messages arrive as inputs.
const PostTable = ListView.forMessages<Message>().define(PostList)

const table = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostTable(
    {
      page: Posts.page(model),
      onOpen: row => Message.OpenedPost({ id: row.id }),
      onMore: Message.RequestedMorePosts(),
      // Every order the list offers, with its state and the Message a click sends.
      sort: PostSort.inputs(model.postSort, sort => Message.SortedPosts({ sort })),
      words,
    },
    h,
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
        : [EditForm.view(model, h, { options: pickers(model), words })]),
      h.button([h.Id('close'), h.OnClick(Message.ClosedEditor())], ['Close']),
      ...remove(model, h),
    ],
  )
}

/** Delete, with a yes in between. Once it is gone the editor above reads that for itself. */
const remove = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const id = PostEditor.target(model)
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
  h.main(
    [],
    [
      h.h1([], ['Posts']),
      // The search is the query's input. Typing changes the Model; Remote sees a
      // list that now requires another connection and fetches it.
      h.input([
        h.Id('search'),
        h.Type('search'),
        h.Placeholder('Search titles'),
        h.AriaLabel('Search titles'),
        h.Value(model.postSearch),
        h.OnInput(text => Message.SearchedPosts({ text })),
      ]),
      table(model, h),
      editor(model, h),
    ],
  )
