const tests = ['packages/metakit/test/k14-tree-rewrites.test.ts']

export default [
  {
    name: 'Node.mapRows drops Related.cardinality',
    edits: [
      {
        file: '../src/node.ts',
        find: `      Related: ({ of, relation, cardinality }) =>
        RowsOver.Related({
          of: source(of),
          relation,
          ...(cardinality === undefined ? {} : { cardinality }),
        }),`,
        replace:
          '      Related: ({ of, relation }) => RowsOver.Related({ of: source(of), relation }),',
      },
    ],
    tests,
  },
  {
    name: 'rewriteStatePrefix ignores Rows binders named "state"',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: '      return head !== undefined && roots.has(head) && !bound.has(head)',
        replace: '      return head !== undefined && roots.has(head)',
      },
    ],
    tests,
  },
  {
    name: 'Transition.lift allows lifting along an Option field',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: '  if (Option.exists(path.ast, isOptionAst)) {',
        replace: '  if (false && Option.exists(path.ast, isOptionAst)) {',
      },
    ],
    tests,
  },
  {
    name: 'isOptionAst ignores Option inside a Union (optional Option)',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: '  if (SchemaAST.isUnion(ast)) return ast.types.some(member => isOptionAst(member, seen))',
        replace:
          '  if (false && SchemaAST.isUnion(ast)) return ast.types.some(member => isOptionAst(member, seen))',
      },
    ],
    tests,
  },
  {
    name: 'Machine.lift skips Option path check for an empty machine',
    edits: [
      {
        file: '../src/machine.ts',
        find: `export const lift = <Outer, Child, Transitions extends Readonly<Record<string, unknown>>>(
  path: Path.Path<Outer, Child | null | undefined>,
  machine: Machine<Child, Transitions>,
): Lifted<Outer, Transitions> => {
  assertLiftablePath(path)`,
        replace: `export const lift = <Outer, Child, Transitions extends Readonly<Record<string, unknown>>>(
  path: Path.Path<Outer, Child | null | undefined>,
  machine: Machine<Child, Transitions>,
): Lifted<Outer, Transitions> => {`,
      },
    ],
    tests,
  },
]
