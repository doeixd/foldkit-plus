/**
 * A read keeps its object while what it reads does (#384):
 * `pnpm mutate packages/remote/test/rowIdentity.mutations.ts`.
 */
const tests = ['packages/remote/test/rowIdentity.test.ts']

export default [
  {
    name: 'a row read is kept whatever its entries became',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'if (memo !== undefined && unchanged(store, memo)) return',
        replace: 'if (memo !== undefined) return',
      },
    ],
    tests,
  },
  {
    name: 'a row read does not follow its relations to the entries it reaches',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: '  if (requirement.relations === undefined) return\n',
        replace: '  return\n',
      },
    ],
    tests,
  },
  {
    name: 'a row read again is a new object even when it reads the same',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'memo !== undefined && sameRead(memo.read, read) ? memo.read : read',
        replace: 'read',
      },
    ],
    tests,
  },
  {
    name: 'a decoding is not kept by entity key',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'alike(byKey.get(key), assembled.values) ??',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a decoding is not kept by the row's values",
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'alike(byValues.get(source), assembled.values) ??',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failure over a value is made on every read',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'if (kept !== undefined && kept.error === error) return',
        replace: 'if (false) return',
      },
    ],
    tests,
  },
  {
    name: 'a failure over a value keeps its first error',
    edits: [
      {
        file: '../src/rowRead.ts',
        find: 'if (kept !== undefined && kept.error === error) return',
        replace: 'if (kept !== undefined) return',
      },
    ],
    tests,
  },
  {
    name: 'a read handle is made on every call',
    edits: [
      {
        file: '../src/index.ts',
        find: '    const known = handles.get(id)\n    if (known !== undefined) return known\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a read holding no value is a new object each time',
    edits: [
      {
        file: '../src/index.ts',
        find: '      // usually a wiring mistake.\n      return INITIAL',
        replace: "      // usually a wiring mistake.\n      return { _tag: 'Initial' }",
      },
    ],
    tests,
  },
  {
    name: 'a page is new whenever the store is',
    edits: [
      {
        file: '../src/index.ts',
        find: 'return made === undefined ? undefined : keptPage(pages, key, made)',
        replace: 'return made',
      },
    ],
    tests,
  },
  {
    name: 'a page is kept even when a row in it changed',
    edits: [
      {
        file: '../src/index.ts',
        find: '  left.items.every((item, index) => item === right.items[index])',
        replace: '  true',
      },
    ],
    tests,
  },
]
