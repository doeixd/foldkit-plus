/**
 * What a node's value is, read off its shape and its Schema without
 * evaluating: the guard of every law that returns an operand in place of a
 * call (`x + 0 -> x` holds only where `x` is a finite number, null or refused).
 */
import { Option, SchemaAST } from 'effect'
import * as Node from '../node.js'

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

/** The members of `ast` other than null and undefined. */
export const present = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> => {
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(present)
  return SchemaAST.isNull(ast) || SchemaAST.isUndefined(ast) ? [] : [ast]
}

/** A number Schema that admits neither NaN nor an infinity (`Schema.Int`, `Schema.Finite`). */
export const isFiniteNumber = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, FINITE)

/** A number Schema that admits only safe integers (`Schema.Int`). */
export const isInteger = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, new Set(['effect/schema/isInt']))

const kindOfAst = (ast: SchemaAST.AST): Option.Option<Node.ValueKind> => {
  const members = present(ast)
  if (members.length !== 1) return Option.none()
  const only = members[0]!
  if (isFiniteNumber(only)) return Option.some('number')
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
      return typeof value === 'boolean' ? Option.some('boolean' as const) : Option.none()
    },
    Path: ({ ast }) => Option.flatMap(ast, kindOfAst),
    Call: ({ op }) => Option.some(op.returns),
    If: ({ then, otherwise }) => sameKind([then, otherwise]),
    Match: ({ cases, otherwise }) =>
      sameKind([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)]),
    Opaque: () => Option.none(),
  })
