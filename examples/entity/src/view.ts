/**
 * The page: the post list as a table, and the editor beside it. The table is
 * drawn from the list's own columns and the form from its controls, so neither
 * names a field.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Option } from 'effect'
import { ConfirmView, EditorView, ListView } from 'foldkit-mixins-crud'
import { PostSort } from './operations.js'
import { confirmWords, editorWords, words } from './words.js'
import {
  EditForm,
  Message,
  PostEditor,
  PostList,
  searched,
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
      // Shown only when the list failed: its rows, if any, stay on screen.
      onRetry: Message.RetriedPosts(),
      // Every order the list offers, with its state and the Message a click sends.
      // The column clicked, toggled in `update`: two clicks in one frame toggle twice.
      sort: PostSort.inputs(model.postSort, (_, column) => Message.SortedPosts({ column })),
      words,
    },
    h,
  )

// What the editor and the delete question say around the form; the states
// themselves, and which of them keep the form, are the views'.
const PostEditorView = EditorView.forMessages<Message>().define({ name: 'PostEditor' })
const DeletePost = ConfirmView.forMessages<Message>().define({ name: 'DeletePost' })

const editor = (model: Model, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  if (status === 'Closed') return h.p([h.Class('muted')], ['Choose a post to edit.'])
  return h.div(
    [],
    [
      PostEditorView(
        {
          id: 'editor',
          status,
          title: 'Edit post',
          form: EditForm.view(model, h, { options: pickers(model), words }),
          error: PostEditor.saveError(model)?.message,
          onClose: Message.ClosedEditor(),
          words: editorWords,
        },
        h,
      ),
      ...remove(model, h),
    ],
  )
}

/** Delete, with a yes in between. Once it is gone the editor above reads that for itself. */
const remove = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const id = PostEditor.target(model)
  if (id === null) return []
  const status = PostRemover.status(model)
  if (status === 'Idle')
    return [h.button([h.Id('delete'), h.OnClick(Message.AskedToDeletePost({ id }))], ['Delete'])]
  const answer = (message: typeof RemoverMessage.Type) => Message.GotRemovePostMessage({ message })
  return [
    DeletePost(
      {
        id: 'remove',
        status,
        // The question names the post by its id, the one name the remover knows.
        name: Option.fromNullishOr(PostRemover.target(model)),
        onConfirm: answer(RemoverMessage.Confirmed()),
        onCancel: answer(RemoverMessage.Cancelled()),
        error: PostRemover.error(model)?.message,
        words: confirmWords,
      },
      h,
    ),
  ]
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
        // The box shows every keystroke; only the settled value reaches the query.
        h.Value(model.search.latest ?? ''),
        h.OnInput(text => searched(text)),
      ]),
      table(model, h),
      editor(model, h),
    ],
  )
