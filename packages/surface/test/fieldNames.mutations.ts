/**
 * A ref's fields kept apart from its members (#331), broken in turn: `pnpm
 * mutate packages/surface/test/fieldNames.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/surface/test/fieldNames.test.ts']

export default [
  {
    name: "a ref's members sit beside its fields as string keys",
    edits: [
      {
        file: '../src/index.ts',
        find: 'const node: Record<PropertyKey, unknown> = { [RefTypeId]: focus }',
        replace: 'const node: Record<PropertyKey, unknown> = { ...focus, [RefTypeId]: focus }',
      },
    ],
    tests,
  },
  {
    name: 'Projection.struct tells a ref by a member name',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (ModelRef.is(entry)) {',
        replace: "if (!('dependencies' in entry)) {",
      },
    ],
    tests,
  },
  {
    name: 'every value is a ref',
    edits: [
      {
        file: '../src/index.ts',
        find: "typeof value === 'object' && value !== null && RefTypeId in value",
        replace: "typeof value === 'object' && value !== null",
      },
    ],
    tests,
  },
  {
    name: 'a field named like a member is skipped',
    edits: [
      {
        file: '../src/index.ts',
        find: '      // Defined, not assigned: assigning `__proto__` would set the prototype.\n',
        replace: '      if (key in focus) continue\n',
      },
    ],
    tests,
  },
]
