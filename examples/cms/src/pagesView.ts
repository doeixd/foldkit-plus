/**
 * The page editor in the browser: the site's pages to open one from, and the
 * page form with the Builder in it. The address says which page is open and
 * which Block is selected (`?page=…&block=…`), so a link opens the editor on a
 * Block; `pageApp.ts` reads it and writes it back.
 */
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Message, PageEditor, sitePages, view as editorView, type Model } from './pageApp.js'
import { chairOf } from './transport.js'
import { SlotView, Style } from 'foldkit-mixins'
import { PageSlots, PagesPageStyle } from './style.js'
import { chairsNav, statusLine } from './view.js'

const chair = chairOf(window.location.search)

const pageList = (model: Model, h: HtmlBuilder<Message>): Html => {
  const read = sitePages.read(model)
  const pages = read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.items : []
  const open = PageEditor.entry(model)
  return h.section(
    [h.Id('pages')],
    [
      h.h2([], ['Pages']),
      h.button([h.Id('new'), h.OnClick(Message.AskedForPage())], ['New page']),
      pages.length === 0
        ? h.p([h.Class('muted')], [read._tag === 'Loading' ? 'Loading…' : 'Nothing yet.'])
        : h.ul(
            [],
            pages.map(page =>
              h.li(
                [],
                [
                  h.button(
                    [
                      h.OnClick(Message.OpenedEntry({ entry: page.id })),
                      ...(page.id === open ? [h.AriaCurrent('page')] : []),
                    ],
                    [page.label === '' ? 'Untitled page' : page.label],
                  ),
                ],
              ),
            ),
          ),
    ],
  )
}

const editor = (model: Model, h: HtmlBuilder<Message>): Html => {
  const status = PageEditor.status(model)
  if (status === 'Closed') return h.p([h.Class('muted')], ['Choose a page, or start one.'])
  const error = PageEditor.error(model)
  return h.section(
    [h.Id('editor')],
    [
      h.p(
        [h.Id('status'), h.Role('status')],
        [statusLine[status], error === undefined ? '' : `: ${error.message}`],
      ),
      ...(['Loading', 'NotFound', 'LoadFailed'].includes(status) ? [] : [editorView(model, h)]),
      h.button([h.Id('close'), h.OnClick(Message.ClosedEditor())], ['Close']),
    ],
  )
}

const Page = SlotView.define(PageSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
  h.main(slots.root.attrs(), [
    h.h1([], ['A small CMS: pages']),
    chairsNav(h),
    ...(chair === 'visitor'
      ? [h.p([h.Class('muted')], ['A visitor reads the site; pages are edited by its authors.'])]
      : [pageList(model, h), editor(model, h)]),
  ]),
).pipe(Style.attach(PagesPageStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Pages · A small CMS',
  body: Page(model, h),
})
