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
