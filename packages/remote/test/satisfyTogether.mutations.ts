/**
 * A pass of `Data.satisfy` reads its Surfaces together, and a render's unmade
 * read is reported: `pnpm mutate packages/remote/test/satisfyTogether.mutations.ts`
 * checks that a test fails for every one.
 */
const satisfy = ['packages/remote/test/satisfy.test.ts', 'packages/remote/test/family.test.ts']
const resume = ['packages/remote/test/resume.test.ts']

export default [
  {
    name: 'a pass reads one Surface at a time',
    edits: [
      {
        file: '../src/remote.ts',
        find: '        current = yield* prefetchInto(\n          current,\n          entries.flatMap(entry => resolvedOf(entry, current).map(({ projection }) => projection)),\n          { now },\n          heard,\n        )',
        replace:
          '        for (const entry of entries)\n          for (const { projection } of resolvedOf(entry, current))\n            current = yield* prefetchInto(current, [projection], { now }, heard)',
      },
    ],
    tests: satisfy,
  },
  {
    name: 'a pass reads only its first Surface',
    edits: [
      {
        file: '../src/remote.ts',
        find: '          entries.flatMap(entry => resolvedOf(entry, current).map(({ projection }) => projection)),',
        replace:
          '          entries.slice(0, 1).flatMap(entry => resolvedOf(entry, current).map(({ projection }) => projection)),',
      },
    ],
    tests: satisfy,
  },
  {
    name: 'a field the store lacks is not unmade',
    edits: [
      {
        file: '../src/resume.ts',
        find: '        unmade.add(`${key}.${field}`)',
        replace: '        void field',
      },
    ],
    tests: resume,
  },
  {
    name: 'a row the store lacks is not unmade',
    edits: [
      {
        file: '../src/resume.ts',
        find: '      unmade.add(key)\n      return',
        replace: '      return',
      },
    ],
    tests: resume,
  },
  {
    name: 'a list never read is not unmade',
    edits: [
      {
        file: '../src/resume.ts',
        find: '      unmade.add(identity)',
        replace: '      void identity',
      },
    ],
    tests: resume,
  },
  {
    name: 'a row answered gone is unmade',
    edits: [{ file: '../src/resume.ts', find: '    if (stored.tombstone) return\n', replace: '' }],
    tests: resume,
  },
  {
    name: 'a field settled without a value is unmade',
    edits: [
      {
        file: '../src/resume.ts',
        find: '      if (stored.unavailable.has(field)) continue\n',
        replace: '',
      },
    ],
    tests: resume,
  },
  {
    name: 'an unmade read is not reported',
    edits: [
      {
        file: '../src/resume.ts',
        find: '    if (unmade.length > 0) Effect.runSync(Diagnostics.report(readUnmade(unmade)))\n',
        replace: '',
      },
    ],
    tests: resume,
  },
]
