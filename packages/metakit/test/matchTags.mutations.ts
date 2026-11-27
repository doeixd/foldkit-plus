/**
 * Mutation specification for `Expr.matchTags` / `Expr.matchTagsExhaustive`.
 */
const tests = ['packages/metakit/test/matchTags.test.ts']

export default [
  {
    name: 'checkTagCases skips missing tag check in matchTagsExhaustive',
    edits: [
      {
        file: '../src/expr.ts',
        find: '  const missingTags = exhaustive ? [...variants.keys()].filter(tag => !keys.includes(tag)) : []',
        replace: '  const missingTags: Array<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'checkTagCases skips extra tag check',
    edits: [
      {
        file: '../src/expr.ts',
        find: '  const unknownTags = keys.filter(key => !variants.has(key))',
        replace: '  const unknownTags: Array<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'artifact resolveAstSegments skips Union members for tagged paths',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `  if (SchemaAST.isUnion(unwrapped)) {
    const hits: Array<SchemaAST.AST> = []`,
        replace: `  if (false && SchemaAST.isUnion(unwrapped)) {
    const hits: Array<SchemaAST.AST> = []`,
      },
    ],
    tests,
  },
]
