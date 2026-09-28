import { SchemaAST } from 'effect'

const isNullish = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNull(ast) || SchemaAST.isUndefined(ast)

const isText = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isString(ast) ||
  SchemaAST.isTemplateLiteral(ast) ||
  (SchemaAST.isLiteral(ast) && typeof ast.literal === 'string') ||
  (SchemaAST.isUnion(ast) && ast.types.length > 0 && ast.types.every(isText))

/** What a schema's AST holds, read through Effect's own guards. */
export const SchemaShape = {
  /** True for the `null` and `undefined` members that make a schema optional. */
  isNullish,

  /**
   * The members of a schema with `null` and `undefined` set aside, so optional
   * text is still text; a schema that is not a union is its one member.
   */
  present: (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
    SchemaAST.isUnion(ast) ? ast.types.filter(member => !isNullish(member)) : [ast],

  /** True when every value the schema admits is a string. */
  isText,
}
