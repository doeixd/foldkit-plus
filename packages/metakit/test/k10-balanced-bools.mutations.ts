const file = '../src/expr.ts'
const tests = ['packages/metakit/test/k10-balanced-bools.test.ts']

export default [
  {
    name: 'boolean terms form a left-deep chain',
    edits: [
      {
        file,
        find: 'return terms.length === 0 ? Node.Lit({ value: empty }) : join(0, terms.length)',
        replace: `const [first, ...rest] = terms.map(toNode)
  return first === undefined
    ? Node.Lit({ value: empty })
    : rest.reduce((acc, term) => Node.Call({ op, args: [acc, term] }), first)`,
      },
    ],
    tests,
  },
  {
    name: 'the right half of the boolean terms refuses first',
    edits: [
      {
        file,
        find: 'args: [join(from, middle), join(middle, until)]',
        replace: 'args: [join(middle, until), join(from, middle)]',
      },
    ],
    tests,
  },
]
