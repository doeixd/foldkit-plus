/**
 * The segmented contract, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/segmented.mutations.ts` checks that a
 * test fails for every one. Weakening the pattern itself would still
 * validate, so these break the Slots: the gate must refuse them.
 */
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'options forget their pressed state',
    edits: [
      {
        file: '../src/segmented.ts',
        find: 'attributes: [Attr.AriaPressed, Attr.Disabled, Attr.AriaDisabled],',
        replace: 'attributes: [Attr.Disabled, Attr.AriaDisabled],',
      },
    ],
    tests: gate,
  },
  {
    name: 'options degrade to a base capability',
    edits: [
      {
        file: '../src/segmented.ts',
        find: 'option: Slot.make({\n    capability: Capability.Interactive,',
        replace: 'option: Slot.make({\n    capability: Capability.Base,',
      },
    ],
    tests: gate,
  },
]
