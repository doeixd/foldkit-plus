/**
 * `Expr.contains`: a case-insensitive search, metakit's `str.contains` over
 * both sides lowered by `str.lowerAscii`, as SQLite's `lower` folds without
 * ICU.
 */
import { Node, Str } from 'metakit'
import { Option } from 'effect'
import {
  exprOf,
  inputKeyOf,
  kindOf,
  made,
  toNode,
  type InputExpr,
  type LiteralExpr,
  type Predicate,
  type Reads,
  type ReadsOf,
  type TextOperand,
} from './operand.js'
import { show } from './show.js'

/** What `Expr.contains` searches for: a value or an input, never a row's own. */
type ContainsSearch = string | LiteralExpr<string> | InputExpr<string> | InputExpr<string | null>

const lowered = (node: Node.Node): Node.Node => Node.Call({ op: Str.lowerAsciiOp, args: [node] })

const containsCall = <L extends TextOperand>(
  value: L,
  search: ContainsSearch,
): Predicate & Reads<ReadsOf<L>> => {
  const sought = toNode(search)
  // A search a row decides would have to be escaped as a pattern in SQL, which
  // no compiler here does: it is a value or an input.
  if (!Node.$is('Lit')(sought) && Option.isNone(inputKeyOf(sought))) {
    throw new Error(
      `[foldkit-entity] Expr.contains: the search is ${show(exprOf(sought))}; search for a value or an input`,
    )
  }
  const text = toNode(value)
  const kind = kindOf(text)
  if (kind === 'boolean' || kind === 'number') {
    throw new Error(
      `[foldkit-entity] Expr.contains: ${show(exprOf(text))} is no text to search; it searches a text field or expression`,
    )
  }
  return exprOf(
    made(Node.Call({ op: Str.containsOp, args: [lowered(text), lowered(sought)] }), {
      _tag: 'Contains',
      value: text,
      search: sought,
    }),
  )
}

/** `Expr.contains.step`: the search, then the text. */
export type ContainsStep = <const S extends ContainsSearch>(
  search: S,
) => <L extends TextOperand>(value: L) => Predicate & Reads<ReadsOf<L>>

/**
 * Whether a text value contains `search`, anywhere in it. Containing the empty
 * string is everything, so a search box with nothing typed in it is the same
 * query as one with something: no branch, and no second query.
 *
 * **Case-insensitive**, which is what a search means, and which has to be said
 * rather than left to the reader: SQLite's `like` ignores case and Postgres's
 * does not. Folding is ASCII-only, because that is what `lower` does in
 * SQLite without ICU.
 *
 * **Over a column that can be null this is not the same as no filter.** A null
 * contains nothing, not even the empty string, so its rows drop out. A
 * nullable column that should match everything on an empty search says so:
 * `Expr.or(Expr.isNull(field), Expr.contains(field, input.search))`.
 */
export const contains = Object.assign(containsCall, {
  step: ((search: ContainsSearch) => (value: TextOperand) =>
    containsCall(value, search)) as ContainsStep,
})
