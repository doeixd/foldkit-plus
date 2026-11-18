/**
 * The Disclosure's view and state, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/disclosureView.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/disclosureView.test.ts']
const view = '../src/disclosure/view.ts'
const state = '../src/disclosure/state.ts'

export default [
  {
    name: 'the icon is not drawn',
    edits: [{ file: view, find: '[h.span(drawn.icon, [options.icon])]', replace: '[]' }],
    tests: unit,
  },
  {
    name: 'the peek is not passed to the panel',
    edits: [
      {
        file: view,
        find: 'options.peek === undefined ? undefined : { peek: options.peek }',
        replace: 'undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled disclosure still sends',
    edits: [{ file: view, find: '{ isDisabled: true }', replace: '{}' }],
    tests: unit,
  },
  {
    name: 'a press always asks to open',
    edits: [
      {
        file: view,
        find: 'onToggle: options.onToggle,',
        replace: 'onToggle: () => options.onToggle(true),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a press that asks for the state it has returns a new Model',
    edits: [{ file: state, find: 'isOpen === model.isOpen', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a preset is not read',
    edits: [
      {
        file: '../src/disclosure/view.ts',
        find: 'view: (options, h) => view(layered(config, options), h),',
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests: unit,
  },
]
