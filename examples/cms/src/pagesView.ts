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
import { SlotView, Style } from 'foldkit-mixins'
import {
  Editor,
  Message,
  PageEditor,
  pageView,
  sitePages,
  view as editorView,
  type Model,
} from './pageApp.js'
import { icon } from './icons.js'
import { badge, chair, failed, shell, stateIs, statusLine } from './shell.js'
import { pageHref } from './site.js'
import { AdminSlots, AdminStyle } from './style.js'

type Slots = SlotView.SlotBuilders<typeof AdminSlots, Message>

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
      ? h.p(slots.muted.attrs(), [read._tag === 'Loading' ? 'Loading…' : 'Nothing yet.'])
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
                    badge(slots, h, Option.some(page.state)),
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
    h.div(slots.editorBar.attrs(), [
      h.button(slots.ghost.attrs([h.Id('close'), h.OnClick(Message.ClosedEditor())]), [
        icon(h, 'back'),
        'Pages',
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
                ]),
                ['Publish'],
              ),
            ]
          : []),
      ]),
    ]),
    h.div(
      slots.workbench.attrs(),
      loaded ? [editorView(model, h)] : [h.p(slots.muted.attrs(), [statusLine[status]])],
    ),
  ])
}

const Page = SlotView.define(AdminSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
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
  title: 'Pages · Journal Studio',
  body: Page(model, h),
})
