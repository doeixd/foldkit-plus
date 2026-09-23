import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make('paragraph')
const text = RichText.Text.make({
  type: 'Text',
  id: RichText.NodeId.make('text'),
  text: 'Hello',
  marks: ['Bold'],
})
const paragraph = RichText.Paragraph.make({ type: 'Paragraph', id, children: [text] })
const document = RichText.Document.make({ version: 1, children: [paragraph] })
RichText.apply({ document, selection: null }, [
  { type: 'InsertText', at: { node: text.id, offset: 0, affinity: 'after' }, text: '!' },
])
Schema.encodeSync(RichText.Document)(document)

// @ts-expect-error Node IDs must cross the branded constructor boundary.
const rawId: RichText.NodeId = 'raw'
// @ts-expect-error Text content cannot be a document's block.
RichText.Document.make({ version: 1, children: [text] })
// @ts-expect-error Paragraphs cannot nest inside paragraphs.
RichText.Paragraph.make({ type: 'Paragraph', id, children: [paragraph] })
// @ts-expect-error Unsupported heading level.
RichText.Heading.make({ type: 'Heading', id, level: 7, children: [] })
// @ts-expect-error Unknown marks are not supported yet.
RichText.Text.make({ type: 'Text', id, text: '', marks: ['Link'] })
// @ts-expect-error Numeric offsets require explicit boundary affinity.
const position: RichText.Position = { node: id, offset: 0 }
// @ts-expect-error Insertion cannot target a bare offset.
const operation: RichText.Operation = { type: 'InsertText', at: 0, text: 'x' }
void [rawId, position, operation]

const reference = RichText.Node.make('text')
const referenceId: RichText.NodeId = reference.id
const referencePosition: RichText.Position = reference.at(0, 'after')
const current = reference.read(document)
if (current?.type === 'Text') {
  const value: string = current.text
  void value
}
// @ts-expect-error A reference requires a string identity.
RichText.Node.make(42)
// @ts-expect-error A reference's identity cannot be reassigned.
reference.id = id
// @ts-expect-error Affinity is explicit, as it is for a Position.
reference.at(0)
// @ts-expect-error Offsets are numbers.
reference.at('0', 'after')
// @ts-expect-error A reference may resolve to a block, text, or no node.
const textValue: string = current.text
void [referenceId, referencePosition, textValue]
