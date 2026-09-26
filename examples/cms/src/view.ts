/**
 * The posts, in the browser: the worklist beside the editor, and under the
 * form the post as the application's own page reads it (which is where a
 * preview shows) and its history. A visitor is sent to the site.
 *
 * The form is `foldkit-mixins-form`'s and the table `foldkit-mixins-crud`'s, each
 * with the CMS's renderers beside its own. What is here is the status line and
 * the buttons, which are this application's to word.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Cms } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import { SlotView, Style } from 'foldkit-mixins'
import { ListView } from 'foldkit-mixins-crud'
import {
  Editor,
  EditorSlot,
  Message,
  PostEditor,
  Worklist,
  WorklistList,
  history,
  postPage,
  type Model,
} from './app.js'
import { badge, chair, failed, shell, stateIs, statusLine } from './shell.js'
import { coverOf, paragraphs, postHref } from './site.js'
import { AdminSlots, AdminStyle, ListStyle } from './style.js'

type Slots = SlotView.SlotBuilders<typeof AdminSlots, Message>

const ask = (message: typeof Editor.Message.Type) => Message.GotEditorMessage({ message })

const WorklistTable = ListView.forMessages<Message>()
  .define(WorklistList)
  .pipe(Style.attach(ListStyle))

const worklist = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.section(slots.panel.attrs([h.Id('worklist')]), [
    h.div(slots.panelHead.attrs(), [
      h.h2(slots.panelTitle.attrs(), ['Posts']),
      h.button(slots.primary.attrs([h.Id('new'), h.OnClick(Message.AskedForPost())]), ['New post']),
    ]),
    h.input(
      slots.search.attrs([
        h.Type('search'),
        h.Placeholder('Search posts'),
        h.AriaLabel('Search posts'),
        h.Value(model.search),
        h.OnInput(text => Message.Searched({ text })),
      ]),
    ),
    h.label(slots.muted.attrs(), [
      h.input([h.Type('checkbox'), h.Checked(model.archived), h.OnClick(Message.ToggledArchive())]),
      ' Show the archive',
    ]),
    WorklistTable(
      {
        page: Worklist.page(model),
        onOpen: row => Message.OpenedEntry({ entry: row.id }),
        renderers: Cms.displayRenderers(),
        words: {
          empty: model.search === '' ? 'Nothing yet. Start a post.' : 'No post matches that.',
        },
      },
      h,
    ),
  ])

const preview = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const post = Option.flatMap(PostEditor.pageId(model), id => {
    const read = postPage(id).read(model)
    return read._tag === 'Ready' || read._tag === 'Refreshing'
      ? Option.some(read.value)
      : Option.none()
  })
  return h.section(slots.panel.attrs([h.Id('page')]), [
    h.div(slots.panelHead.attrs(), [
      h.h3(slots.panelTitle.attrs(), [
        PostEditor.previewing(model) ? 'The post’s page, previewing' : 'The post’s page',
      ]),
      ...Option.toArray(
        Option.map(
          Option.filter(post, () => stateIs(PostEditor.state(model), 'Published', 'Changed')),
          ({ slug }) =>
            h.a(slots.button.attrs([h.Href(`${postHref(slug)}?as=${chair}`)]), [
              'Open on the site ↗',
            ]),
        ),
      ),
    ]),
    Option.match(post, {
      onNone: () =>
        h.p(slots.muted.attrs(), ['There is no row to read yet. Turn preview on to see a draft.']),
      onSome: post =>
        h.article(
          [],
          [
            h.div(
              [h.Style({ background: coverOf(post), borderRadius: '12px', height: '10rem' })],
              [],
            ),
            h.h4([], [post.title]),
            h.p(slots.muted.attrs(), [`/blog/${post.slug}`]),
            h.p([h.Style({ fontStyle: 'italic' })], [post.excerpt]),
            ...paragraphs(post.body).map(paragraph => h.p([], [paragraph])),
          ],
        ),
    }),
  ])
}

const historyPane = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const revisions = Option.match(history(model), {
    onNone: () => [],
    onSome: projection => {
      const read = projection.read(model)
      return read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.revisions : []
    },
  })
  return h.section(slots.panel.attrs([h.Id('history')]), [
    h.div(slots.panelHead.attrs(), [
      h.h3(slots.panelTitle.attrs(), ['History']),
      h.button(slots.button.attrs([h.OnClick(Message.AskedForHistory())]), ['Refresh']),
    ]),
    revisions.length === 0
      ? h.p(slots.muted.attrs(), ['Nothing has been published yet.'])
      : h.ol(
          slots.list.attrs(),
          revisions.map(revision =>
            h.li(slots.toolbar.attrs(), [
              h.span(
                [],
                [
                  `Revision ${revision.n}, ${Display.show(Cms.Display.Moment.of({}), revision.publishedAt)}`,
                  revision.publishedBy === null ? '' : ` by ${revision.publishedBy}`,
                ],
              ),
              h.button(
                slots.button.attrs([
                  h.OnClick(ask(Editor.Message.RestoreAsked({ revision: revision.n }))),
                ]),
                ['Restore as a draft'],
              ),
            ]),
          ),
        ),
  ])
}

const editor = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  if (status === 'Closed')
    return h.section(slots.panel.attrs([h.Id('editor')]), [
      h.p(slots.muted.attrs(), ['Choose a post from the list, or start a new one.']),
    ])
  const state = PostEditor.state(model)
  const error = PostEditor.error(model)
  const loaded = !['Loading', 'NotFound', 'LoadFailed'].includes(status)
  const at = new Date(model.scheduleAt)
  const button = (id: string, label: string, message: Message, enabled = true): Html =>
    h.button(slots.button.attrs([h.Id(id), h.OnClick(message), h.Disabled(!enabled)]), [label])

  return h.div(slots.main.attrs([h.Id('editor')]), [
    h.section(slots.panel.attrs(), [
      h.div(slots.panelHead.attrs(), [
        h.div(slots.toolbar.attrs(), [
          h.h2(slots.panelTitle.attrs(), ['Edit post']),
          badge(slots, h, state),
        ]),
        h.p(
          slots.status.attrs([
            h.Id('status'),
            h.Role('status'),
            ...(failed(status) ? [h.DataAttribute('tone', 'error')] : []),
          ]),
          [
            statusLine[status],
            Option.match(error, { onNone: () => '', onSome: ({ message }) => `: ${message}` }),
            Option.contains(PostEditor.resumed(model), 'Lost')
              ? ' A draft was here that no longer fits this form; what is published is shown.'
              : '',
          ],
        ),
      ]),
      ...(loaded
        ? [
            // The form's own submit is the publish: publishing submits the form, so
            // its rules and checks decide, and an invalid form publishes nothing.
            EditorSlot.view(model, h, {
              words: { submit: 'Publish' },
              // What the server's `allow` would refuse this chair is not offered.
              submits: PostEditor.may(model, 'publish'),
            }),
            h.div(slots.toolbar.attrs(), [
              ...(PostEditor.may(model, 'schedule')
                ? [
                    h.input(
                      slots.search.attrs([
                        h.Id('at'),
                        h.Type('datetime-local'),
                        h.AriaLabel('Publish at'),
                        h.Value(model.scheduleAt),
                        h.OnInput(text => Message.TypedSchedule({ text })),
                        h.Style({ width: 'auto' }),
                      ]),
                    ),
                    button(
                      'schedule',
                      'Schedule',
                      ask(
                        Editor.Message.ScheduleAsked({
                          at: Number.isNaN(at.getTime()) ? '' : at.toISOString(),
                        }),
                      ),
                      !Number.isNaN(at.getTime()),
                    ),
                  ]
                : []),
              ...(!PostEditor.may(model, 'unschedule') ||
              !Option.exists(state, known => known.schedule !== null)
                ? []
                : [button('unschedule', 'Unschedule', ask(Editor.Message.UnscheduleAsked()))]),
              ...(PostEditor.canPreview
                ? [
                    PostEditor.previewing(model)
                      ? button('preview', 'Stop previewing', ask(Editor.Message.PreviewHidden()))
                      : button('preview', 'Preview', ask(Editor.Message.PreviewShown())),
                  ]
                : []),
              button('discard', 'Discard draft', ask(Editor.Message.DiscardAsked())),
              ...(PostEditor.may(model, 'unpublish') && stateIs(state, 'Published', 'Changed')
                ? [button('unpublish', 'Unpublish', ask(Editor.Message.UnpublishAsked()))]
                : []),
              stateIs(state, 'Archived')
                ? button('unarchive', 'Unarchive', ask(Editor.Message.UnarchiveAsked()))
                : h.button(
                    slots.danger.attrs([
                      h.Id('archive'),
                      h.OnClick(ask(Editor.Message.ArchiveAsked())),
                    ]),
                    ['Archive'],
                  ),
              ...(status === 'Conflict'
                ? [
                    button('reload', 'Take theirs', ask(Editor.Message.ReloadAsked())),
                    button('overwrite', 'Keep mine', ask(Editor.Message.OverwriteAsked())),
                  ]
                : []),
              button('close', 'Close', Message.ClosedEditor()),
            ]),
          ]
        : [button('close', 'Close', Message.ClosedEditor())]),
    ]),
    ...(loaded ? [preview(model, slots, h), historyPane(model, slots, h)] : []),
  ])
}

export const view = SlotView.define(AdminSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
  shell(
    slots,
    h,
    'posts',
    chair === 'visitor'
      ? [
          h.section(slots.panel.attrs(), [
            h.p(slots.muted.attrs(), [
              'A visitor reads the site. Choose a writer or an editor above to write.',
            ]),
            h.a(slots.primary.attrs([h.Href('/site?as=visitor')]), ['Go to the site']),
          ]),
        ]
      : [h.div(slots.workspace.attrs(), [worklist(model, slots, h), editor(model, slots, h)])],
  ),
).pipe(Style.attach(AdminStyle))
