/**
 * The page: the post list as a table, and the editor beside it. The table is
 * drawn from the list's own columns and the form from its controls, so neither
 * names a field.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Option } from 'effect'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { ConfirmView, EditorView, ListView, Toolbar } from 'foldkit-mixins-crud'
import { AppShell, Input } from 'foldkit-mixins-ui'
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
import {
  ConfirmStyle,
  EditorStyle,
  ListStyle,
  Page,
  SearchStyle,
  ShellStyle,
  ToolbarStyle,
} from './style.js'

type Slots = SlotBuilders<typeof Page.slots, Message>

// The list's table is `foldkit-mixins-crud`'s: columns, labels and cell text come
// from the list and its Displays. What a click means is this page's, so the
// Messages arrive as inputs.
const PostTable = ListView.forMessages<Message>().define(PostList).pipe(Style.attach(ListStyle))

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
const PostEditorView = EditorView.forMessages<Message>()
  .define({ name: 'PostEditor' })
  .pipe(Style.attach(EditorStyle))
const DeletePost = ConfirmView.forMessages<Message>()
  .define({ name: 'DeletePost' })
  .pipe(Style.attach(ConfirmStyle))
const Tools = Toolbar.forMessages<Message>().define().pipe(Style.attach(ToolbarStyle))

const editor = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  if (status === 'Closed') return h.p(slots.hint.attrs(), ['Choose a post to edit.'])
  return h.div(slots.side.attrs(), [
    PostEditorView(
      {
        id: 'editor',
        status,
        title: 'Edit post',
        form: EditForm.view(model, h, {
          options: pickers(model),
          more: pickers.more(model),
          words,
        }),
        error: PostEditor.saveError(model)?.message,
        onClose: Message.ClosedPost(),
        words: editorWords,
      },
      h,
    ),
    ...remove(model, slots, h),
  ])
}

/** Delete, with a yes in between. Once it is gone the editor above reads that for itself. */
const remove = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const id = PostEditor.target(model)
  if (id === null) return []
  const status = PostRemover.status(model)
  if (status === 'Idle')
    // An id, so a no puts focus back here (the remover's `returnFocus`).
    return [
      h.button(
        slots.remove.attrs([
          h.Id('delete'),
          h.Type('button'),
          h.OnClick(Message.AskedToRemovePost({ id })),
        ]),
        ['Delete'],
      ),
    ]
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

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  return AppShell.view(
    { title: 'Posts', style: ShellStyle },
    [
      h.div(slots.content.attrs(), [
        h.h1(slots.heading.attrs(), ['Posts']),
        Tools(
          {
            // The search is the query's input. Typing changes the Model; Remote sees a
            // list that now requires another connection and fetches it.
            search: Input.view(
              {
                id: 'search',
                type: 'search',
                placeholder: 'Search titles',
                // The box shows every keystroke; only the settled value reaches the query.
                value: model.search.latest ?? '',
                onInput: text => searched(text),
                style: SearchStyle,
                draw: (resolved, h) => h.input([...resolved.input, h.AriaLabel('Search titles')]),
              },
              h,
            ),
          },
          h,
        ),
        table(model, h),
        editor(model, slots, h),
      ]),
    ],
    h,
  )
}
