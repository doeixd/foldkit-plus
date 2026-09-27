/**
 * The caret across a switch between the rich editor and its Markdown source (§147): where a
 * document position lands in the printed text, and where a source offset lands in a document.
 */
import * as RichText from 'foldkit-richtext'
import type { Segment } from './parse.js'
import { print } from './print.js'
import type { MarkdownStyle } from './style.js'

// A private-use character: Markdown gives it no meaning, so the printer passes it through
// wherever the text around it goes, and a document has no reason to hold one.
const MARK = String.fromCharCode(0xe000)

const markBlocks = (
  blocks: ReadonlyArray<RichText.Block>,
  at: RichText.Position,
): ReadonlyArray<RichText.Block> =>
  blocks.map((block): RichText.Block => ({
    ...block,
    children: block.children.map(run =>
      run.id === at.node
        ? { ...run, text: run.text.slice(0, at.offset) + MARK + run.text.slice(at.offset) }
        : run,
    ),
    ...(block.type === 'Node' && block.blocks !== undefined
      ? { blocks: markBlocks(block.blocks, at) }
      : {}),
  }))

/**
 * Where a position lands in `printed`, the document's Markdown in this style: the document is
 * printed again with a mark at the position, and the mark's index is the answer. Undefined when
 * the position's run is not printed, or when the text before the mark came out differently.
 */
export const offsetIn = (
  document: RichText.Document,
  printed: string,
  style: MarkdownStyle,
  position: RichText.Position,
): number | undefined => {
  const withMark = print(
    { ...document, children: markBlocks(document.children, position) },
    { style },
  ).markdown
  const at = withMark.indexOf(MARK)
  return at === -1 || withMark.slice(0, at) !== printed.slice(0, at) ? undefined : at
}

/** The index in a segment's value that a source offset falls before. */
const valueIndex = (markdown: string, segment: Segment, offset: number): number => {
  let raw = segment.start
  for (let index = 0; index < segment.value.length; index++) {
    // Source that gives the value nothing, such as an escape's backslash or a quote's `>` on a
    // later line, is passed over.
    while (raw < segment.end && markdown[raw] !== segment.value[index]) raw++
    if (raw >= offset) return index
    raw++
  }
  return segment.value.length
}

/**
 * The position a source offset names: in the text it falls in, or else at the end of the text
 * before it, or else at the start of the first. Undefined only when the source has no text.
 */
export const positionAt = (
  markdown: string,
  segments: ReadonlyArray<Segment>,
  offset: number,
): RichText.Position | undefined => {
  const segment =
    segments.find(candidate => candidate.start <= offset && offset <= candidate.end) ??
    [...segments].reverse().find(candidate => candidate.end <= offset) ??
    segments[0]
  if (segment === undefined) return undefined
  return {
    node: segment.run,
    offset: segment.at + valueIndex(markdown, segment, offset),
    affinity: 'after',
  }
}

interface TextBlock {
  readonly runs: ReadonlyArray<RichText.Text>
  readonly text: string
}

const textBlocks = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<TextBlock> =>
  blocks.flatMap(block => {
    const text = block.children.map(run => run.text).join('')
    return [
      ...(text.length === 0 ? [] : [{ runs: block.children, text }]),
      ...(block.type === 'Node' && block.blocks !== undefined ? textBlocks(block.blocks) : []),
    ]
  })

/**
 * The same place in another document whose blocks hold the same text in the same order, as a
 * document and the parse of its own printed Markdown do: by block, then by offset in the
 * block's text. Undefined when the two do not hold the same text.
 */
export const alignedIn = (
  from: RichText.Document,
  to: RichText.Document,
  position: RichText.Position,
): RichText.Position | undefined => {
  const source = textBlocks(from.children)
  const target = textBlocks(to.children)
  if (source.length !== target.length || source.some((block, i) => block.text !== target[i]!.text))
    return undefined
  for (const [index, block] of source.entries()) {
    let offset = 0
    for (const run of block.runs) {
      if (run.id === position.node) {
        offset += position.offset
        let start = 0
        for (const candidate of target[index]!.runs) {
          if (offset <= start + candidate.text.length) {
            return { node: candidate.id, offset: offset - start, affinity: 'after' }
          }
          start += candidate.text.length
        }
      }
      offset += run.text.length
    }
  }
  return undefined
}
