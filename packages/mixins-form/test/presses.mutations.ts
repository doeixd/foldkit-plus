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
  {
    name: 'an issue in a row does not name its row',
    edits: [
      {
        file: view,
        find: "cardinality === 'many' ? `${label} ${index + 1}` : label",
        replace: 'label',
      },
    ],
    tests: ['packages/mixins-form/test/nested.test.ts'],
  },
  {
    name: 'a row inside a row forgets the outer one',
    edits: [
      {
        file: view,
        find: 'onSome: outer => `${outer}, ${rowName(index)}`,',
        replace: 'onSome: () => rowName(index),',
      },
    ],
    tests: ['packages/mixins-form/test/nested.test.ts'],
  },
  {
    name: 'two rows are named alike',
    edits: [
      {
        file: view,
        find: "cardinality === 'many' ? `${label} ${index + 1}` : label",
        replace: 'label',
      },
    ],
    tests: ['packages/mixins-form/test/nested.test.ts'],
  },
  {
    name: 'a press with a choice flips a flag',
    edits: [
      {
        file: form,
        find: "if (kind !== 'list' || !Array.isArray(draft)) return Option.none()",
        replace: 'if (!Array.isArray(draft)) return Option.some(draft !== true)',
      },
    ],
    tests: ['packages/form/test/choices.test.ts'],
  },
  {
    name: 'a Bundle field says it is checking',
    edits: [
      {
        file: view,
        find: 'const saysChecking = checking && input.bundle === undefined',
        replace: 'const saysChecking = checking',
      },
    ],
    tests: ['packages/form-recipes/test/image.test.ts'],
  },
]
