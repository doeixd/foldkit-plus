/**
 * Review of #610: a lifted opaque body runs once per step (#619), and a broken
 * walk stays visible whichever order it was recorded (#632).
 * `pnpm mutate packages/metakit/test/lift-and-evidence.mutations.ts`.
 */
const tests = [
  'packages/metakit/test/transition-opaque-lift.test.ts',
  'packages/metakit/test/temporal-evidence.test.ts',
]

export default [
  {
    name: 'a lifted opaque body receives a fresh environment per written value',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: `              const known = projected.get(outer)
              if (known !== undefined) return fn(known, foreign)`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the report takes only the last walk',
    edits: [
      {
        file: '../src/temporal.ts',
        find: `      const failure = broke(walks)
      if (failure !== undefined) {
        open.push({ ...scope, obligation, why: describeDischarge(failure) })
        continue
      }
`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'undischarged counts any passing walk, whatever else broke',
    edits: [
      {
        file: '../src/temporal.ts',
        find: 'return broke(walks) !== undefined || !walks.some(walk => closes(owned, walk))',
        replace: 'return !walks.some(walk => closes(owned, walk))',
      },
    ],
    tests,
  },
  {
    name: 'declaring an obligation does not clear the evidence',
    edits: [
      {
        file: '../src/temporal.ts',
        find: '        shown.delete(key)\n',
        replace: '',
      },
    ],
    tests,
  },
]
