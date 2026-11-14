/**
 * A document's laws, broken in turn on each side of the wire:
 * `pnpm mutate packages/sync/test/laws.mutations.ts`. The journal's own hook
 * is broken in `packages/durable/test/laws.mutations.ts`.
 */
const tests = ['packages/sync/test/laws.test.ts']

export default [
  {
    name: 'the refusal is mapped without its rule',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'error.rule === undefined',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'the refusal names no rule',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'rule: Option.some(fitWords(rule)),',
        replace: 'rule: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: "the replica's judge is dropped",
    edits: [
      {
        file: '../src/sync.ts',
        find: `                    definition.judge === undefined
                      ? Option.none()`,
        replace: `                    true
                      ? Option.none()`,
      },
    ],
    tests: [...tests, 'packages/sync/test/mount.test.ts'],
  },
  {
    name: 'the laws never reach the journal or the replica',
    edits: [
      {
        file: '../src/make.ts',
        find: '...(options.laws === undefined ? {} : { judge }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'isInvalidBy ignores the id',
    edits: [
      {
        file: '../src/refusal.ts',
        find: "refusal._tag === 'Invalid' && Option.contains(refusal.rule, law.id)",
        replace: "refusal._tag === 'Invalid' && Option.isSome(refusal.rule)",
      },
    ],
    tests,
  },
  {
    name: 'a law of any length is taken',
    edits: [{ file: '../src/make.ts', find: 'fitWords(id) !== id ||', replace: 'false ||' }],
    tests,
  },
  {
    name: 'the last broken law is named',
    edits: [
      {
        file: '../src/make.ts',
        find: 'entries.find(([, holds])',
        replace: 'entries.findLast(([, holds])',
      },
    ],
    tests,
  },
]
