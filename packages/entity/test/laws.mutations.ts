/**
 * `Laws.check`, refinements and a write's `from` and `becomes`, broken in
 * turn: `pnpm mutate packages/entity/test/laws.mutations.ts`.
 */
const laws = 'packages/entity/test/laws.test.ts'
const refine = 'packages/entity/test/refine.test.ts'

export default [
  {
    name: 'undecided treated as kept',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'Undecided: ({ reason }) => LawVerdict.Undecided({ reason }),',
        replace: "Undecided: () => LawVerdict.Kept({ by: 'enumeration', rows: 0 }),",
      },
    ],
    tests: [laws],
  },
  {
    name: 'the when skipped while enumerating',
    edits: [{ file: '../src/enumerate.ts', find: 'if (refused) continue', replace: '' }],
    tests: [laws, refine],
  },
  {
    name: 'disjointness applied to a transition invariant',
    edits: [{ file: '../src/laws.ts', find: '!transition &&', replace: '' }],
    tests: [laws],
  },
  {
    name: 'becomes judged over the row before',
    edits: [
      {
        file: '../src/write.ts',
        find: 'Option.match(inState(target, step.after), {',
        replace: 'Option.match(inState(target, step.before), {',
      },
    ],
    tests: [refine],
  },
  {
    name: 'the from predicate dropped from the when',
    edits: [
      {
        file: '../src/write.ts',
        find: '...Option.toArray(Option.map(from, state => state.predicate as Predicate)),',
        replace: '',
      },
    ],
    tests: [refine, laws],
  },
  {
    name: 'an unknown footprint judged as writing nothing',
    edits: [
      {
        file: '../src/laws.ts',
        find: "Unknown: () => LawVerdict.Undecided({ reason: 'what it writes is unknown, so every member' }),",
        replace: "Unknown: () => LawVerdict.Kept({ by: 'declared', rows: 0 }),",
      },
    ],
    tests: [laws],
  },
  {
    name: 'an unknown footprint moving no state',
    edits: [
      { file: '../src/laws.ts', find: 'Unknown: () => undefined,', replace: 'Unknown: () => [],' },
    ],
    tests: [laws],
  },
  {
    name: 'a refused arrow counted as reaching its state',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'if (Option.isNone(refusedBy)) reached.add(to.name)',
        replace: 'reached.add(to.name)',
      },
    ],
    tests: [laws],
  },
  {
    name: 'a declared footprint over another Entity accepted',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'if (owner !== undefined && owner !== entry.entity.identity)',
        replace: 'if (false)',
      },
    ],
    tests: [laws],
  },
  {
    name: 'a non-local state accepted as a from',
    edits: [
      { file: '../src/refine.ts', find: 'if (!refinement.local)\n', replace: 'if (false)\n' },
    ],
    tests: [refine],
  },
  {
    name: 'a state of a row lacking a field judged out of it',
    edits: [
      {
        file: '../src/refine.ts',
        find: "if (verdict._tag === 'Unknown') return Option.none()",
        replace: "if (verdict._tag === 'Unknown') return Option.some(false)",
      },
    ],
    tests: [refine],
  },
  {
    name: 'an undecidable becomes accepted',
    edits: [
      {
        file: '../src/write.ts',
        find: 'Undecided: ({ reason }) => undecided(reason),',
        replace: 'Undecided: () => undefined,',
      },
    ],
    tests: [refine],
  },
]
