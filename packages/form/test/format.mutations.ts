/**
 * Showing a value as text, and a key that is any number of a fixed set, broken
 * in turn: `pnpm mutate packages/form/test/format.mutations.ts`.
 */
const input = '../src/input.ts'
const index = '../src/index.ts'
const tests = ['packages/form/test/format.test.ts', 'packages/form/test/choices.test.ts']

export default [
  {
    name: 'a filled value is shown as its raw text, not as its control formats it',
    edits: [
      {
        file: index,
        find: 'return format === undefined ? String(value) : format(value, plan.control.data)',
        replace: 'return String(value)',
      },
    ],
    tests: ['packages/form/test/format.test.ts'],
  },
  {
    name: 'a value that cannot be shown fails without naming the key',
    edits: [
      {
        file: index,
        find: '"${plan.key}" cannot show that value:',
        replace: 'cannot show that value:',
      },
    ],
    tests: ['packages/form/test/format.test.ts'],
  },
  {
    name: 'a choice list is read as its text, not as the options it names',
    edits: [
      {
        file: index,
        find: 'control.parseList !== undefined && Array.isArray(draft)',
        replace: 'control.parseList === undefined && Array.isArray(draft)',
      },
    ],
    tests,
  },
  {
    name: 'a chosen option that was not offered still passes',
    edits: [
      {
        file: input,
        find: 'return chosen.some(option => option === undefined) ? undefined : chosen',
        replace: 'return chosen',
      },
    ],
    tests,
  },
  {
    name: 'an array of literals resolves to no control',
    edits: [
      {
        file: input,
        find: 'if (items !== undefined) return Choices.of({ options: items })',
        replace:
          'if (items !== undefined && items.length === 0) return Choices.of({ options: items })',
      },
    ],
    tests,
  },
  {
    name: 'a choice group forgets the options it was given',
    edits: [
      {
        file: input,
        find: 'choices: (options: ReadonlyArray<string | number>): Control => Choices.of({ options }),',
        replace:
          'choices: (options: ReadonlyArray<string | number>): Control => Choices.of({ options: [] }),',
      },
    ],
    tests,
  },
]
