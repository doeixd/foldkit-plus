/**
 * The posts, in the browser. With nothing open, the list: a heading, the active
 * posts or the archive, and a search. With a post open, the editor fills the
 * screen: a bar with the way back, where the post stands and Publish; the page
 * to write on; and beside it the post's settings, schedule and history. A
 * visitor is sent to the site.
 *
 * The form is `foldkit-mixins-form`'s and the table `foldkit-mixins-crud`'s, each
 * with the CMS's renderers beside its own. What is here is the layout, the
 * words, and which of the CMS's transitions this reader is offered.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Cms } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import type { Selected } from 'foldkit-entity'
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
import { PostForm, type PostPreview } from './domain.js'
import { icon } from './icons.js'
import {
  badge,
  chair,
  failed,
  historyCard,
  intro,
  moreCard,
  shell,
  stateIs,
  statusLine,
  type RevisionRow,
} from './shell.js'
import { article, postHref } from './site.js'
import { AdminSlots, AdminStyle, ListStyle, SiteSlots, SiteStyle } from './style.js'

type Slots = SlotView.SlotBuilders<typeof AdminSlots, Message>

const ask = (message: typeof Editor.Message.Type) => Message.GotEditorMessage({ message })

const WorklistTable = ListView.forMessages<Message>()
  .define(WorklistList)
  .pipe(Style.attach(ListStyle))

// --- the list ---------------------------------------------------------------------

const list = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const tab = (label: string, archive: boolean): Html =>
    h.button(
      slots.tab.attrs([
        h.AriaPressed(String(model.archived === archive)),
        ...(model.archived === archive ? [] : [h.OnClick(Message.ToggledArchive())]),
      ]),
      [label],
    )
  return h.div(slots.screen.attrs([h.Id('worklist')]), [
    h.header(slots.screenHead.attrs(), [
      h.div(
        [],
        [
          h.h1(slots.screenTitle.attrs(), ['Posts']),
          h.p(slots.muted.attrs(), ['Write, schedule and publish the journal’s posts.']),
        ],
      ),
      h.button(slots.primary.attrs([h.Id('new'), h.OnClick(Message.AskedForPost())]), [
        icon(h, 'plus'),
        'New post',
      ]),
    ]),
    intro(slots, h),
    h.div(slots.filters.attrs(), [
      h.div(slots.tabs.attrs([h.Role('group'), h.AriaLabel('Which posts')]), [
        tab('Active', false),
        tab('Archive', true),
      ]),
      h.label(slots.searchBox.attrs(), [
        icon(h, 'search'),
        h.input(
          slots.search.attrs([
            h.Type('search'),
            h.Placeholder('Search posts'),
            h.AriaLabel('Search posts'),
            h.Value(model.search),
            h.OnInput(text => Message.Searched({ text })),
          ]),
        ),
      ]),
    ]),
    WorklistTable(
      {
        page: Worklist.page(model),
        onOpen: row => Message.OpenedEntry({ entry: row.id }),
        renderers: Cms.displayRenderers(),
        words: {
          empty:
            model.search !== ''
              ? 'No post matches that.'
              : model.archived
                ? 'Nothing is archived.'
                : 'Nothing yet. Start a post.',
        },
      },
      h,
    ),
  ])
}

// --- the editor -------------------------------------------------------------------

/** The post as its page will read: the site's own article, in the site's look. */
const Preview = SlotView.define(
  SiteSlots,
  (post: Selected<typeof PostPreview>, slots, h: HtmlBuilder<Message>) =>
    article({ slots, h, post, publishedAt: Option.none(), after: [] }),
).pipe(Style.attach(SiteStyle))

const previewing = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const post = Option.flatMap(PostEditor.pageId(model), id => {
    const read = postPage(id).read(model)
    return read._tag === 'Ready' || read._tag === 'Refreshing'
      ? Option.some(read.value)
      : Option.none()
  })
  return Option.match(post, {
    onNone: () => h.p(slots.muted.attrs(), ['There is nothing to preview yet: write a title.']),
    onSome: post => h.div(slots.preview.attrs(), [Preview(post, h)]),
  })
}

