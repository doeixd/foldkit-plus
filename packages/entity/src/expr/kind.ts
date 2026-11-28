/** What a node comes to, read from its stored form or its operation: the checks made while building read it. */
import { Option, Schema, SchemaAST } from 'effect'
import { Node } from '@doeixd/metakit'
import { SchemaShape } from '../shape.js'
import { originTagged } from './operand.js'

/** What a value comes to, read from its stored form; `null` for a null literal. */
export type Kind = 'number' | 'text' | 'boolean' | 'null' | 'other'

const isNumberLiteral = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isLiteral(ast) && typeof ast.literal === 'number'

const isBooleanLiteral = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isLiteral(ast) && typeof ast.literal === 'boolean'

/** What values encoded by `ast` are, null aside: one kind, or `other`. */
export const kindOfAst = (ast: SchemaAST.AST): Kind => {
  const present = SchemaShape.present(ast)
  if (present.length === 0)
    return SchemaAST.isUnion(ast) || SchemaAST.isNull(ast) ? 'null' : 'other'
  if (present.every(member => SchemaAST.isNumber(member) || isNumberLiteral(member))) {
    return 'number'
  }
  if (present.every(SchemaShape.isText)) return 'text'
  if (present.every(member => SchemaAST.isBoolean(member) || isBooleanLiteral(member))) {
    return 'boolean'
  }
  return 'other'
}

/** What a constant is. */
const kindOfValue = (value: unknown): Kind => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'text'
  if (typeof value === 'boolean') return 'boolean'
  return 'other'
}

/** What a node comes to: a constant's own kind, a read's stored form, an operation's result. */
export const kindOf = (node: Node.Node): Kind =>
  Node.$match(node, {
    Lit: ({ value }) => kindOfValue(value),
    Path: ({ ast }) => Option.match(ast, { onNone: (): Kind => 'other', onSome: kindOfAst }),
    Call: ({ op, args }): Kind =>
      Option.match(originTagged(node, 'Call'), {
        onSome: ({ operator }) => kindOfAst(Schema.toEncoded(operator.output).ast),
        onNone: () => {
          if (op.returns !== 'operand') return op.returns
          const [first] = args.map(kindOf).filter(kind => kind !== 'null')
          return first ?? 'null'
        },
      }),
    Rows: ({ fold }): Kind =>
      fold === 'any' || fold === 'every'
        ? 'boolean'
        : fold === 'count' || fold === 'sum'
          ? 'number'
          : 'other',
    If: (): Kind => 'other',
    Match: (): Kind => 'other',
    Opaque: (): Kind => 'other',
  })
