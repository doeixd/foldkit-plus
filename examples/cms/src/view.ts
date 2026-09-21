/**
 * The page. A visitor gets the public site and nothing else. An author gets the
 * worklist, the editor, the application's own page for the post (which is where
 * a preview shows), its history, and the public site to compare against.
 *
 * The form is `foldkit-mixins-form`'s and the table `foldkit-mixins-crud`'s, each
 * with the CMS's renderers beside its own. What is here is the status line and
 * the buttons, which are this application's to word.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Cms, type EditorStatus } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import { ListView } from 'foldkit-mixins-crud'
import {
  Editor,
  EditorSlot,
  Message,
  PostEditor,
  Site,
  Worklist,
  WorklistList,
  history,
  postPage,
  type Model,
} from './app.js'
import { chairOf, chairs } from './transport.js'

const chair = chairOf(window.location.search)
const ask = (message: typeof Editor.Message.Type) => Message.GotEditorMessage({ message })

const WorklistTable = ListView.forMessages<Message>().define(WorklistList)

const statusLine: Readonly<Record<EditorStatus, string>> = {
  Closed: '',
  Loading: 'Loading…',
  NotFound: 'That entry does not exist.',
  LoadFailed: 'The entry could not be read.',
  Opened: '',
  Editing: 'Unsaved changes…',
  Saving: 'Saving…',
  Saved: 'Draft saved.',
  Conflict: 'Someone else saved this since you opened it. Your text is still here.',
  SaveFailed: 'Not saved',
  Publishing: 'Publishing…',
  Published: 'Published.',
  PublishFailed: 'Not published',
  Scheduling: 'Scheduling…',
  Scheduled: 'Scheduled.',
  ScheduleFailed: 'Not scheduled',
}

const chairsNav = (h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.AriaLabel('Who is looking')],
    chairs.flatMap((name, at) => [
      ...(at === 0 ? [] : [h.span([h.Class('muted')], [' · '])]),
      h.a(
        [h.Href(`?as=${name}`), ...(name === chair ? [h.AriaCurrent('page')] : [])],
        [name === 'wren' ? 'Wren, a writer' : name === 'edda' ? 'Edda, an editor' : 'A visitor'],
      ),
    ]),
  )

const site = (model: Model, h: HtmlBuilder<Message>): Html => {
  const page = Site.page(model)
  const found =
    page._tag === 'Ready' || page._tag === 'Refreshing' ? page.value.items[0] : undefined
  return h.section(
    [h.Id('site')],
    [
      h.h2([], ['The public site']),
      // A row that was just published joins this connection when the query is asked
      // again, which for a visitor is loading the page.
      h.button([h.Id('look'), h.OnClick(Message.LookedAgain())], ['Look again']),
      h.label(
        [],
        [
          '/blog/',
          h.input([
            h.Id('address'),
            h.Type('text'),
            h.Value(model.visiting),
            h.OnInput(slug => Message.Visited({ slug })),
          ]),
        ],
      ),
      found === undefined
        ? h.p(
            [h.Class('muted')],
            [page._tag === 'Loading' ? 'Looking…' : '404: nothing is published here.'],
          )
        : h.article([], [h.h3([], [found.title]), h.p([], [found.body])]),
    ],
  )
}

const pagePane = (model: Model, h: HtmlBuilder<Message>): Html => {
  const id = PostEditor.pageId(model)
  const read = id === null ? undefined : postPage(id).read(model)
  const post = read?._tag === 'Ready' || read?._tag === 'Refreshing' ? read.value : undefined
  return h.section(
    [h.Id('page')],
    [
      h.h3([], [PostEditor.previewing(model) ? 'The post’s page, previewing' : 'The post’s page']),
      post === undefined
        ? h.p([h.Class('muted')], ['There is no row to read yet. Turn preview on.'])
        : h.article(
            [],
            [
              h.h4([], [post.title]),
              h.p([h.Class('muted')], [`/blog/${post.slug}`]),
              h.p([], [post.body]),
            ],
          ),
    ],
  )
}

const historyPane = (model: Model, h: HtmlBuilder<Message>): Html => {
  const read = history(model)?.read(model)
  const revisions =
    read?._tag === 'Ready' || read?._tag === 'Refreshing' ? read.value.revisions : []
  return h.section(
    [h.Id('history')],
    [
      h.h3([], ['History']),
      h.button([h.OnClick(Message.AskedForHistory())], ['Refresh']),
      revisions.length === 0
        ? h.p([h.Class('muted')], ['Nothing has been published yet.'])
        : h.ol(
            [],
            revisions.map(revision =>
              h.li(
                [],
                [
                  `Revision ${revision.n}, ${Display.show(Cms.Display.Moment.of({}), revision.publishedAt)}`,
                  revision.publishedBy === null ? '' : ` by ${revision.publishedBy} `,
                  h.button(
                    [h.OnClick(ask(Editor.Message.RestoreAsked({ revision: revision.n })))],
                    ['Restore as a draft'],
                  ),
                ],
              ),
            ),
          ),
    ],
  )
}

const editor = (model: Model, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  if (status === 'Closed') return h.p([h.Class('muted')], ['Choose an entry, or start a post.'])
  const state = PostEditor.state(model)
  const error = PostEditor.error(model)
  const loaded = !['Loading', 'NotFound', 'LoadFailed'].includes(status)
  const at = new Date(model.scheduleAt)
  const button = (id: string, label: string, message: Message, enabled = true): Html =>
    h.button([h.Id(id), h.OnClick(message), h.Disabled(!enabled)], [label])

  return h.section(
    [h.Id('editor')],
    [
      h.p(
        [h.Id('status'), h.Role('status')],
        [
          state === undefined ? '' : `${Display.show(Cms.Display.State.of({}), state)}. `,
          // The state and the status are two facts, and sometimes one word: say it once.
          state?._tag === statusLine[status]?.replace('.', '') ? '' : statusLine[status],
          error === undefined ? '' : `: ${error.message}`,
          PostEditor.resumed(model) === 'Lost'
            ? ' A draft was here that no longer fits this form; what is published is shown.'
            : '',
        ],
      ),
      ...(loaded
        ? [
            // The form's own submit is the publish: publishing submits the form, so
            // its rules and checks decide, and an invalid form publishes nothing.
            EditorSlot.view(model, h, { words: { submit: 'Publish' } }),
            h.div(
              [h.Class('actions')],
              [
                h.input([
                  h.Id('at'),
                  h.Type('datetime-local'),
                  h.AriaLabel('Publish at'),
                  h.Value(model.scheduleAt),
                  h.OnInput(text => Message.TypedSchedule({ text })),
                ]),
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
                ...(state?.schedule == null
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
                ...(state?._tag === 'Published' || state?._tag === 'Changed'
                  ? [button('unpublish', 'Unpublish', ask(Editor.Message.UnpublishAsked()))]
                  : []),
                state?._tag === 'Archived'
                  ? button('unarchive', 'Unarchive', ask(Editor.Message.UnarchiveAsked()))
                  : button('archive', 'Archive', ask(Editor.Message.ArchiveAsked())),
                ...(status === 'Conflict'
                  ? [
                      button('reload', 'Take theirs', ask(Editor.Message.ReloadAsked())),
                      button('overwrite', 'Keep mine', ask(Editor.Message.OverwriteAsked())),
                    ]
                  : []),
              ],
            ),
            pagePane(model, h),
            historyPane(model, h),
          ]
        : []),
      button('close', 'Close', Message.ClosedEditor()),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.h1([], ['A small CMS']),
      chairsNav(h),
      ...(chair === 'visitor'
        ? []
        : [
            h.section(
              [h.Id('worklist')],
              [
                h.h2([], ['Worklist']),
                h.button([h.Id('new'), h.OnClick(Message.AskedForPost())], ['New post']),
                WorklistTable(
                  {
                    page: Worklist.page(model),
                    onOpen: row => Message.OpenedEntry({ entry: row.id }),
                    renderers: Cms.displayRenderers(),
                    words: { empty: 'Nothing yet. Start a post.' },
                  },
                  h,
                ),
              ],
            ),
            editor(model, h),
          ]),
      site(model, h),
    ],
  )
