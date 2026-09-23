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
  {
    type: 'InsertText',
    at: Text.at(5, 'after'),
    text: '!',
  },
])

if (result.ok) {
  // The parent reducer installs result.state in its Model.
  const editedDocument = result.state.document
  void editedDocument
}
