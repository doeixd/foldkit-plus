/**
 * A document's laws, broken in turn on each side of the wire:
 * `pnpm mutate packages/sync/test/laws.mutations.ts`. The journal's own hook
 * is broken in `packages/durable/test/laws.mutations.ts`.
 */
const tests = ['packages/sync/test/laws.test.ts']

export default [
  {
    name: 'declared transitions also perturb the app reducer',
    edits: [
      {
        file: '../src/mount.ts',
        find: 'declared ? [] : readsOutside(model, message)',
        replace: 'readsOutside(model, message)',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a dead transition is accepted',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'Verdict.isTrue(Abstract.checkInvariant(environment, Bool.not(declared.when)))',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'the reachability of a guard is judged without the laws',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'const environment = Schema.Struct({ state, input })',
        replace:
          'const environment = Schema.Struct({ state: Schema.Struct({ model: shared }), input })',
      },
    ],
    tests,
  },
  {
    name: 'make ignores what a transition finds unsound',
    edits: [
      {
        file: '../src/make.ts',
        find: 'if (Option.isSome(unsound)) throw',
        replace: 'if (false) throw',
      },
    ],
    tests,
  },
  {
    name: 'make hands a transition no laws',
    edits: [
      {
        file: '../src/make.ts',
        find: 'transition.check({ shared: sharedCodec, input, laws })',
        replace: 'transition.check({ shared: sharedCodec, input, laws: [] })',
      },
    ],
    tests,
  },
  {
    name: 'a Message whose guard is false is replayed as a no-op',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'if (Result.isFailure(result)) throw new Error(result.failure.reason)',
        replace: 'if (Result.isFailure(result)) return shared',
      },
    ],
    tests,
  },
  {
    name: 'a transition that breaks an invariant is accepted',
    edits: [
      { file: '../src/metakit.ts', find: 'Verdict.isFalse(', replace: 'false && Verdict.isFalse(' },
    ],
    tests,
  },
  {
    name: 'an expression law judges the previous snapshot',
    edits: [
      {
        file: '../src/metakit.ts',
        find: '({ after }) => Expr.eval(expression, { model: after })',
        replace: '({ before }) => Expr.eval(expression, { model: before })',
      },
    ],
    tests,
  },
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
