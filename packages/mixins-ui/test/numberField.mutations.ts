/**
 * The number field, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/numberField.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/numberField.test.ts']
const browser = ['packages/mixins-ui/test/numberField.browser.test.ts']
const view = '../src/numberField.ts'

export default [
  {
    name: 'a value is not clamped',
    edits: [
      {
        file: view,
        find: 'return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, exact))',
        replace: 'return exact',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a decimal step drifts',
    edits: [
      {
        file: view,
        find: 'const exact = Number(stepped.toFixed(places))',
        replace: 'const exact = stepped + places * 0',
      },
    ],
    tests: unit,
  },
  {
    name: 'text that is no number becomes zero',
    edits: [
      { file: view, find: "text.trim() === '' || !Number.isFinite(typed)", replace: 'false' },
    ],
    tests: browser,
  },
  {
    name: 'a stepper at its bound still steps',
    edits: [{ file: view, find: '...(disabled || at', replace: '...(disabled' }],
    tests: unit,
  },
]
