import type { Document, HtmlBuilder } from 'foldkit/html'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { editorView } from 'foldkit-richtext-dom/editor-bundle'
import { print } from 'foldkit-richtext-markdown'
import * as RichText from 'foldkit-richtext'
import { editorViewOf, Message, pageOf, type Model } from './app.js'

const { Replicated } = RichText

const editorMessage = (message: EditorMessage): Message => Message.GotEditor({ message })

/** A toolbar button that sends one editor Message, as a key chord would. */
const tool = (h: HtmlBuilder<Message>, label: string, message: EditorMessage) =>
  h.button([h.Class('tool'), h.OnClick(editorMessage(message))], [label])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const open = pageOf(model, model.open)
  const trash = model.pages.filter(page => page.trashed === true)
  return {
    title: open === undefined ? 'Pages' : `${open.title} · Pages`,
    body: h.div(
      [h.Class('pages')],
      [
        h.nav(
          [h.Class('sidebar')],
          [
            h.ul(
              [h.Class('page-list')],
              model.pages
                .filter(page => page.trashed !== true)
                .map(page =>
                  h.li(
                    [h.Class(page.id === model.open ? 'page open' : 'page')],
                    [
                      h.button(
                        [h.Class('page-link'), h.OnClick(Message.OpenedPage({ id: page.id }))],
                        [page.title === '' ? 'Untitled' : page.title],
                      ),
                    ],
                  ),
                ),
            ),
            h.button(
              [h.Id('new-page'), h.OnClick(Message.AddedPage({ title: 'Untitled' }))],
              ['+ New page'],
            ),
            ...(trash.length === 0
              ? []
              : [
                  h.details(
                    [h.Class('trash')],
                    [
                      h.summary([], [`Trash (${trash.length})`]),
                      h.ul(
                        [],
                        trash.map(page =>
                          h.li(
                            [],
                            [
                              page.title === '' ? 'Untitled' : page.title,
                              h.button(
                                [
                                  h.Class('restore'),
                                  h.OnClick(Message.RestoredPage({ id: page.id })),
                                ],
                                ['Restore'],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ]),
          ],
        ),
        open === undefined
          ? h.main([h.Class('empty')], ['Open a page, or make a new one.'])
          : h.main(
              [h.Class('page-view')],
              [
                h.input([
                  h.Id('page-title'),
                  h.Class('title'),
                  h.Value(open.title),
                  h.OnInput(title => Message.RenamedPage({ id: open.id, title })),
                ]),
                h.div(
                  [h.Class('toolbar')],
                  [
                    tool(h, 'Undo', EditorMessage.Undone()),
                    tool(h, 'Redo', EditorMessage.Redone()),
                    tool(h, 'Bold', EditorMessage.ToggledMark({ mark: 'Bold' })),
                    tool(h, 'Italic', EditorMessage.ToggledMark({ mark: 'Italic' })),
                    tool(
                      h,
                      'Heading',
                      EditorMessage.RetypedBlock({ block: { type: 'Heading', level: 2 } }),
                    ),
                    tool(h, 'Text', EditorMessage.RetypedBlock({ block: { type: 'Paragraph' } })),
                    tool(
                      h,
                      'To-do',
                      EditorMessage.WrappedBlock({
                        containers: [
                          { kind: 'List', props: {} },
                          { kind: 'TaskItem', props: { checked: false } },
                        ],
                      }),
                    ),
                    h.button(
                      [h.Id('tick'), h.Class('tool'), h.OnClick(Message.ToggledTask())],
                      ['Tick'],
                    ),
                    tool(h, 'Outdent', EditorMessage.LiftedBlock()),
                    h.button(
                      [
                        h.Id('delete-page'),
                        h.Class('tool danger'),
                        h.OnClick(Message.DeletedPage({ id: open.id })),
                      ],
                      ['Delete page'],
                    ),
                  ],
                ),
                h.submodel({
                  slotId: 'editor',
                  model: editorViewOf(model, open),
                  view: editorView,
                  toParentMessage: editorMessage,
                }),
                h.details(
                  [h.Class('markdown')],
                  [
                    h.summary([], ['Markdown']),
                    h.pre([], [print(Replicated.project(open.body)).markdown]),
                  ],
                ),
              ],
            ),
      ],
    ),
  }
}
