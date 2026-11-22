/**
 * The pairs `Laws.check` leaves to metakit's checker, broken in turn:
 * `pnpm mutate packages/entity/test/pairCheck.mutations.ts`. A kept pair must
 * be kept for every row the declarations allow (the property test against the
 * reference judge), and a refusal must be a row and input the judge refuses.
 */
const account = 'packages/entity/test/lawsAccount.test.ts'
const bounds = 'packages/entity/test/lawsBounds.test.ts'
const laws = 'packages/entity/test/laws.test.ts'
const pair = 'packages/entity/test/pairCheck.test.ts'

export default [
  {
    name: 'the rules assumed of the row before dropped',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "      assume.push(expr(underStates(lower([held.predicate]).nodes[0]!, 'state', false)))",
        replace: '      void held',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'the finite members never split into cases',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: 'if (members.reduce((total, { values }) => total * values.length, 1) > MAX_CASES) return [[]]',
        replace: 'return [[]]',
      },
    ],
    tests: [account, pair],
  },
  {
    name: 'a proof credited to the weakest tier of its cases',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: 'if (rank[found] > rank[tier]) tier = found',
        replace: 'if (rank[found] < rank[tier]) tier = found',
      },
    ],
    tests: [account],
  },
  {
    name: 'the row after read as the row before',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "Node.Path({ segments: [after, 'row', key], ast: Option.none() })",
        replace: "Node.Path({ segments: ['state', 'row', key], ast: Option.none() })",
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'another row read as this one',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "    if (!plain) throw new Unreadable(`it reads ${segments.join('.')}, another row than its own`)",
        replace: '',
      },
    ],
    tests: [laws, pair],
  },
  {
    name: 'a write transitionOf cannot translate escapes as a throw',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "if (error instanceof Error && error.message.startsWith('[foldkit-entity] transitionOf'))",
        replace: 'if (false)',
      },
    ],
    tests: [pair],
  },
  {
    name: 'a write no row can meet always reported meetable',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: '    return !Verdict.isTrue(never)',
        replace: '    return true',
      },
    ],
    tests: [account],
  },
  {
    name: 'a witness the judge does not refuse',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "    if (judgeAgainst([held], insert ? { after } : { before, after }, operators)._tag !== 'Invalid')\n      continue\n",
        replace: '',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'a witness that does not meet the guard',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: '    if (evalNode(transition.when.node, env, foreign) !== true) continue\n',
        replace: '',
      },
    ],
    tests: [account, bounds],
  },
  {
    name: 'a witness from a row the assumed invariants refuse',
    edits: [{ file: '../src/pairCheck.ts', find: '    if (!allowed) continue\n', replace: '' }],
    tests: [account, bounds],
  },
  {
    name: 'a member the table cannot compute always blocks the witness',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: "value.reason === 'unsupported' && !held.after.includes(target[1]!)",
        replace: 'false',
      },
    ],
    tests: [account],
  },
  {
    name: 'a witness number outside its Schema',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: 'const near = pool.filter(takes).sort(',
        replace: 'const near = [...pool].sort(',
      },
    ],
    tests: [bounds],
  },
  {
    name: 'the revision a write expects left out of its input',
    edits: [
      {
        file: '../src/pairCheck.ts',
        find: '  if (write.expect !== undefined) keys.add(write.expect.key)\n',
        replace: '',
      },
    ],
    tests: [laws],
  },
]
