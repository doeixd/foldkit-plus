/**
 * The Field shell, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fieldShell.mutations.ts` checks that a
 * test fails for every one.
 */
const view = '../src/fieldShell.ts'
const unit = 'packages/mixins-ui/test/fieldShell.test.ts'

export default [
  {
    name: 'the label names no control',
    edits: [{ file: '../src/fieldShell.ts', find: 'h.For(options.id)', replace: "h.For('x')" }],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the required mark is read aloud',
    edits: [
      {
        file: '../src/fieldShell.ts',
        find: "h.AriaHidden(true), h.DataAttribute('kind', 'required')",
        replace: "h.DataAttribute('kind', 'required')",
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the marker words are ignored',
    edits: [{ file: '../src/fieldShell.ts', find: 'text.required', replace: 'words.required' }],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the errors are not an alert',
    edits: [{ file: '../src/fieldShell.ts', find: "h.Role('alert')", replace: "h.Role('status')" }],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the description has no id',
    edits: [
      {
        file: '../src/fieldShell.ts',
        find: 'h.Id(descriptionId(options.id))',
        replace: 'h.Id(options.id)',
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the shell never says it is invalid',
    edits: [
      {
        file: '../src/fieldShell.ts',
        find: "...(errors.length === 0 ? [] : [h.DataAttribute('invalid', '')]),",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the orientation is dropped',
    edits: [
      {
        file: '../src/fieldShell.ts',
        find: "options.orientation ?? 'vertical'",
        replace: "'vertical'",
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'the label aside is dropped',
    edits: [
      {
        file: '../src/fieldShell.ts',
        find: 'options.labelAside === undefined\n        ? label',
        replace: 'true\n        ? label',
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.test.ts'],
  },
  {
    name: 'a horizontal label column has no width of its own',
    edits: [
      {
        file: '../src/recipes/fieldShell.ts',
        find: "gridTemplateColumns: 'minmax(6rem, 12rem) minmax(0, 1fr)',",
        replace: "gridTemplateColumns: 'auto minmax(0, 1fr)',",
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.browser.test.ts'],
  },
  {
    name: 'a label is not in the error ink',
    edits: [
      {
        file: '../src/recipes/fieldShell.ts',
        find: "Style.nest('[data-invalid] &', { color: ref.error.ink }),",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/fieldShell.browser.test.ts'],
  },
  {
    name: 'a control is not pointed at the errors',
    edits: [
      {
        file: view,
        find: '...(drawn.errors === true ? [errorsId(id)] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
]
