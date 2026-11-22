/**
 * What `Laws.check` reports of a pair the checker decided, broken in turn:
 * `pnpm mutate packages/entity/test/lawsBounds.mutations.ts`. The checker's
 * own reading is `pairCheck.mutations.ts`.
 */
const account = 'packages/entity/test/lawsAccount.test.ts'
const laws = 'packages/entity/test/laws.test.ts'

export default [
  {
    name: "a checker's proof issued as Enumerated",
    edits: [
      {
        file: '../src/laws.ts',
        find: "by === 'concrete' || by === 'interval' || by === 'zone' || by === 'z3'",
        replace: 'false',
      },
    ],
    tests: [account],
  },
  {
    name: 'the hint never given',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'if (starts.length === 0 || !starts.every(name => unreached.has(name))) return pair',
        replace: 'return pair',
      },
    ],
    tests: [account],
  },
  {
    name: 'the hint given from a reached state',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'if (starts.length === 0 || !starts.every(name => unreached.has(name))) return pair',
        replace: 'if (starts.length === 0) return pair',
      },
    ],
    tests: [account],
  },
  {
    name: 'refusals counted as undecided',
    edits: [
      {
        file: '../src/laws.ts',
        find: "refused: count('Refused'),",
        replace: "refused: count('Undecided'),",
      },
    ],
    tests: [account],
  },
  {
    name: 'a witness not printed',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'Refused: ({ witness, hint }) => shownWitness(witness, hint),',
        replace: 'Refused: () => [],',
      },
    ],
    tests: [account, laws],
  },
]