/** The open post's published revisions, as they have been read. */
const revisionsOf = (model: Model): ReadonlyArray<RevisionRow> =>
  Option.match(history(model), {
    onNone: () => [],
    onSome: projection => {
      const read = projection.read(model)
      return read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.revisions : []
    },
  })

const editor = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const status = PostEditor.status(model)
  const state = PostEditor.state(model)
  const error = PostEditor.error(model)
  const loaded = !['Loading', 'NotFound', 'LoadFailed'].includes(status)
  const may = (transition: Parameters<typeof PostEditor.may>[1]) =>
    PostEditor.may(model, transition)
  const live = stateIs(state, 'Published')
  const at = new Date(model.scheduleAt)
  const action = (id: string, label: string, message: Message, enabled = true): Html =>
    h.button(slots.button.attrs([h.Id(id), h.OnClick(message), h.Disabled(!enabled)]), [label])
  // Where the post is read once it is on the site.
  const address = Option.flatMap(PostEditor.pageId(model), id => {
    const read = postPage(id).read(model)
    return read._tag === 'Ready' || read._tag === 'Refreshing'
      ? Option.some(read.value.slug)
      : Option.none()
  })

  const bar = h.div(slots.editorBar.attrs(), [
    h.button(slots.ghost.attrs([h.Id('close'), h.OnClick(Message.ClosedEditor())]), [
      icon(h, 'back'),
      'Posts',
    ]),
    badge(slots, h, state),
    h.p(
      slots.status.attrs([
        h.Id('status'),
        h.Role('status'),
        ...(failed(status) ? [h.DataAttribute('tone', 'error')] : []),
      ]),
      [
        statusLine[status],
        Option.match(error, { onNone: () => '', onSome: ({ message }) => `: ${message}` }),
      ],
    ),
    h.div(slots.barActions.attrs(), [
      ...(loaded && PostEditor.canPreview
        ? [
            h.button(
              slots.ghost.attrs([
                h.Id('preview'),
                h.AriaPressed(String(PostEditor.previewing(model))),
                h.OnClick(
                  ask(
                    PostEditor.previewing(model)
                      ? Editor.Message.PreviewHidden()
                      : Editor.Message.PreviewShown(),
                  ),
                ),
              ]),
              [icon(h, 'eye'), 'Preview'],
            ),
          ]
        : []),
      // Publishing submits the form, so its rules and checks decide. Drawn only when
      // there is something to publish: the badge already says it is live, and an
      // archived post is unarchived first, from the aside.
      ...(loaded && may('publish') && !live && !stateIs(state, 'Archived')
        ? [
            h.button(
              slots.primary.attrs([h.Id('publish'), h.OnClick(ask(Editor.Message.PublishAsked()))]),
              ['Publish'],
            ),
          ]
        : []),
    ]),
  ])

  if (!loaded)
    return h.div(slots.editorScreen.attrs([h.Id('editor')]), [
      bar,
      h.div(slots.canvas.attrs(), [h.p(slots.muted.attrs(), [statusLine[status]])]),
    ])

  const scheduled = Option.exists(state, known => known.schedule !== null)
  return h.div(slots.editorScreen.attrs([h.Id('editor')]), [
    bar,
    h.div(slots.editorBody.attrs(), [
      h.div(slots.canvas.attrs(), [
        PostEditor.previewing(model)
          ? previewing(model, slots, h)
          : EditorSlot.view(model, h, {
              words: { submit: 'Publish' },
              // Published from the bar; the form draws no button of its own.
              submits: false,
            }),
      ]),
      h.aside(slots.aside.attrs([h.AriaLabel('Post settings')]), [
        ...(status === 'Conflict'
          ? [
              h.section(slots.card.attrs(), [
                h.h2(slots.cardTitle.attrs(), ['Saved elsewhere']),
                h.p(slots.muted.attrs(), [
                  'Someone saved this post since you opened it. Keep your version, or take theirs.',
                ]),
                h.div(slots.toolbar.attrs(), [
                  action('overwrite', 'Keep mine', ask(Editor.Message.OverwriteAsked())),
                  action('reload', 'Take theirs', ask(Editor.Message.ReloadAsked())),
                ]),
              ]),
            ]
          : []),
        h.section(slots.card.attrs(), [
          h.h2(slots.cardTitle.attrs(), ['Publishing']),
          ...Option.match(
            Option.filter(address, () => stateIs(state, 'Published', 'Changed')),
            {
              onNone: () => [h.p(slots.muted.attrs(), ['Not on the site yet.'])],
              onSome: slug => [
                h.a(slots.ghost.attrs([h.Href(`${postHref(slug)}?as=${chair}`)]), [
                  icon(h, 'external', 14),
                  `/blog/${slug}`,
                ]),
              ],
            },
          ),
          // A writer cannot publish: say who can, rather than leave the button
          // missing. A post not yet saved has no permissions to read.
          ...(Option.isNone(state) || may('publish')
            ? []
            : [h.p(slots.muted.attrs(), ['An editor publishes it when it is ready.'])]),
          // Put away, it is brought back before anything else: say how, rather than
          // offer a publish that would be refused.
          ...(stateIs(state, 'Archived')
            ? [h.p(slots.muted.attrs(), ['Archived. Unarchive it, below, to publish it again.'])]
            : []),
          // When it goes live, in words: the input alone did not say it was taken.
          ...Option.match(
            Option.flatMap(state, known => Option.fromNullOr(known.schedule)),
            {
              onNone: () => [],
              onSome: ({ at: when, overdue, error }) => {
                const time = new Date(when).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
                return [
                  h.p(
                    slots.status.attrs(error === null ? [] : [h.DataAttribute('tone', 'error')]),
                    [
                      error !== null
                        ? `Was to go live ${time}: ${error}`
                        : overdue
                          ? `Due since ${time}; it goes live at the next check.`
                          : `Goes live ${time}.`,
                    ],
                  ),
                ]
              },
            },
          ),
          ...(may('schedule') && !stateIs(state, 'Archived')
            ? [
                h.label(slots.muted.attrs([h.For('at')]), ['Publish later']),
                h.div(slots.toolbar.attrs(), [
                  h.input(
                    slots.search.attrs([
                      h.Id('at'),
                      h.Type('datetime-local'),
                      h.Value(model.scheduleAt),
                      h.OnInput(text => Message.TypedSchedule({ text })),
                      h.Style({ paddingInlineStart: '0.7rem' }),
                    ]),
                  ),
                  action(
                    'schedule',
                    'Schedule',
                    ask(
                      Editor.Message.ScheduleAsked({
                        at: Number.isNaN(at.getTime()) ? '' : at.toISOString(),
                      }),
                    ),
                    !Number.isNaN(at.getTime()),
                  ),
                ]),
              ]
            : []),
          ...(scheduled && may('unschedule')
            ? [action('unschedule', 'Cancel the schedule', ask(Editor.Message.UnscheduleAsked()))]
            : []),
        ]),
        historyCard(slots, h, revisionsOf(model), revision =>
          ask(Editor.Message.RestoreAsked({ revision })),
        ),
        ...moreCard(slots, h, {
          state,
          may,
          asks: {
            discard: ask(Editor.Message.DiscardAsked()),
            unpublish: ask(Editor.Message.UnpublishAsked()),
            archive: ask(Editor.Message.ArchiveAsked()),
            unarchive: ask(Editor.Message.UnarchiveAsked()),
          },
        }),
      ]),
    ]),
  ])
}

const Studio = SlotView.define(AdminSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
  shell(
    slots,
    h,
    'posts',
    chair === 'visitor'
      ? [
          h.div(slots.screen.attrs(), [
            h.h1(slots.screenTitle.attrs(), ['Posts']),
            h.p(slots.muted.attrs(), [
              'A visitor reads the site. Choose a writer or an editor in the sidebar to write.',
            ]),
            h.a(slots.primary.attrs([h.Href('/site?as=visitor')]), [
              icon(h, 'site'),
              'Go to the site',
            ]),
          ]),
        ]
      : [PostEditor.status(model) === 'Closed' ? list(model, slots, h) : editor(model, slots, h)],
  ),
).pipe(Style.attach(AdminStyle))

/** The studio's posts, titled in the tab by the post open, if one is. */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const typed = PostForm.field(model.editor.form, 'title').value
  const title =
    PostEditor.status(model) === 'Closed' || typeof typed !== 'string' || typed.trim() === ''
      ? 'Posts'
      : typed.trim()
  return { title: `${title} · Journal Studio`, body: Studio(model, h) }
}
