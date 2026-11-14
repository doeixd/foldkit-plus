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
        find: 'holds: inState(target, step.after)',
        replace: 'holds: inState(target, step.before)',
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
    name: 'a state over a number enumerated with the others',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'const members = [...new Set(enumerable.flatMap(state => state.reads))]',
        replace: 'const members = [...new Set(local.flatMap(state => state.reads))]',
      },
    ],
    tests: [laws],
  },
  {
    name: 'the revision a write expects read as unwritten',
    edits: [
      {
        file: '../src/write.ts',
        find: '...(write.expect === undefined ? [] : [write.expect.field.key]),',
        replace: '',
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
        find: 'Unknown: () => Option.none(),',
        replace: 'Unknown: () => Option.some(false),',
      },
    ],
    tests: [refine],
  },
  {
    name: 'an undecidable becomes accepted with no postcondition',
    edits: [
      { file: '../src/write.ts', find: 'Undecided: enforced,', replace: 'Undecided: () => write,' },
    ],
    tests: [refine, laws],
  },
  {
    name: 'the postcondition judged over the row before',
    edits: [
      {
        file: '../src/write.ts',
        find: 'predicate: target.after as Predicate,',
        replace: 'predicate: target.predicate as Predicate,',
      },
    ],
    tests: [refine],
  },
  {
    name: "a write's postcondition left out of its pairs",
    edits: [
      {
        file: '../src/laws.ts',
        find: '[...invariantsOf(entity), ...ensured]',
        replace: 'invariantsOf(entity)',
      },
    ],
    tests: [laws],
  },
  {
    name: 'an enforced becomes not reported',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'if (Option.isSome(ensures) && Option.isSome(becomes)) {',
        replace: 'if (false) {',
      },
    ],
    tests: [laws],
  },
  {
    name: 'Enumerated issued for an undecided pair',
    edits: [
      {
        file: '../src/laws.ts',
        find: '    Refused: () => Option.none(),\n    Undecided: () => Option.none(),',
        replace:
          '    Refused: () => Option.none(),\n    Undecided: () =>\n      Option.some(issuer.issue(Evidence.Enumerated({ transition: transition({ name }), law: law(held) }))),',
      },
    ],
    tests: [laws],
  },
  {
    name: 'Enumerated issued for a refused pair',
    edits: [
      {
        file: '../src/laws.ts',
        find: '    Refused: () => Option.none(),\n    Undecided',
        replace:
          '    Refused: () =>\n      Option.some(issuer.issue(Evidence.Enumerated({ transition: transition({ name }), law: law(held) }))),\n    Undecided',
      },
    ],
    tests: [laws],
  },
  {
    name: "Enumerated issued on an author's word",
    edits: [
      { file: '../src/laws.ts', find: "by === 'declared'", replace: "by === ('none' as string)" },
    ],
    tests: [laws],
  },
  {
    name: 'Enumerated records left unissued',
    edits: [
      {
        file: '../src/laws.ts',
        find: 'issuer.issue(Evidence.Enumerated({ transition: transition({ name }), law: law(held) })),',
        replace: 'Evidence.Enumerated({ transition: transition({ name }), law: law(held) }),',
      },
    ],
    tests: [laws],
  },
  {
    name: "facts keep a write's postcondition as a law",
    edits: [
      { file: '../src/laws.ts', find: '    if (pair.postcondition) continue\n', replace: '' },
    ],
    tests: [laws],
  },
  {
    name: 'facts draw no keeps edge',
    edits: [
      {
        file: '../src/laws.ts',
        find: '    if (Option.isSome(pair.evidence))',
        replace: "    if (Option.isSome(pair.evidence) && pair.write === '')",
      },
    ],
    tests: [laws],
  },
  {
    name: 'facts draw no to edge for an enforced becomes',
    edits: [
      {
        file: '../src/laws.ts',
        find: "if (Finding.$is('Enforced')(finding)) {",
        replace: "if (Finding.$is('Enforced')(finding) && finding.write === '') {",
      },
    ],
    tests: [laws],
  },
  {
    name: 'facts read a declared footprint as writing nothing',
    edits: [
      {
        file: '../src/laws.ts',
        find: '      Declared: ({ writes }) => writes,\n      Unknown: () => [],',
        replace: '      Declared: () => [],\n      Unknown: () => [],',
      },
    ],
    tests: [laws],
  },
]
