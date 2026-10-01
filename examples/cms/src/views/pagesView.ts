/**
 * The page editor in the browser: the site's pages to open one from, and, with
 * one open, the editor across the screen: a bar with the way back, where the
 * page stands and Publish, then its title and address, then the Builder. The
 * address says which page is open and which Block is selected
 * (`?page=…&block=…`), so a link opens the editor on a Block; `pageApp.ts`
 * reads it and writes it back.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Cms } from 'foldkit-cms'
import { SlotView, Style } from 'foldkit-mixins'
import { Empty, Failure, Loading } from 'foldkit-mixins-crud'
import {
  Editor,
  Message,
  PageEditor,
  pageView,
  revisions,
  sitePages,
  view as editorView,
  type Model,
} from '../apps/pageApp.js'
import { icon } from './icons.js'
import { chair, editorBar, failed, publisherOf, shell, stateIs, statusLine } from './shell.js'
import { pageHref } from '../content/site.js'
import { PageForm } from '../content/pageDomain.js'
import { AdminSlots, AdminStyle } from '../styles/adminStyle.js'

type Slots = SlotView.SlotBuilders<typeof AdminSlots, Message>

/**
 * The pages as a list of rows, not a table: ListView draws table/thead/tbody
 * only, so adopting it would change the markup contract, not just the style.
 */
const pageList = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const read = sitePages.read(model)
  const pages = read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.items : []
  return h.div(slots.screen.attrs([h.Id('pages')]), [
    h.header(slots.screenHead.attrs(), [
      h.div(
        [],
        [
          h.h1(slots.screenTitle.attrs(), ['Pages']),
          h.p(slots.muted.attrs(), [
            'Build the site’s pages from blocks: the home page, the about page, anything.',
          ]),
        ],
      ),
      h.button(slots.primary.attrs([h.Id('new'), h.OnClick(Message.AskedForPage())]), [
        icon(h, 'plus'),
        'New page',
      ]),
    ]),
    pages.length === 0
      ? read._tag === 'Ready' || read._tag === 'Refreshing'
        ? Empty.view(slots.muted, h, 'Nothing yet.')
        : read._tag === 'Failed'
          ? Failure.view(slots.muted, h, 'The pages could not be read.')
          : read._tag === 'NotFound'
            ? Empty.view(slots.muted, h, 'Nothing yet.')
            : Loading.view(slots.muted, h, 'Loading…')
      : h.ul(
          slots.list.attrs(),
          pages.map(page =>
            h.li(
              [],
              [
                h.button(
                  slots.listButton.attrs([h.OnClick(Message.OpenedEntry({ entry: page.id }))]),
                  [
                    icon(h, 'pages'),
                    h.span([], [page.label === '' ? 'Untitled page' : page.label]),
                    Cms.stateBadge(slots.badge, h, Option.some(page.state)),
                  ],
                ),
              ],
            ),
          ),
        ),
  ])
}

