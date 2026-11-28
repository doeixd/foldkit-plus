/**
 * The form the checker reads an expression in: each count of a list as
 * `countOfWritten` writes it, and a sum with a negated operand as the
 * difference it equals, so the Zone relates `x + -y` as it does `x - y`.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import { addOp, subOp } from '../ops/num.js'
import { countOfWritten } from './lists.js'

const isCore = (op: Node.AnyOp, id: Node.CoreOpId): boolean => !Node.isForeign(op) && op.id === id

/** The operand of `num.neg`, where `node` is a call of it. */
const negated = (node: Node.Node): Option.Option<Node.Node> =>
  Node.$is('Call')(node) && isCore(node.op, 'num.neg') ? Option.some(node.args[0]!) : Option.none()

/** `node` without the double negations around it. */
const plain = (node: Node.Node): Node.Node =>
  Option.match(Option.flatMap(negated(node), negated), { onNone: () => node, onSome: plain })

/**
 * A call over operands already normalized. Of a sum or a difference, an
 * operand `-(-y)` is `y`, and then `x + -y` and `-y + x` are `x - y`, and
 * `x - -y` is `x + y`. Value, null and refusal agree: IEEE subtraction is
 * addition of the negation; `neg`, `add` and `sub` each refuse an operand
 * that is not a finite number, so `-(-y)` and `-y` are refused exactly where
 * the sum over `y` is; `-y` is a safe integer exactly where `y` is; and a
 * zero result is 0 whatever the zeros' signs. A `-(-y)` elsewhere is kept:
 * its interval follows that of `-y`, which a comparison may have narrowed.
 */
const signed = (op: Node.AnyOp, args: ReadonlyArray<Node.Node>): Node.Node => {
  const sum = isCore(op, 'num.add')
  if (args.length !== 2 || (!sum && !isCore(op, 'num.sub'))) return Node.Call({ op, args })
  const [a, b] = [plain(args[0]!), plain(args[1]!)]
  const right = negated(b)
  if (Option.isSome(right)) return Node.Call({ op: sum ? subOp : addOp, args: [a, right.value] })
  const left = negated(a)
  if (sum && Option.isSome(left)) return Node.Call({ op: subOp, args: [b, left.value] })
  return Node.Call({ op, args: [a, b] })
}

/** `node` in the form the checker reads. */
export const normalize = (node: Node.Node): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path => path,
    Opaque: opaque => opaque,
    Call: ({ op, args }) => {
      const inner = args.map(normalize)
      return isCore(op, 'arr.count') && inner.length === 1
        ? countOfWritten(inner[0]!)
        : signed(op, inner)
    },
    If: ({ cond, then, otherwise }) =>
      Node.If({ cond: normalize(cond), then: normalize(then), otherwise: normalize(otherwise) }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: normalize(on),
        cases: cases.map(([value, arm]) => [value, normalize(arm)] as const),
        otherwise: Option.map(otherwise, normalize),
      }),
    Rows: rows => Node.mapRows(rows, normalize, normalize),
  })
