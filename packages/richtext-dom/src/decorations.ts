/**
 * How decorations are drawn (§129), shared by the editor and the read-only view so one
 * stylesheet serves both.
 */
import * as RichText from 'foldkit-richtext'

export type Spans = ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>

/**
 * The decorations over each run (`RichText.decorationsIn`), plus an empty span, `{ from: 0,
 * to: 0 }`, on an empty run a decoration starts or ends in. The core draws nothing over no
 * text, but another person's caret on an empty line still has to show.
 */
export const decorationSpans = (
  document: RichText.Document,
  set: RichText.DecorationSet,
): Spans => {
  const spans = RichText.decorationsIn(document, set)
  if (set.length === 0) return spans
  const lengths = new Map<RichText.NodeId, number>()
  const visit = (blocks: ReadonlyArray<RichText.Block>): void => {
    for (const block of blocks) {
      for (const run of block.children) lengths.set(run.id, run.text.length)
      if (block.type === 'Node' && block.blocks !== undefined) visit(block.blocks)
    }
  }
  visit(document.children)
  const withEmpty = new Map(spans)
  for (const decoration of set) {
    const { from, to } = decoration
    // Both ends must resolve, as `decorationsIn` requires.
    if (!lengths.has(from.node) || !lengths.has(to.node)) continue
    for (const node of from.node === to.node ? [from.node] : [from.node, to.node]) {
      if (lengths.get(node) !== 0) continue
      withEmpty.set(node, [...(withEmpty.get(node) ?? []), { from: 0, to: 0, decoration }])
    }
  }
  return withEmpty
}

/** `RichText.runPieces`, except that an empty run carries the empty spans on it. */
export const piecesOf = (
  text: string,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): ReadonlyArray<RichText.RunPiece> =>
  text.length === 0
    ? [{ text, decorations: spans.map(span => span.decoration) }]
    : RichText.runPieces(text, spans)

const FIELD = /^[a-z][a-z0-9-]*$/

/**
 * The attributes a decoration's element carries: `data-decoration` names its kind, and each
 * string field of `data` named in lowercase letters, digits, and hyphens rides as
 * `data-decoration-<name>`, for a stylesheet's `attr()`. Anything else in `data` is not drawn.
 */
export const decorationAttributes = (
  decoration: RichText.Decoration,
): ReadonlyArray<readonly [string, string]> => {
  const data: unknown = decoration.data
  const fields =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? Object.entries(data).filter(
          (field): field is [string, string] =>
            typeof field[1] === 'string' && FIELD.test(field[0]),
        )
      : []
  return [
    ['data-decoration', decoration.kind],
    ...fields.map(([name, value]) => [`data-decoration-${name}`, value] as const),
  ]
}
