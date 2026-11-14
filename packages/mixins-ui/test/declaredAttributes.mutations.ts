/**
 * Slot attribute declarations dropped in turn: `pnpm mutate packages/mixins-ui/test/declaredAttributes.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/declaredAttributes.test.ts']

export default [
  {
    name: 'the accordion trigger does not declare aria-controls',
    edits: [
      {
        file: '../src/accordion.ts',
        find: 'attributes: [Attr.AriaExpanded, Attr.AriaControls, Attr.Disabled],',
        replace: 'attributes: [Attr.AriaExpanded, Attr.Disabled],',
      },
    ],
    tests,
  },
  {
    name: 'the breadcrumb current step does not declare aria-current',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'attributes: [Attr.AriaCurrent] }),',
        replace: '}),',
      },
    ],
    tests,
  },
  {
    name: 'the radio option declares aria-selected, not aria-checked',
    edits: [
      {
        file: '../src/radioGroup.ts',
        find: '      Attr.AriaChecked,\n      Attr.AriaLabelledby,',
        replace: '      Attr.AriaSelected,\n      Attr.AriaLabelledby,',
      },
    ],
    tests,
  },
]
