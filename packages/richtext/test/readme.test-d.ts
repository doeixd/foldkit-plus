import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'

const Text = RichText.Node.make('text-1')
const paragraph = RichText.Paragraph.make({
  type: 'Paragraph',
  id: RichText.NodeId.make('paragraph-1'),
  children: [
    RichText.Text.make({
      type: 'Text',
      id: Text.id,
      text: 'Hello',
      marks: ['Bold'],
    }),
  ],
})
const document = RichText.Document.make({ version: 1, children: [paragraph] })
const result = RichText.apply({ document, selection: null }, [
  RichText.Edit.insertText(Text.at(5, 'after'), '!'),
])

if (result.ok) {
  // The parent reducer installs result.state in its Model.
  const editedDocument = result.state.document
  void editedDocument
}

// The README's mark-definition example: a Kit declares the vocabulary, including
// a mark that carries props, and the command layer may add what it declares.
const Link = RichText.mark('Link', {
  Props: Schema.Struct({ href: Schema.String }),
  expand: 'none',
})
const ArticleKit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading')],
  marks: [RichText.Bold, RichText.Italic, RichText.Code, Link],
})
const marked: RichText.Operation = RichText.Edit.addMark(Text.id, Link.of({ href: '/docs' }))
RichText.run(
  { document, selection: null },
  { type: 'ToggleMark', mark: Link.of({ href: '/docs' }) },
  { mint: () => 'm' },
  { marks: RichText.markRegistry(ArticleKit.marks) },
)
void marked
