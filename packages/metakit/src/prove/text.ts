/**
 * The solver's reading of text: text is held as a code among the integers,
 * which says nothing of its characters, so a text operation over a term the
 * solver cannot compute is a free value, and a counterexample that sets one
 * is not reported (`opaque`). A term that may be text holding a NUL carries
 * a flag the model sets, from which the refusal of every text and equality
 * operation follows.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import * as Str from '../ops/str.js'
import * as Path from '../path.js'
import type { Kind, Lowerer, Term, Z3, ZArith, ZBool, ZExpr } from './lower.js'
import type { Shape } from './shape.js'

/** What the text rows take from the lowering they belong to. */
export interface TextKit {
  readonly z3: Z3
  readonly shape: Shape
  readonly flagVar: (name: string) => ZBool
  /** Terms the solver holds only a free variable for. */
  readonly opaque: Map<string, ZExpr>
  readonly present: (value: ZExpr, kind: Kind) => Term
  readonly literal: (value: unknown) => Term
  readonly strict: (kind: Kind, args: ReadonlyArray<Term>, value: ZExpr) => Term
  readonly length: (node: Node.Node) => ZArith
  readonly assert: (fact: ZBool) => void
}

const knownText = (node: Node.Node): Option.Option<string> =>
  Node.$is('Lit')(node) && typeof node.value === 'string' ? Option.some(node.value) : Option.none()

export const textReading = (kit: TextKit) => {
  const { z3, shape, flagVar, opaque, present, literal, strict, length } = kit
  const never = z3.Bool.val(false)

  const free = (key: string, make: () => ZExpr): ZExpr => {
    const known = opaque.get(key)
    if (known !== undefined) return known
    const made = make()
    opaque.set(key, made)
    return made
  }

  /** Whether `node` may be text holding a NUL: a flag the model sets, where its Schema allows text. */
  const nulOf = (node: Node.Node): ZBool =>
    Node.$match(node, {
      Lit: ({ value }) => z3.Bool.val(Node.holdsNul([value])),
      Path: ({ segments }) => {
        const name = Path.format(segments)
        const info = shape.paths.get(name)
        const textless =
          info !== undefined &&
          (info.sort === 'int' ||
            info.sort === 'real' ||
            info.sort === 'bool' ||
            info.sort === 'struct' ||
            (info.literals.length > 0 && !Node.holdsNul(info.literals)))
        return textless ? never : flagVar(`nul:${name}`)
      },
      // An operator that gives text refuses a NUL in what it takes; one that gives an operand passes it.
      Call: ({ op, args }) => (op.returns === 'operand' ? z3.Or(never, ...args.map(nulOf)) : never),
      If: ({ then, otherwise }) => z3.Or(nulOf(then), nulOf(otherwise)),
      Match: ({ cases, otherwise }) =>
        z3.Or(never, ...[...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)].map(nulOf)),
      Opaque: opaqueNode => flagVar(`nul:${Node.key(opaqueNode)}`),
    })

  /** A text predicate the solver cannot read: free, but for the lengths it implies. */
  const search =
    (op: Node.Op<'str.startsWith' | 'str.contains'>): Lowerer =>
    ([text, part], [textNode, partNode]) => {
      const a = knownText(textNode!)
      const b = knownText(partNode!)
      // A refusal (a NUL) is added by the caller from the operands.
      if (Option.isSome(a) && Option.isSome(b)) {
        return present(z3.Bool.val(Node.apply(op, [a.value, b.value]) === true), 'bool')
      }
      // Every text begins with and contains the empty one.
      if (Option.isSome(b) && b.value === '')
        return strict('bool', [text!, part!], z3.Bool.val(true))
      const key = `${op.id}:${Node.key(textNode!)}:${Node.key(partNode!)}`
      const known = opaque.has(key)
      const value = free(key, () => z3.Bool.const(key))
      if (!known && z3.isBool(value)) {
        kit.assert(z3.Implies(value, length(textNode!).ge(length(partNode!))))
      }
      return strict('bool', [text!, part!], value)
    }

  /** The texts `node` may be: a literal, or a path whose Schema names each of them. */
  const choicesOf = (node: Node.Node): Option.Option<ReadonlyArray<string>> => {
    if (Node.$is('Lit')(node)) return Option.map(knownText(node), each => [each])
    if (!Node.$is('Path')(node)) return Option.none()
    const info = shape.paths.get(Path.format(node.segments))
    const texts = (info?.literals ?? []).filter(each => typeof each === 'string')
    return info !== undefined && texts.length > 0 && texts.length === info.literals.length
      ? Option.some(texts)
      : Option.none()
  }

  /** `term` is the text `each`. */
  const holds = (term: Term, each: string): ZBool => {
    const code = literal(each).value
    return z3.isArith(term.value) && z3.isArith(code) ? term.value.eq(code) : never
  }

  /** Text a text operation gives: computed for each text the operand may be, free otherwise. */
  const transform =
    (op: Node.Op<'str.lowerAscii' | 'str.trim'>): Lowerer =>
    ([text], [node]) => {
      const key = `${op.id}:${Node.key(node!)}`
      const results = Option.map(choicesOf(node!), choices =>
        choices.map(each => [each, Node.apply(op, [each])] as const),
      )
      if (Option.isNone(results) || results.value.some(([, out]) => typeof out !== 'string')) {
        return strict(
          'text',
          [text!],
          free(key, () => z3.Int.const(key)),
        )
      }
      const [first, ...rest] = results.value
      if (rest.length === 0 && Node.$is('Lit')(node!)) return literal(first![1])
      const value = results.value.reduceRight<ZExpr>(
        (otherwise, [each, out]) => z3.If(holds(text!, each), literal(out).value, otherwise),
        literal(first![1]).value,
      )
      return strict('text', [text!], value)
    }

  /** An order of text by code point: computed over the texts each side may be, free otherwise. */
  const order =
    (op: Node.Op<'str.lt' | 'str.lte' | 'str.gt' | 'str.gte'>, reflexive: boolean): Lowerer =>
    ([left, right], [a, b]) => {
      const x = choicesOf(a!)
      const y = choicesOf(b!)
      if (Option.isSome(x) && Option.isSome(y)) {
        const pairs = x.value.flatMap(l => y.value.map(r => [l, r] as const))
        const value = z3.Or(
          never,
          ...pairs
            .filter(([l, r]) => Node.apply(op, [l, r]) === true)
            .map(([l, r]) => z3.And(holds(left!, l), holds(right!, r))),
        )
        return strict('bool', [left!, right!], value)
      }
      if (Node.key(a!) === Node.key(b!)) {
        return strict('bool', [left!, right!], z3.Bool.val(reflexive))
      }
      const key = `${op.id}:${Node.key(a!)}:${Node.key(b!)}`
      return strict(
        'bool',
        [left!, right!],
        free(key, () => z3.Bool.const(key)),
      )
    }

  const rows = {
    'str.startsWith': search(Str.startsWithOp),
    'str.contains': search(Str.containsOp),
    'str.lowerAscii': transform(Str.lowerAsciiOp),
    'str.trim': transform(Str.trimOp),
    'str.lt': order(Str.ltOp, false),
    'str.lte': order(Str.lteOp, true),
    'str.gt': order(Str.gtOp, false),
    'str.gte': order(Str.gteOp, true),
  } satisfies Readonly<Partial<Record<Node.CoreOpId, Lowerer>>>

  return { nulOf, rows }
}
