/**
 * The bounds pass of `Laws.check` (#600), broken in turn:
 * `pnpm mutate packages/entity/test/lawsBounds.mutations.ts`. The soundness
 * mutations are the property test's; the reach mutations the account's.
 */
const account = 'packages/entity/test/lawsAccount.test.ts'
const bounds = 'packages/entity/test/lawsBounds.test.ts'
const laws = 'packages/entity/test/laws.test.ts'

export default [
  {
    name: 'the three-valued keep skipped',
    edits: [
      {
        file: '../src/bounds.ts',
        find: "if (truthOf(held.predicate, current, 'after') === T) {",
        replace: 'if (false) {',
      },
    ],
    tests: [account],
  },
  {
    name: 'the invariants held before narrow nothing',
    edits: [
      {
        file: '../src/bounds.ts',
        find: "        if (!narrow(at, regionOf(held.predicate, at, 'before', true))) return Option.none()\n",
        replace: '        void held\n',
      },
    ],
    tests: [account],
  },
  {
    name: "the input's Schema bounds ignored",
    edits: [
      {
        file: '../src/bounds.ts',
        find: '    vars.set(`input.${key}`, bound.range)',
        replace: '    vars.set(`input.${key}`, whole)',
      },
    ],
    tests: [account],
  },
  {
    name: 'a witness the judge does not refuse',
    edits: [
      {
        file: '../src/bounds.ts',
        find: "    if (judgedAfter._tag !== 'Invalid') continue\n",
        replace: '',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'a witness that does not meet the when',
    edits: [{ file: '../src/bounds.ts', find: '      if (!meets) continue\n', replace: '' }],
    tests: [account, bounds],
  },
  {
    name: 'a witness breaking an invariant held before',
    edits: [{ file: '../src/bounds.ts', find: '      if (!allowed) continue\n', replace: '' }],
    tests: [account, bounds],
  },
  {
    name: 'a closed bound compared as open',
    edits: [
      {
        file: '../src/bounds.ts',
        find: '(!strict && left.lo === right.hi && !left.loOpen && !right.hiOpen)',
        replace: '(strict && left.lo === right.hi && !left.loOpen && !right.hiOpen)',
      },
    ],
    tests: [bounds],
  },
  {
    name: "an operator's decreasing argument read as increasing",
    edits: [
      {
        file: '../src/bounds.ts',
        find: "(directions[at] === 'increasing') === lowest ? range.lo : range.hi",
        replace: 'lowest ? range.lo : range.hi',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: "a decrement's amount added",
    edits: [
      {
        file: '../src/bounds.ts',
        find: '          const amount = down\n',
        replace: '          const amount = false\n',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: "a decrement's witness worked out as an increment",
    edits: [
      {
        file: '../src/bounds.ts',
        find: 'held + (down ? 0 - amount : amount)',
        replace: 'held + amount',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'a law over the finite numbers not read',
    edits: [
      {
        file: '../src/bounds.ts',
        find: 'each.position === position && coversFinite(each.domain)',
        replace: 'each.position === position && Option.isNone(each.domain)',
      },
    ],
    tests: [account],
  },
  {
    name: 'an or narrowed as an and',
    edits: [
      {
        file: '../src/bounds.ts',
        find: '        (want ? union : intersect)(operands.map(each => regionOf(each, at, side, want))),',
        replace:
          '        (want ? intersect : union)(operands.map(each => regionOf(each, at, side, want))),',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'one unknown against itself read as two',
    edits: [
      {
        file: '../src/bounds.ts',
        find: 'return Option.isSome(l) && Option.contains(identityOf(right, at, side), l.value)',
        replace: 'return false && Option.isSome(l)',
      },
    ],
    tests: [laws],
  },
  {
    name: 'the ends of an interval never tried',
    edits: [
      {
        file: '../src/bounds.ts',
        find: 'const raw = [0, range.lo, range.hi, 1, -1, range.lo + 1, range.hi - 1]',
        replace: 'const raw = [0, 1, -1]',
      },
    ],
    tests: [account],
  },
  {
    name: 'a witness needing every member worked out, read or not',
    edits: [
      {
        file: '../src/bounds.ts',
        find: '      else if (held.after.includes(key)) computed = false\n',
        replace: '      else if (key.length > 0) computed = false\n',
      },
    ],
    tests: [account],
  },
  {
    name: 'an opaque reason lost',
    edits: [
      {
        file: '../src/bounds.ts',
        find: "  if (opaque.size > 0) return [...opaque].join('; ')\n",
        replace: '',
      },
    ],
    tests: [account],
  },
  {
    name: 'an unmeetable write never reported',
    edits: [
      {
        file: '../src/bounds.ts',
        find: '      each.some(step =>\n',
        replace: '      each.length >= 0 || each.some(step =>\n',
      },
    ],
    tests: [account],
  },
  {
    name: 'a meetable write reported',
    edits: [
      {
        file: '../src/bounds.ts',
        find: '        Option.isSome(caseOf(write, step, members, inputs.bounds, assumed, operators)),',
        replace:
          '        Option.isNone(caseOf(write, step, members, inputs.bounds, assumed, operators)),',
      },
    ],
    tests: [account],
  },
  {
    name: 'a bounds keep issued as Enumerated',
    edits: [
      {
        file: '../src/laws.ts',
        find: "issuer.issue(by === 'bounds' ? Evidence.Bounded(pair) : Evidence.Enumerated(pair)),",
        replace: 'issuer.issue(Evidence.Enumerated(pair)),',
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
