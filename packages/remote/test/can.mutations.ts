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
    'if (Verdict.isFalse(met))',
    'if (Verdict.isTrue(met))',
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
    'if (Verdict.isUnknown(met)) reasons.push(met.reason)',
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
  edit('a may member not held is taken as not refusing', can, 'unheld.length === 0', 'true'),
  edit('a row not held is asked as if it were', can, 'if (Option.isNone(found))', 'if (false)'),
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
  edit(
    'Data.capability refuses Undecided in authorize',
    can,
    'Unknown: allowed,\n      }),\n    applies',
    'Unknown: () => false,\n      }),\n    applies',
  ),
  edit(
    'Data.capability refuses Undecided in applies',
    can,
    'Unknown: allowed,\n      })\n    },',
    'Unknown: () => false,\n      })\n    },',
  ),
  edit(
    'Data.capability lets a forbidding may through authorize',
    can,
    'onSome: words => ({ allowed: false as const, reason: words }),',
    'onSome: () => true,',
  ),
  edit(
    "Data.capability tells the row's state in authorize",
    can,
    'Unmet: allowed,\n                Invalid: allowed,',
    'Unmet: () => false,\n                Invalid: allowed,',
  ),
  edit(
    'Data.capability lets an unmet when through applies',
    can,
    'Unmet: () => ({\n',
    'Unmet: allowed,\n            Ignored: () => ({\n',
  ),
  edit(
    'Data.capability lets a broken invariant through applies',
    can,
    'Invalid: ({ message }) => ({ applies: false as const, reason: message }),',
    'Invalid: allowed,',
  ),
  edit('Data.available ignores No', can, 'False: () => false,', 'False: () => true,'),
  edit('Data.available refuses Undecided', can, 'Unknown: () => true,', 'Unknown: () => false,'),
  edit(
    'Data.available is true with no row named',
    can,
    'onNone: () => false,\n      onSome: input =>',
    'onNone: () => true,\n      onSome: input =>',
  ),
]
