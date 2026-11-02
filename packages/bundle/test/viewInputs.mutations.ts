/**
 * A placement's `viewInputs`, broken: `pnpm mutate packages/bundle/test/viewInputs.mutations.ts`.
 */
const file = '../src/placed.ts'
const tests = ['packages/bundle/test/viewInputs.test.ts']

export default [
  {
    name: 'the placement draws with the inputs given, never its own',
    edits: [{ file, find: ': config.viewInputs(parent, given)', replace: ': given' }],
    tests,
  },
  {
    name: 'a view drawn without inputs is handed some',
    edits: [
      {
        file,
        find: 'config.viewInputs === undefined || given === undefined',
        replace: 'config.viewInputs === undefined',
      },
    ],
    tests,
  },
  // The two below are types, which Vitest does not check: `tsc -b packages/bundle`
  // kills each (an unused `@ts-expect-error`, then a refused headless placement).
  {
    name: 'a view taking no inputs accepts viewInputs',
    edits: [
      {
        file: '../src/bundle.ts',
        find: 'readonly viewInputs?: [ViewInputs] extends [void]',
        replace: 'readonly viewInputs?: [ViewInputs] extends [never]',
      },
    ],
    tests,
    survives: 'a type: tsc -b reports the @ts-expect-error in viewInputs.test.ts unused',
  },
  {
    name: 'a bundle without a view takes no inputs, as a (model, h) view',
    edits: [
      {
        file: '../src/bundle.ts',
        find: 'ViewInputs = NoView,',
        replace: 'ViewInputs = void,',
        all: true,
      },
    ],
    tests,
    survives: 'a type: tsc -b refuses the headless placement in viewInputs.test.ts',
  },
]
