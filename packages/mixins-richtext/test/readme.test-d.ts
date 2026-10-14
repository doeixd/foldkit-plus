/**
 * The README's table and code toolbar snippet, type-checked so it cannot drift from the API.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'
import { blockAnchor } from 'foldkit-richtext-dom/toolbar'
import { codeToolbar, tableToolbar } from 'foldkit-mixins-richtext'

const Message = defineMessageUnion({
  GotEditor: { message: EditorMessage },
  CopiedCode: { node: RichText.NodeId },
})
type Message = typeof Message.Type
const edited = (message: EditorEvent): Message => Message.GotEditor({ message })

declare const model: {
  readonly document: RichText.Document
  readonly editor: { readonly selection: RichText.Selection | null }
}
declare const code: RichText.Block
declare const h: HtmlBuilder<Message>

const table = RichText.tableAt(model.document, model.editor.selection)

export const toolbar: Html =
  table === undefined
    ? h.empty
    : h.div(
        [
          h.Key(table.table.id),
          h.OnMount(blockAnchor({ hostId: 'body', node: table.table.id, gap: 6, side: 'above' })),
        ],
        [
          tableToolbar<Message>()(
            { document: model.document, selection: model.editor.selection, wrap: edited },
            h,
          ),
        ],
      )

export const codeTools: Html = codeToolbar<Message>()(
  {
    document: model.document,
    node: code.id,
    languages: [
      { id: 'typescript', label: 'TypeScript' },
      { id: '', label: 'Plain text' },
    ],
    wrap: edited,
    copied: Message.CopiedCode({ node: code.id }),
  },
  h,
)
