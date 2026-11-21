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
        find: 'Option.isSome(declared) ? [] : readsOutside(model, message)',
        replace: 'readsOutside(model, message)',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'the mount never asks a declared transition',
    edits: [
      {
        file: '../src/mount.ts',
        find: 'const declared = sync.live(model, message)',
        replace: 'const declared = Option.none<Model>()',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a declared transition that changes nothing gives the mount a new Model',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'Option.some(after === before ? model : projection.set(model, after))',
        replace: 'Option.some(projection.set(model, after))',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a declared Message refused in the mount throws out of update',
    edits: [
      {
        file: '../src/metakit.ts',
        find: '          } catch {\n',
        replace: '          } catch (error) {\n            throw error\n',
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
        find: 'const environment = Schema.Struct({ state, input, supplied: Schema.Struct({}) })',
        replace:
          'const environment = Schema.Struct({ state: Schema.Struct({ model: shared }), input, supplied: Schema.Struct({}) })',
      },
    ],
    tests,
  },
  {
    name: 'a transition found unsound is bound all the same',
    edits: [
      {
        file: '../src/metakit.ts',
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
        find: 'laws: Object.values(options.laws ?? {}),',
        replace: 'laws: [],',
      },
    ],
    tests,
  },
  {
    name: 'a transition under a tag the document does not record is bound',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'if (input === undefined) throw',
        replace: 'if (false) throw',
      },
    ],
    tests: ['packages/sync/test/laws.test.ts', 'packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a declared transition replays every tag of the document',
    edits: [
      {
        file: '../src/metakit.ts',
        find: 'Option.exists(tagOf(message), named => named === tag)',
        replace: 'true',
      },
    ],
    tests: ['packages/sync/test/laws.test.ts', 'packages/sync/test/mount.test.ts'],
  },
  {
    name: 'make drops the replay a declared transition gives',
    edits: [
      {
        file: '../src/make.ts',
        find: 'const replay = declared.replay',
        replace: 'const replay = fallbackReplay',
      },
    ],
    tests: ['packages/sync/test/laws.test.ts', 'packages/sync/test/mount.test.ts'],
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
        find: '({ after }) =>\n    Result.getOrElse(Expr.evalResult(expression, { model: after })',
        replace:
          '({ before }) =>\n    Result.getOrElse(Expr.evalResult(expression, { model: before })',
      },
    ],
    tests,
  },
  {
    name: 'a law metakit refuses to evaluate over a snapshot holds of it',
    edits: [
      {
        file: '../src/metakit.ts',
        find: '() => false) === true',
        replace: '() => true) === true',
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
