/**
 * The steps, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/steps.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/steps.test.ts'

export default [
  {
    name: 'the current step counts as complete',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'if (index < current) return',
        replace: 'if (index <= current) return',
      },
    ],
    tests: [unit],
  },
  {
    name: 'no step is current to assistive technology',
    edits: [
      {
        file: '../src/steps.ts',
        find: "...(state === 'current' ? [h.AriaCurrent('step')] : [])",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a step ahead is a button too',
    edits: [
      {
        file: '../src/steps.ts',
        find: "onSelect !== undefined && state === 'complete'",
        replace: "onSelect !== undefined && state !== 'current'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a completed step goes to the step after it',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'h.OnClick(onSelect(index))',
        replace: 'h.OnClick(onSelect(index + 1))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a completed step submits the form around it',
    edits: [
      {
        file: '../src/steps.ts',
        find: "builders.trigger.attrs([h.Type('button'), h.OnClick",
        replace: 'builders.trigger.attrs([h.OnClick',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a connector trails the last step',
    edits: [
      { file: '../src/steps.ts', find: '...(index === last', replace: '...(index === last + 1' },
    ],
    tests: [unit],
  },
  {
    name: 'the number is read beside the position',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'builders.marker.attrs([marked, h.AriaHidden(true)])',
        replace: 'builders.marker.attrs([marked])',
      },
    ],
    tests: [unit],
  },
]
