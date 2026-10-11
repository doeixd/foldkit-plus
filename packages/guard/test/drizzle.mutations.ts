/**
 * A guard set's read rules compiled to SQL, broken in turn:
 * `pnpm mutate packages/guard/test/drizzle.mutations.ts`.
 */
const file = '../src/drizzle.ts'
const tests = ['packages/guard/test/drizzle.test.ts']

export default [
  {
    name: 'a refused Read admits every row',
    edits: [{ file, find: 'Never: () => nothing,', replace: 'Never: () => undefined,' }],
    tests,
  },
  {
    name: "an inherited Read ignores the related row's rule",
    edits: [
      {
        file,
        find: 'const where = compile(target.name, target, conditions, input) ?? sql`1 = 1`',
        replace: 'const where = sql`1 = 1`',
      },
    ],
    tests,
  },
  {
    name: 'a disjunction is compiled as a conjunction',
    edits: [
      {
        file,
        find: 'Or: ({ conditions: parts }) => or(...parts.map(of)),',
        replace: 'Or: ({ conditions: parts }) => and(...parts.map(of)),',
      },
    ],
    tests,
  },
  {
    name: 'an inherited Entity not listed is let through',
    edits: [
      {
        file,
        find: "fail(`${entity.name} inherits ${target}'s Read, but ${target} is not listed`)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an inherited Entity without a Read rule is let through',
    edits: [
      {
        file,
        find: "fail(`${entity.name} inherits ${target}'s Read, but ${target} has no Read rule`)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a loop of inherited Reads is let through',
    edits: [
      {
        file,
        find: "if (path.includes(name)) fail(`inherited Reads loop: ${[...path, name].join(' → ')}`)",
        replace: 'if (path.includes(name)) return []',
      },
    ],
    tests,
  },
  {
    name: 'a principal of another shape is read anyway',
    edits: [{ file, find: 'if (!policy.isPrincipal(principal)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a Read decides only its own Entity',
    edits: [
      {
        file,
        find: 'Effect.forEach(reaches.get(name)!, each =>',
        replace: 'Effect.forEach([name], each =>',
      },
    ],
    tests,
  },
  {
    name: 'a row guard SQL here cannot run is let through',
    edits: [{ file, find: 'if (missing.length > 0) {', replace: 'if (false) {' }],
    tests,
    survives:
      'Every operation Expr has today is one this compiler runs, so no guard can reach the refusal; it is there for the next operation Expr gains.',
  },
]
