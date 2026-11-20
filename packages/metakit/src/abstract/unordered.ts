import { Option, Schema, SchemaAST } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import * as Path from '../path.js'
import * as Verdict from '../verdict.js'

/** A schema of the environment, and the path it sits under: `[]` for the whole of it. */
export type Slice = readonly [under: ReadonlyArray<string>, schema: Schema.Top]

const nullableNumber = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isUnion(ast) && ast.types.some(SchemaAST.isNull) && ast.types.some(SchemaAST.isNumber)

/** Whether the number at `segments` may be NaN or absent, or null where `compared`. */
const unordered = (
  ast: SchemaAST.AST,
  segments: ReadonlyArray<string>,
  compared: boolean,
): boolean => {
  let current = ast
  let absent = false
  for (const segment of segments) {
    if (!SchemaAST.isObjects(current)) return false
    const property = current.propertySignatures.find(({ name }) => name === segment)
    if (property === undefined) return false
    absent ||= SchemaAST.isOptional(property.type)
    current = property.type
  }
  return SchemaAST.isNumber(current)
    ? absent || Schema.is(Schema.make(current))(NaN)
    : compared && nullableNumber(current)
}

const arithmetic = /^(ord|num)\./

/**
 * `Unknown`, naming the first numeric path that `nodes` or a refinement of a
 * slice reads and that the checkers cannot order. They order every number, so
 * they take `x <= 0` for the negation of `x > 0`. Neither holds of NaN or of
 * an absent key, and evaluation compares null as zero while the checkers keep
 * it apart from every number, so a proof that reads one says nothing of the
 * environments that hold it. Null is no trouble where nothing compares it.
 */
const unorderedRead = (
  slices: ReadonlyArray<Slice>,
  nodes: ReadonlyArray<Node.Node>,
): Option.Option<Verdict.Verdict<never>> => {
  let found = Option.none<string>()
  const visit = (node: Node.Node, compared: boolean): void => {
    if (Option.isSome(found)) return
    Node.$match(node, {
      Lit: () => {},
      Opaque: () => {},
      Path: ({ segments }) => {
        const read = slices.some(
          ([under, schema]) =>
            under.every((segment, index) => segments[index] === segment) &&
            unordered(schema.ast, segments.slice(under.length), compared),
        )
        if (read) found = Option.some(Path.format(segments))
      },
      Call: ({ op, args }) => {
        for (const arg of args) visit(arg, arithmetic.test(op.id))
      },
      If: ({ cond, then, otherwise }) => {
        visit(cond, false)
        visit(then, compared)
        visit(otherwise, compared)
      },
      Match: ({ on, cases, otherwise }) => {
        visit(on, false)
        for (const [, branch] of cases) visit(branch, compared)
        if (Option.isSome(otherwise)) visit(otherwise.value, compared)
      },
    })
  }
  for (const [under, schema] of slices)
    for (const refinement of Expr.refinementsOf(schema))
      visit(Node.prefix(refinement.node, under), false)
  for (const node of nodes) visit(node, false)
  return Option.map(found, path =>
    Verdict.Unknown(
      `"${path}" may hold NaN, be absent, or be null where it is compared, which the checkers do not order`,
    ),
  )
}

/** `verdict`, or the `Unknown` of an unordered read where it decides anything without a witness. */
export const ordered = <W>(
  verdict: Verdict.Verdict<W>,
  slices: ReadonlyArray<Slice>,
  nodes: ReadonlyArray<Node.Node>,
): Verdict.Verdict<W> =>
  Verdict.isTrue(verdict) || (Verdict.isFalse(verdict) && Option.isNone(verdict.witness))
    ? Option.getOrElse(unorderedRead(slices, nodes), () => verdict)
    : verdict
