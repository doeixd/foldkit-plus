/**
 * `Data.can`, each part and each way of not deciding broken in turn:
 * `pnpm mutate packages/remote/test/can.mutations.ts`.
 */
const tests = ['packages/remote/test/can.test.ts']
const can = '../src/canOf.ts'
const mutation = '../src/mutation.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a held may never refuses',
    can,
    'if (Option.isSome(forbidden))',
    'if (false && Option.isSome(forbidden))',
  ),
  edit(
    'a when that does not hold never refuses',
    can,
    'if (Result.isSuccess(met) && !met.success)',
    'if (Result.isSuccess(met) && met.success)',
  ),
  edit(
    'a broken invariant never refuses',
    can,
    'Invalid: ({ failures }) => Option.fromUndefinedOr(failures[0]),',
    'Invalid: () => Option.none(),',
  ),
  edit(
    'a when that cannot be decided says nothing',
    can,
    'if (Result.isFailure(met)) reasons.push(met.failure)',
    '',
  ),
  edit(
    'an invariant that cannot be decided says nothing',
    can,
    'reasons.push(\n          `the invariants',
    '[].push(\n          `the invariants',
  ),
  edit(
    'an input key the when reads is taken as given',
    mutation,
    '!Object.hasOwn(encoded, key)',
    'false',
  ),
  edit(
    'a row not held is asked as if it were',
    can,
    "if (write._tag !== 'Insert' && Option.isNone(row))",
    'if (false)',
  ),
  edit(
    'a missing id is asked as if it were given',
    can,
    'if (own(input, write.id.key) === undefined)',
    'if (false)',
  ),
  edit(
    'the invariants are judged without the row before',
    mutation,
    'Match.orElse(() => (before === undefined ? { after } : { after, before })),',
    'Match.orElse(() => ({ after })),',
  ),
]
