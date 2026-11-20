import { Option, Schema, SchemaAST } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import * as Path from '../path.js'
import * as Verdict from '../verdict.js'

const unordered = (ast: SchemaAST.AST, segments: ReadonlyArray<string>): boolean => {
  let current = ast
  let absent = false
  for (const segment of segments) {
    if (!SchemaAST.isObjects(current)) return false
    const property = current.propertySignatures.find(({ name }) => name === segment)
    if (property === undefined) return false
    absent ||= SchemaAST.isOptional(property.type)
    current = property.type
  }
  return SchemaAST.isNumber(current) && (absent || Schema.is(Schema.make(current))(NaN))
}

/**
 * `Unknown`, naming the first numeric path that `rules` or a refinement of a
 * policy's row or principal reads and that may hold NaN or be absent. The Zone
 * and the solver order every number, so they take `x <= 0` for the negation of
 * `x > 0`; neither holds of such a value, and a proof that reads one says
 * nothing of the environments that hold it.
 */
export const unorderedRead = (
  policy: { readonly rowSchema: Schema.Top; readonly principalSchema: Schema.Top },
  rules: ReadonlyArray<Node.Node>,
): Option.Option<Verdict.Verdict<never>> => {
  const slices: Readonly<Record<string, Schema.Top>> = {
    row: policy.rowSchema,
    principal: policy.principalSchema,
  }
  let found = Option.none<string>()
  const nodes = [
    ...Object.entries(slices).flatMap(([slice, schema]) =>
      Expr.refinementsOf(schema).map(refinement => Node.prefix(refinement.node, [slice])),
    ),
    ...rules,
  ]
  for (const node of nodes) {
    // Visits each path outside an opaque term, and replaces none.
    Node.substitutePaths(node, segments => {
      const [slice, ...rest] = segments
      if (
        Option.isNone(found) &&
        slice !== undefined &&
        Object.hasOwn(slices, slice) &&
        unordered(slices[slice]!.ast, rest)
      )
        found = Option.some(Path.format(segments))
      return Option.none()
    })
  }
  return Option.map(found, path =>
    Verdict.Unknown(`"${path}" may hold NaN or be absent, which the checkers do not order`),
  )
}
