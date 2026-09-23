/**
 * The read-only renderer (§33): a Document becomes ordinary Foldkit `Html`, so
 * SSR, static pages, CMS visitor rendering, and email generation all reuse one
 * interpreter. It dispatches nothing — `inertHtml` has no Message universe — and
 * it never touches the DOM directly, so it is the counterpart to the editable
 * adapter rather than a second editor.
 */
import { inertHtml as h, type Html } from 'foldkit/html'
import * as RichText from 'foldkit-richtext'

/** A rendered child is either an element or literal text. */
type Child = Html | string

const HEADINGS = { 1: h.h1, 2: h.h2, 3: h.h3, 4: h.h4, 5: h.h5, 6: h.h6 } as const

const MARK_WRAPPERS: ReadonlyArray<readonly [string, (child: Child) => Html]> = [
  ['Bold', child => h.strong([], [child])],
  ['Italic', child => h.em([], [child])],
  ['Code', child => h.code([], [child])],
]

const renderRun = (run: RichText.Text): Child => {
  let node: Child = run.text
  for (const [mark, wrap] of MARK_WRAPPERS) {
    if (run.marks.includes(mark)) node = wrap(node)
  }
  const unknown = run.marks.filter(mark => !MARK_WRAPPERS.some(([name]) => name === mark))
  return unknown.length === 0 ? node : h.span([h.DataAttribute('marks', unknown.join(' '))], [node])
}

const renderBlock = (block: RichText.Block): Html => {
  if (block.type === 'Unknown') {
    // Preserved content renders as a diagnostic placeholder, never executed.
    return h.div([h.DataAttribute('unknown', block.originalType)], [`[${block.originalType}]`])
  }
  const children: ReadonlyArray<Child> = block.children.map(renderRun)
  if (block.type === 'Node') {
    // The kind is addressable so a stylesheet or a renderer can reach it.
    return h.div([h.DataAttribute('node', block.kind)], children)
  }
  return block.type === 'Heading' ? HEADINGS[block.level]([], children) : h.p([], children)
}

/** One element per block, ready to place in any Foldkit view. */
export const renderBlocks = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<Html> =>
  blocks.map(renderBlock)

/** The whole document as a `div` of block elements. */
export const renderDocument = (document: RichText.Document): Html =>
  h.div([], renderBlocks(document.children))
