/**
 * The combobox adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/combobox.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/combobox.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'the input keeps its base bundles',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'input: builders.input.attrs(render.input),',
        replace: 'input: render.input,',
      },
    ],
    tests,
  },
  {
    name: 'items keep their base bundles',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'attributes: builders.item.attrs(item.attributes),',
        replace: 'attributes: item.attributes,',
      },
    ],
    tests,
  },
  {
    name: 'the input slot forgets its expanded attribute',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],',
        replace: 'attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],',
      },
    ],
    tests: gate,
  },
  {
    name: 'the input slot degrades to a base capability',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'input: Slot.make({\n    capability: Capability.TextInput,',
        replace: 'input: Slot.make({\n    capability: Capability.Base,',
      },
    ],
    tests: gate,
  },
]
