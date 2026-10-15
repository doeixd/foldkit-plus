/**
 * Footnotes: a reference in the text and a definition at the end of the document, tied by a
 * label. The reference is a mark on the run that shows the label, so it moves, splits and undoes
 * with the text; the definition is a block holding blocks, so its note is ordinary editable text.
 * Nothing else ties them: a definition no reference names, or a reference with no definition, is
 * what `footnotesOf` reports, not an invalid document.
 */
import { Schema } from 'effect'
import {
  blockContent,
  eachBlock,
  markName,
  rangeStart,
  type Block,
  type Document,
  type NodeId,
  type Selection,
  type Text,
} from './document.js'
import { node } from './kit.js'
import { mark, markProps } from './marks.js'

const Label = Schema.Struct({ label: Schema.String })

/** Where a footnote is referred to: the run showing its label carries this mark. */
export const FootnoteRef = mark('FootnoteRef', { Props: Label, expand: 'none' })

/** A footnote's note, under the label its references carry. */
export const FootnoteDefinition = node('FootnoteDefinition', {
  Props: Label,
  children: blockContent,
})

/** One footnote: its label, its definition if there is one, and the runs that refer to it. */
export interface Footnote {
  readonly label: string
  readonly definition: NodeId | undefined
  /** The runs carrying its reference, in document order. */
  readonly references: ReadonlyArray<NodeId>
  /** The definition's text, one line per block. */
  readonly text: string
}

const labelOf = (props: unknown): string | undefined => {
  if (typeof props !== 'object' || props === null || !('label' in props)) return undefined
  return typeof props.label === 'string' ? props.label : undefined
}

/** The label of the footnote a run refers to, if it carries a reference. */
export const referenceLabel = (run: Text): string | undefined => {
  const reference = run.marks.find(each => markName(each) === FootnoteRef.name)
  return reference === undefined ? undefined : labelOf(markProps(reference))
}

const textOf = (blocks: ReadonlyArray<Block>): string => {
  const lines: Array<string> = []
  eachBlock(blocks, block => {
    if (block.children.length > 0) lines.push(block.children.map(run => run.text).join(''))
  })
  return lines.join('\n')
}

/**
 * Every footnote, in the order its first reference appears; a definition nothing refers to comes
 * after them, in document order.
 */
export const footnotesOf = (document: Document): ReadonlyArray<Footnote> => {
  const references = new Map<string, Array<NodeId>>()
  const definitions = new Map<string, { node: NodeId; text: string }>()
  eachBlock(document.children, block => {
    if (block.type === 'Node' && block.kind === FootnoteDefinition.name) {
      const label = labelOf(block.props)
      if (label !== undefined && !definitions.has(label)) {
        definitions.set(label, { node: block.id, text: textOf(block.blocks ?? []) })
      }
    }
    for (const run of block.children) {
      const label = referenceLabel(run)
      if (label === undefined) continue
      const held = references.get(label)
      if (held === undefined) references.set(label, [run.id])
      else held.push(run.id)
    }
  })
  const labels = [...references.keys(), ...[...definitions.keys()].filter(l => !references.has(l))]
  return labels.map(label => ({
    label,
    definition: definitions.get(label)?.node,
    references: references.get(label) ?? [],
    text: definitions.get(label)?.text ?? '',
  }))
}

/** The label of the footnote whose reference the selection starts in. */
export const footnoteAt = (document: Document, selection: Selection | null): string | undefined => {
  if (selection?.type !== 'Range') return undefined
  const start = rangeStart(document, selection)
  if (start === undefined) return undefined
  let found: string | undefined
  eachBlock(document.children, block => {
    const run = block.children.find(each => each.id === start.node)
    if (run !== undefined) found = referenceLabel(run)
  })
  return found
}

/** The smallest whole number no footnote uses as its label, as text: the next note's label. */
export const nextFootnoteLabel = (document: Document): string => {
  const used = new Set(footnotesOf(document).map(each => each.label))
  let n = 1
  while (used.has(String(n))) n++
  return String(n)
}
