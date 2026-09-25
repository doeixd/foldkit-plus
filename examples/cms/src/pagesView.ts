/**
 * The page editor in the browser: the site's pages to open one from, and the
 * page form with the Builder in it, at full width. The address says which page
 * is open and which Block is selected (`?page=…&block=…`), so a link opens the
 * editor on a Block; `pageApp.ts` reads it and writes it back.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'
import {
  Message,
  PageEditor,
  pageView,
  sitePages,
  view as editorView,
  type Model,
} from './pageApp.js'
import { badge, chair, failed, shell, stateIs, statusLine } from './shell.js'
import { pageHref } from './site.js'
import { AdminSlots, AdminStyle } from './style.js'

type Slots = SlotView.SlotBuilders<typeof AdminSlots, Message>

const pageList = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const read = sitePages.read(model)
  const pages = read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.items : []
  return h.section(slots.panel.attrs([h.Id('pages')]), [
    h.div(slots.panelHead.attrs(), [
      h.h2(slots.panelTitle.attrs(), ['Pages']),
      h.button(slots.primary.attrs([h.Id('new'), h.OnClick(Message.AskedForPage())]), ['New page']),
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
  return h.section(slots.panel.attrs([h.Id('editor')]), [
    h.div(slots.panelHead.attrs(), [
      h.div(slots.toolbar.attrs(), [
        h.button(slots.button.attrs([h.Id('close'), h.OnClick(Message.ClosedEditor())]), [
          '← All pages',
        ]),
        h.h2(slots.panelTitle.attrs(), ['Edit page']),
        badge(slots, h, state),
      ]),
      h.div(slots.toolbar.attrs(), [
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
        ...Option.match(live, {
          onNone: () => [],
          onSome: slug => [
            h.a(slots.button.attrs([h.Href(`${pageHref(slug)}?as=${chair}`)]), ['View on site ↗']),
          ],
        }),
      ]),
    ]),
    ...(['Loading', 'NotFound', 'LoadFailed'].includes(status) ? [] : [editorView(model, h)]),
  ])
}

const Page = SlotView.define(AdminSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
  shell(
    slots,
    h,
    'pages',
    chair === 'visitor'
      ? [
          h.section(slots.panel.attrs(), [
            h.p(slots.muted.attrs(), [
              'A visitor reads the site. Choose a writer or an editor above to build pages.',
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
