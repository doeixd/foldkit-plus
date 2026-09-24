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
RichText.apply({ document, selection: null }, [
  { type: 'AddMark', node: text.id, mark: 'Italic' },
  { type: 'RemoveMark', node: text.id, mark: 'Bold' },
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
// Unknown marks are authoring-permissive; findUnknownMarks gates publishing.
RichText.Text.make({ type: 'Text', id, text: '', marks: ['Highlight'] })
// @ts-expect-error Numeric offsets require explicit boundary affinity.
const position: RichText.Position = { node: id, offset: 0 }
// @ts-expect-error Insertion cannot target a bare offset.
const operation: RichText.Operation = { type: 'InsertText', at: 0, text: 'x' }
// @ts-expect-error Mark edits target a text node, not a bare offset.
const markOperation: RichText.Operation = { type: 'AddMark', at: 0, mark: 'Bold' }
// @ts-expect-error A mark is a name or a value with props, not a number.
const badMark: RichText.Operation = { type: 'AddMark', node: id, mark: 42 }
void [rawId, position, operation, markOperation, badMark]

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

const built = RichText.Edit.addMark(reference, 'Italic')
const builtMark: RichText.RunMark = built.mark
const builtOperation: RichText.Operation = built
const Link = RichText.mark('Link', { Props: Schema.Struct({ href: Schema.String }) })
// A definition with props builds a value; a bare name is a mark without props.
const withProps: RichText.Operation = RichText.Edit.addMark(reference, Link.of({ href: '/docs' }))
const byName: RichText.Operation = RichText.Edit.addMark(reference, 'Highlight')
// @ts-expect-error The href must be a string.
Link.of({ href: 42 })
void [withProps, byName]
RichText.apply({ document, selection: null }, [
  RichText.Edit.insertText(reference.at(0, 'after'), '!'),
  RichText.Edit.deleteText(text.id, 0, 1),
  built,
  RichText.Edit.removeMark(text.id, 'Bold'),
  RichText.Edit.setSelection(null),
])
// @ts-expect-error AddMark operations carry no text.
void built.text
// @ts-expect-error Targets are ids or references.
RichText.Edit.removeMark(42, 'Bold')
void builtMark
void builtOperation

const tightLimits: RichText.DocumentLimits = { maxBlocks: 2, maxTextRuns: 2, maxTextLength: 8 }
RichText.decodeDocument(document, tightLimits)
RichText.decodeDocument(document, { ...RichText.DefaultDocumentLimits, maxBlocks: 1 })
void tightLimits

const split = RichText.Edit.splitBlock(reference, reference, 0, 'next', RichText.NodeId.make('run'))
const splitBlock: RichText.NodeId = split.blockId
RichText.apply({ document, selection: null }, [split])
// @ts-expect-error Split ids cannot be numbers.
RichText.Edit.splitBlock(reference, reference, 0, 7, 'run')
void splitBlock

const splitRun = RichText.Edit.splitRun(reference, 1, 'tail')
const splitTextId: RichText.NodeId = splitRun.textId
RichText.apply({ document, selection: null }, [splitRun])
// @ts-expect-error New run ids cannot be numbers.
RichText.Edit.splitRun(reference, 1, 7)
void splitTextId

const joined = RichText.Edit.joinBlocks(reference, reference)
const joinedInto: RichText.NodeId = joined.into
RichText.apply({ document, selection: null }, [joined])
// @ts-expect-error Join targets are ids or references.
RichText.Edit.joinBlocks('a', 'b')
void joinedInto

const moved = RichText.Edit.moveBlock(reference, 0)
const movedNode: RichText.NodeId = moved.node
const leveled = RichText.Edit.setNodeProps(reference, 1)
const leveledNode: RichText.NodeId = leveled.node
RichText.apply({ document, selection: null }, [moved, leveled])
// @ts-expect-error Heading levels are 1 through 6.
RichText.Edit.setNodeProps(reference, 7)
void [movedNode, leveledNode]

const inserted = RichText.Edit.insertBlock(paragraph, 0)
const insertedBlock: RichText.Block = inserted.block
const removed = RichText.Edit.deleteBlock(reference)
const removedNode: RichText.NodeId = removed.node
RichText.apply({ document, selection: null }, [inserted, removed])
// @ts-expect-error Insert positions are numbers.
RichText.Edit.insertBlock(paragraph, '0')
void [insertedBlock, removedNode]

const boldDef: RichText.MarkDef = RichText.Bold
const expansion: RichText.MarkExpansion = boldDef.expand
const resolved: RichText.Position = RichText.resolveInsertion(document, referencePosition)
const markSet: boolean = RichText.sameMarkSet([{ name: 'Bold' }], [{ name: 'Bold' }])
// @ts-expect-error Expansions are before, after, both, or none.
const badDef: RichText.MarkDef = { name: 'Bold', expand: 'sideways' }
void [expansion, resolved, markSet, badDef]