const editor = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const status = PageEditor.status(model)
  const error = PageEditor.error(model)
  const state = PageEditor.state(model)
  const loaded = !['Loading', 'NotFound', 'LoadFailed'].includes(status)
  const published = stateIs(state, 'Published')
  // Publishing submits the form, so while its checks fail the bar's Publish is
  // disabled rather than refusing after the click; the submit stays the enforcer.
  const submittable = PageForm.canSubmit(model.editor.form)
  // The page's address on the site, once it is shown there.
  const live = Option.flatMap(
    Option.filter(PageEditor.pageId(model), () => stateIs(state, 'Published', 'Changed')),
    id => {
      const read = pageView(id).read(model)
      return read._tag === 'Ready' || read._tag === 'Refreshing'
        ? Option.some(read.value.slug)
        : Option.none()
    },
  )
  return h.div(slots.editorScreen.attrs([h.Id('editor')]), [
    editorBar(slots, h, {
      closeLabel: 'Pages',
      close: Message.ClosedEditor(),
      status,
      state,
      error,
      actions: [
        ...Option.match(live, {
          onNone: () => [],
          onSome: slug => [
            h.a(slots.ghost.attrs([h.Href(`${pageHref(slug)}?as=${chair}`)]), [
              icon(h, 'external', 14),
              'View on site',
            ]),
          ],
        }),
        // Publishing submits the form, so the page's own checks decide. Drawn only when
        // there is something to publish: the badge already says it is live.
        ...(loaded && PageEditor.may(model, 'publish') && !published && !stateIs(state, 'Archived')
          ? [
              h.button(
                slots.primary.attrs([
                  h.Id('publish'),
                  h.OnClick(Message.GotEditorMessage({ message: Editor.Message.PublishAsked() })),
                  h.Disabled(!submittable),
                  ...(submittable ? [] : [h.Title('Fill in what is marked before publishing')]),
                ]),
                ['Publish'],
              ),
            ]
          : []),
      ],
    }),
    // Folded until asked for: the page being built keeps the room. A page never
    // saved has no history and nothing to put away.
    ...(loaded && Option.isSome(state)
      ? [
          h.details(slots.manage.attrs([h.Id('manage')]), [
            h.summary(slots.manageSummary.attrs(), [
              'History and more',
              h.span(slots.manageHint.attrs(), ['Revisions, unpublish and archive']),
            ]),
            h.div(slots.manageCards.attrs(), [
              Cms.historyCard(slots, h, Cms.revisionsOf(model, revisions), {
                state,
                restore: revision => ask(Editor.Message.RestoreAsked({ revision })),
                authorName: publisherOf,
                // A history that failed to read is asked for again the same way
                // a failed entry is: `ReloadAsked` refreshes every active read.
                onRetry: ask(Editor.Message.ReloadAsked()),
              }),
              ...Cms.moreCard(slots, h, {
                state,
                may: transition => PageEditor.may(model, transition),
                asks: {
                  discard: ask(Editor.Message.DiscardAsked()),
                  unpublish: ask(Editor.Message.UnpublishAsked()),
                  archive: ask(Editor.Message.ArchiveAsked()),
                  unarchive: ask(Editor.Message.UnarchiveAsked()),
                },
                archiveIcon: icon(h, 'archive', 14),
              }),
            ]),
          ]),
        ]
      : []),
    h.div(
      slots.workbench.attrs(),
      loaded
        ? [editorView(model, h)]
        : [
            // What the editor has not opened yet: loading, failed, or missing.
            // A read that failed offers to ask again: `ReloadAsked` refreshes
            // the entry, its draft and its row, which is what `LoadFailed` means.
            status === 'Loading'
              ? Loading.view(slots.muted, h, statusLine[status])
              : failed(status)
                ? Failure.view(slots.muted, h, statusLine[status])
                : Empty.view(slots.muted, h, statusLine[status]),
            ...(status === 'LoadFailed'
              ? [
                  h.div(slots.toolbar.attrs(), [
                    h.button(
                      slots.button.attrs([
                        h.Id('retry'),
                        h.Type('button'),
                        h.OnClick(ask(Editor.Message.ReloadAsked())),
                      ]),
                      ['Try again'],
                    ),
                  ]),
                ]
              : []),
          ],
    ),
  ])
}

const ask = (message: typeof Editor.Message.Type) => Message.GotEditorMessage({ message })

/** The studio's pages shell, for a parent drawing it as a submodel. */
export const Page = SlotView.define(AdminSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
  shell(
    slots,
    h,
    'pages',
    chair === 'visitor'
      ? [
          h.div(slots.screen.attrs(), [
            h.h1(slots.screenTitle.attrs(), ['Pages']),
            h.p(slots.muted.attrs(), [
              'A visitor reads the site. Choose a writer or an editor in the sidebar to build pages.',
            ]),
            h.a(slots.primary.attrs([h.Href('/site?as=visitor')]), [
              icon(h, 'site'),
              'Go to the site',
            ]),
          ]),
        ]
      : [
          PageEditor.status(model) === 'Closed'
            ? pageList(model, slots, h)
            : editor(model, slots, h),
        ],
  ),
).pipe(Style.attach(AdminStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: titleOf(model),
  body: Page(model, h),
})

export const titleOf = (_model: Model): string => 'Pages · Journal Studio'
