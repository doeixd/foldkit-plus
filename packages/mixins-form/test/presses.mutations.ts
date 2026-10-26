/**
 * What the form review fixed, broken in turn:
 * `pnpm mutate packages/mixins-form/test/presses.mutations.ts`.
 */
const view = '../src/index.ts'
const renderers = '../src/renderers.ts'
const form = '../../form/src/index.ts'

export default [
  {
    name: 'a press on a choice replaces the list',
    edits: [{ file: form, find: ': [...draft, choice],', replace: ': [choice],' }],
    tests: ['packages/mixins-form/test/runtime.test.ts'],
  },
  {
    name: 'a press on a flag sets it on',
    edits: [{ file: form, find: 'Option.some(draft !== true)', replace: 'Option.some(true)' }],
    tests: ['packages/mixins-form/test/runtime.test.ts'],
  },
  {
    name: 'a group that must hold two is tried with one',
    edits: [
      {
        file: form,
        find: 'control.data.options.slice(0, index + 1)',
        replace: 'control.data.options.slice(0, 1)',
      },
    ],
    tests: ['packages/form/test/choices.test.ts'],
  },
  {
    name: 'a group loses its descriptions',
    edits: [{ file: renderers, find: "  'AriaDescribedBy',\n", replace: '' }],
    tests: ['packages/mixins-form/test/uiRenderers.test.ts'],
  },
  {
    name: 'a row picker is offered more',
    edits: [{ file: view, find: "path === '' &&\n", replace: '' }],
    tests: ['packages/mixins-form/test/nested.test.ts'],
  },
  {
    name: 'a locked picker is offered more',
    edits: [{ file: view, find: '!locked.has(key) &&\n', replace: '' }],
    tests: ['packages/mixins-form/test/view.test.ts'],
  },
  {
    name: 'any key is offered more',
    edits: [{ file: view, find: '(Input.RelationOne.is(control.control) ||', replace: '(true ||' }],
    tests: ['packages/mixins-form/test/view.test.ts'],
  },
]
