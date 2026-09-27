/**
 * The caret across a switch between the rich editor and its Markdown source (§147): where a
 * document position lands in the printed text, and where a source offset lands in a document.
 * Both directions read one correspondence, the source ranges a parse records (`Segment`), so
 * the printer's escapes, delimiters, and indentation are read back rather than predicted.
 */
import type * as RichText from 'foldkit-richtext'
import { parseMapped, type Segment } from './parse.js'

// A character reference: named, decimal, or hexadecimal. Whether it is one, rather than text
// that looks like one, is read from whether the parsed value holds it literally.
const REFERENCE = /^&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/
const PUNCTUATION = /^[!-/:-@[-`{-~]$/

/** How many UTF-16 units a reference decodes to: two for a numeric one past the BMP, else one. */
const decodedLength = (reference: string): number => {
  const numeric = /^&#([xX]?)([0-9a-fA-F]+);$/.exec(reference)
  if (numeric === null) return 1
  return Number.parseInt(numeric[2]!, numeric[1] === '' ? 10 : 16) > 0xffff ? 2 : 1
}

/**
 * The source offset of each index in a segment's value, and of its end. The raw source and the
 * decoded value are walked side by side: an escape or a character reference is one step, and
 * source that gives the value nothing (a quote's `>` or indentation on a later line) is passed
 * over.
 */
const rawIndices = (markdown: string, segment: Segment): ReadonlyArray<number> => {
  const at: Array<number> = []
  const { value, end } = segment
  let raw = segment.start
  let index = 0
  const step = (): { readonly raw: number; readonly value: number } | undefined => {
    const source = markdown[raw]
    const next = markdown[raw + 1] ?? ''
    if (source === '\\' && PUNCTUATION.test(next) && next === value[index])
      return { raw: 2, value: 1 }
    if (source === '&') {
      const reference = REFERENCE.exec(markdown.slice(raw, end))?.[0]
      if (reference !== undefined && !value.startsWith(reference, index)) {
        return { raw: reference.length, value: decodedLength(reference) }
      }
    }
    return source === value[index] ? { raw: 1, value: 1 } : undefined
  }
  while (index < value.length && raw < end) {
    const taken = step()
    if (taken === undefined) {
      raw++
      continue
    }
    for (let unit = 0; unit < taken.value; unit++) at.push(raw)
    raw += taken.raw
    index += taken.value
  }
  while (at.length <= value.length) at.push(Math.min(raw, end))
  return at
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
  const indices = rawIndices(markdown, segment)
  const index = indices.findIndex(raw => raw >= offset)
  return {
    node: segment.run,
    offset: segment.at + (index === -1 ? segment.value.length : index),
    affinity: 'after',
  }
}

/**
 * Where a document position lands in `printed`, the document's own Markdown: the position is
 * carried into a parse of that text, and the parse's source ranges give its offset. Undefined
 * when it cannot be carried (the position's block holds no text, or the printed text has a
 * different number of text blocks).
 */
export const offsetIn = (
  document: RichText.Document,
  printed: string,
  position: RichText.Position,
): number | undefined => {
  let n = 0
  const read = parseMapped(printed, { mint: () => `caret-${n++}` })
  const at = alignedIn(document, read.document, position)
  if (at === undefined) return undefined
  const holds = (segment: Segment) =>
    segment.run === at.node &&
    segment.at <= at.offset &&
    at.offset <= segment.at + segment.value.length
  // At a boundary between two pieces of one run, the later piece is where the text continues.
  const segment =
    read.segments.find(each => holds(each) && at.offset < each.at + each.value.length) ??
    read.segments.find(holds)
  return segment === undefined ? undefined : rawIndices(printed, segment)[at.offset - segment.at]
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
 * The same place in another document with as many text blocks, as a document and the parse of
 * its own printed Markdown have: the same block by order, and the same offset in its text,
 * clamped to that block's length. A block's text may differ a little between the two (the
 * printer drops a code block's last newline and joins a heading's lines), so it is not compared.
 * Undefined when the counts differ, or the position's block holds no text.
 */
export const alignedIn = (
  from: RichText.Document,
  to: RichText.Document,
  position: RichText.Position,
): RichText.Position | undefined => {
  const source = textBlocks(from.children)
  const target = textBlocks(to.children)
  if (source.length !== target.length) return undefined
  for (const [index, block] of source.entries()) {
    let offset = 0
    for (const run of block.runs) {
      if (run.id !== position.node) {
        offset += run.text.length
        continue
      }
      const within = Math.min(offset + position.offset, target[index]!.text.length)
      const runs = target[index]!.runs
      // Where two runs meet, keep the side the position was on: at a run's start, the start of
      // the run after the boundary (outside the italic that ends there), else the end of the one before.
      const starting = position.offset === 0
      let start = 0
      for (const [at, candidate] of runs.entries()) {
        const end = start + candidate.text.length
        if (within < end || (within === end && (!starting || at === runs.length - 1))) {
          return { node: candidate.id, offset: within - start, affinity: 'after' }
        }
        start = end
      }
    }
  }
  return undefined
}
