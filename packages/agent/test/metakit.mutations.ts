/**
 * `foldkit-agent/metakit`, broken in turn: `pnpm mutate packages/agent/test/metakit.mutations.ts`.
 */
const tools = '../src/metakit.ts'
const tests = ['packages/agent/test/metakit.test.ts']

export default [
  {
    name: 'a guard that is Unknown hides the tool',
    edits: [
      {
        file: tools,
        find: '!Verdict.isFalse(\n        canDispatch',
        replace: 'Verdict.isTrue(\n        canDispatch',
      },
    ],
    tests,
  },
  {
    name: 'a guard that is False leaves the tool available',
    edits: [
      {
        file: tools,
        find: '!Verdict.isFalse(\n        canDispatch',
        replace: '!Verdict.isUnknown(\n        canDispatch',
      },
    ],
    tests,
  },
  {
    name: 'a tool with authorize shows the state through its availability',
    edits: [
      {
        file: tools,
        find: '...(declared.authorize === undefined ? { available } : {}),',
        replace: 'available,',
      },
    ],
    tests,
  },
  {
    name: 'a call is not checked against the guard',
    edits: [{ file: tools, find: 'allows(model, decoded) || refused', replace: 'true' }],
    tests,
  },
  {
    name: 'the JSON Schema gains no metakit constraints',
    edits: [{ file: tools, find: '        [refineInputJsonSchema]: refine,\n', replace: '' }],
    tests,
  },
  {
    name: 'expose ignores the refinement',
    edits: [
      {
        file: '../src/expose.ts',
        find: 'refine === undefined ? derived : refine(derived)',
        replace: 'derived',
      },
    ],
    tests,
  },
  {
    name: 'a lower bound keeps the looser value',
    edits: [
      {
        file: tools,
        find: 'tighter(derived[keyword], declared[keyword], Math.max)',
        replace: 'tighter(derived[keyword], declared[keyword], Math.min)',
      },
    ],
    tests,
  },
  {
    name: 'an upper bound keeps the looser value',
    edits: [
      {
        file: tools,
        find: 'tighter(derived[keyword], declared[keyword], Math.min)',
        replace: 'tighter(derived[keyword], declared[keyword], Math.max)',
      },
    ],
    tests,
  },
  {
    name: "metakit's bound always wins",
    edits: [
      {
        file: tools,
        find: "typeof declared === 'number' ? pick(derived, declared) : declared",
        replace: "typeof declared === 'number' ? declared : declared",
      },
    ],
    tests,
  },
  {
    name: 'excess properties are advertised as allowed',
    edits: [{ file: tools, find: 'additionalProperties: false,', replace: '' }],
    tests,
  },
  {
    name: 'the default name is the bare transition key',
    edits: [
      { file: tools, find: 'declared.name ?? defaultName(key)', replace: 'declared.name ?? key' },
    ],
    tests,
  },
  {
    name: 'authorize is dropped',
    edits: [{ file: tools, find: 'authorize: declared.authorize,', replace: '' }],
    tests,
  },
]
