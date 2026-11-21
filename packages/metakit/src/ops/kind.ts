/**
 * What a node's value is, read off its shape and its Schema without
 * evaluating: the guard of every law that returns an operand in place of a
 * call (`x + 0 -> x` holds only where `x` is a finite number, null or refused).
 */
import { Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { optionInner } from '../path.js'

const FINITE: ReadonlySet<string> = new Set(['effect/schema/isInt', 'effect/schema/isFinite'])

const declares = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>> | undefined,
  ids: ReadonlySet<string>,
): boolean =>
  (checks ?? []).some(check => {
    const id = check.annotations?.representation?.id
    return (
      (id !== undefined && ids.has(id)) ||
      (check._tag === 'FilterGroup' && declares(check.checks, ids))
    )
  })

/** The members of `ast` other than null and undefined; an `Option`'s are its value's, which a path reads. */
export const present = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> => {
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(present)
  const inner = optionInner(ast)
  if (Option.isSome(inner)) return present(inner.value)
  return SchemaAST.isNull(ast) || SchemaAST.isUndefined(ast) ? [] : [ast]
}

/** A number Schema that admits neither NaN nor an infinity (`Schema.Int`, `Schema.Finite`). */
export const isFiniteNumber = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, FINITE)

/** A number Schema that admits only safe integers (`Schema.Int`). */
export const isInteger = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, new Set(['effect/schema/isInt']))

/** A value of `ast` is never text holding a NUL character. */
const holdsNoNulText = (ast: SchemaAST.AST): boolean =>
  present(ast).every(
    member =>
      SchemaAST.isNumber(member) ||
      SchemaAST.isBoolean(member) ||
      SchemaAST.isObjects(member) ||
      SchemaAST.isArrays(member) ||
      (SchemaAST.isLiteral(member) && !Node.holdsNul([member.literal])),
  )

/**
 * A literal or a path that holds no text with a NUL character: a term
 * evaluation reads, which no text or equality operation refuses for it.
 */
export const isPortableRead = (node: Node.Node): boolean => {
  if (Node.$is('Lit')(node)) return !Node.isRefusal(node.value) && !Node.holdsNul([node.value])
  return Node.$is('Path')(node) && Option.isSome(node.ast) && holdsNoNulText(node.ast.value)
}

const kindOfAst = (ast: SchemaAST.AST): Option.Option<Node.ValueKind> => {
  const members = present(ast)
  if (members.length !== 1) return Option.none()
  const only = members[0]!
  if (isFiniteNumber(only)) return Option.some('number')
  if (SchemaAST.isString(only)) return Option.some('text')
  return SchemaAST.isBoolean(only) ? Option.some('boolean') : Option.none()
}

const sameKind = (nodes: ReadonlyArray<Node.Node>): Option.Option<Node.ValueKind> => {
  const kinds = nodes.map(kindOf)
  const first = kinds[0] ?? Option.none()
  return kinds.every(
    kind => Option.isSome(kind) && Option.isSome(first) && kind.value === first.value,
  )
    ? first
    : Option.none()
}

/** The kind of `node`'s value where it is neither null nor refused; none when unknown. */
export const kindOf = (node: Node.Node): Option.Option<Node.ValueKind> =>
  Node.$match(node, {
    Lit: ({ value }) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Option.some('number' as const)
      if (typeof value === 'string') return Option.some('text' as const)
      return typeof value === 'boolean' ? Option.some('boolean' as const) : Option.none()
    },
    Path: ({ ast }) => Option.flatMap(ast, kindOfAst),
    Call: ({ op, args }) => (op.returns === 'operand' ? sameKind(args) : Option.some(op.returns)),
    If: ({ then, otherwise }) => sameKind([then, otherwise]),
    Match: ({ cases, otherwise }) =>
      sameKind([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)]),
    Opaque: () => Option.none(),
    Rows: ({ fold }) => {
      if (fold === 'any' || fold === 'every') return Option.some('boolean' as const)
      // `min` and `max` of no element are null, which a kind does not rule out.
      return fold === 'count' || fold === 'sum' || fold === 'min' || fold === 'max'
        ? Option.some('number' as const)
        : Option.none()
    },
  })
