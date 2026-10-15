/**
 * The date picker adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/datePicker.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/datePicker.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'the trigger keeps its base bundles',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: 'trigger: builders.trigger.attrs(render.trigger),',
        replace: 'trigger: render.trigger,',
      },
    ],
    tests,
  },
  {
    name: 'the panel keeps its base bundles',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: 'builders.panel.attrs(render.panel)',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'the trigger slot forgets its expanded attribute',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: 'attributes: [Attr.AriaExpanded],',
        replace: 'attributes: [],',
      },
    ],
    tests: gate,
  },
  {
    name: 'a date picker given no draw draws nothing',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: '=> Html = defaultToView,',
        replace: '=> Html = (_, h) => h.div([], []),',
      },
    ],
    tests: ['packages/mixins-ui/test/datePicker.test.ts'],
  },
  {
    name: 'an unfinished range closes the picker',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: 'Option.filter(date => !isComplete(picked(selection, date))),',
        replace: 'Option.filter(() => false),',
      },
    ],
    tests,
  },
  {
    name: 'a finished pick never reaches upstream',
    edits: [
      {
        file: '../src/datePicker.ts',
        find: 'onNone: () => upstreamUpdate(model, message),',
        replace: 'onNone: () => ({ model }),',
      },
    ],
    tests,
  },
]
