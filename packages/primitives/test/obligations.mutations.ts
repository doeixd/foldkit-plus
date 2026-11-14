/**
 * What each primitive says it supplies to `A11y.conform`:
 * `pnpm mutate packages/primitives/test/obligations.mutations.ts`. The binder
 * overloads' stated names were mutated by hand in `obligations.test-d.ts`
 * (Selection supplying activation with its click off left its case unused).
 */
const unit = ['packages/primitives/test/obligations.test.ts']

const dropsProvides = (file: string, line: string) => ({
  name: `${file} supplies nothing on that slot (${line})`,
  edits: [{ file, find: `            provides: [${line}],\n`, replace: '' }],
  tests: unit,
})

export default [
  dropsProvides('../src/interaction/list-navigation.ts', 'A11y.Navigation'),
  dropsProvides('../src/interaction/list-navigation.ts', 'A11y.FocusStrategy'),
  dropsProvides('../src/interaction/roving-tabindex.ts', 'A11y.Navigation'),
  dropsProvides('../src/interaction/roving-tabindex.ts', 'A11y.FocusStrategy'),
  dropsProvides('../src/interaction/tree-navigation.ts', 'A11y.Navigation'),
  dropsProvides('../src/interaction/tree-navigation.ts', 'A11y.FocusStrategy'),
  dropsProvides('../src/interaction/grid-navigation.ts', 'A11y.Navigation'),
  dropsProvides('../src/interaction/grid-navigation.ts', 'A11y.FocusStrategy'),
  dropsProvides('../src/interaction/press.ts', 'A11y.Activation'),
  {
    name: 'Selection supplies activation with its click off',
    edits: [
      {
        file: '../src/interaction/selection.ts',
        find: "...(options.click !== false && args.mode !== 'none' ? [A11y.Activation] : []),",
        replace: "...(args.mode !== 'none' ? [A11y.Activation] : []),",
      },
    ],
    tests: unit,
  },
  {
    name: 'Selection supplies activation when it selects nothing',
    edits: [
      {
        file: '../src/interaction/selection.ts',
        find: "...(options.click !== false && args.mode !== 'none' ? [A11y.Activation] : []),",
        replace: '...(options.click !== false ? [A11y.Activation] : []),',
      },
    ],
    tests: unit,
  },
  {
    name: 'fromBundle drops what a slot provides',
    edits: [
      {
        file: '../src/interaction/bundle-behavior.ts',
        find: '          ...(provides === undefined ? {} : { provides }),\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'ToggleState says the other attribute',
    edits: [
      {
        file: '../../mixins/src/behaviors/toggle-state.ts',
        find: "options.as === 'checked' ? Attr.AriaChecked : Attr.AriaPressed",
        replace: "options.as === 'pressed' ? Attr.AriaChecked : Attr.AriaPressed",
      },
    ],
    tests: unit,
  },
  {
    name: 'Disclosure supplies nothing',
    edits: [
      {
        file: '../../mixins/src/behaviors/disclosure.ts',
        find: '          provides: [A11y.State(Attr.AriaExpanded)],\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'FieldAssociation supplies nothing',
    edits: [
      {
        file: '../../mixins/src/behaviors/field-association.ts',
        find: '          provides: [A11y.Name],\n',
        replace: '',
      },
    ],
    tests: unit,
  },
]
