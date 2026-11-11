/**
 * What a conjunction fixes by field (#409), broken in turn:
 * `pnpm mutate packages/entity/test/pins.mutations.ts`.
 */
const evaluate = '../src/evaluate.ts'
const tests = ['packages/entity/test/pins.test.ts']

export default [
  {
    name: 'a field on the right fixes nothing',
    edits: [
      {
        file: evaluate,
        find: 'Option.map(fieldOf(right), field => [field, left] as const)',
        replace: 'Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'two values for one field are whole',
    edits: [
      {
        file: evaluate,
        find: '    if (pins.has(key) && pins.get(key) !== value) whole = false\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'any value is a pin',
    edits: [
      { file: evaluate, find: 'Option.filter(given(side), pinnable)', replace: 'given(side)' },
    ],
    tests,
  },
  {
    name: 'a conjunct that fixes nothing leaves the rest whole',
    edits: [
      {
        file: evaluate,
        find: '    if (Option.isNone(pin)) {\n      whole = false\n      continue\n    }',
        replace: '    if (Option.isNone(pin)) continue',
      },
    ],
    tests,
  },
  {
    name: 'the viewer fixes nothing',
    edits: [
      {
        file: evaluate,
        find: 'Viewer: viewer => (context === undefined ? Option.none() : contextValue(viewer, context)),',
        replace: 'Viewer: () => Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a literal fixes nothing',
    edits: [
      {
        file: evaluate,
        find: 'Literal: ({ value }) => Option.some<unknown>(value),',
        replace: 'Literal: () => Option.none(),',
      },
    ],
    tests,
  },
]
