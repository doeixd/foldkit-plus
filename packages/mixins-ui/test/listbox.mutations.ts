/**
 * The listbox adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/listbox.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/listbox.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'the button keeps its base bundles',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'button: builders.button.attrs(render.button),',
        replace: 'button: render.button,',
      },
    ],
    tests,
  },
  {
    name: 'items keep their base bundles',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'attributes: builders.item.attrs(item.attributes),',
        replace: 'attributes: item.attributes,',
      },
    ],
    tests,
  },
  {
    name: 'the item slot forgets its selected attribute',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],',
        replace: 'attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],',
      },
    ],
    tests: gate,
  },
  {
    name: 'the item slot degrades to a base capability',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'item: Slot.make({\n    capability: Capability.Interactive,',
        replace: 'item: Slot.make({\n    capability: Capability.Base,',
      },
    ],
    tests: gate,
  },
]
