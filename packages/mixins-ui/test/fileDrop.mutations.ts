/**
 * The file-drop adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fileDrop.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/fileDrop.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'bundles pass through unresolved',
    edits: [
      {
        file: '../src/fileDrop.ts',
        find: '): ResolvedFileDrop<Message> => resolveFor(FileDropSlots, mixins, context)(render)',
        replace: '): ResolvedFileDrop<Message> => render',
      },
    ],
    tests,
  },
  {
    name: 'the input slot forgets the disabled attribute',
    edits: [
      {
        file: '../src/fileDrop.ts',
        find: 'attributes: [Attr.Disabled],',
        replace: 'attributes: [],',
      },
    ],
    tests: gate,
  },
  {
    name: 'the input slot degrades to a base capability',
    edits: [
      {
        file: '../src/fileDrop.ts',
        find: 'input: Slot.make({\n    capability: Capability.Interactive,',
        replace: 'input: Slot.make({\n    capability: Capability.Base,',
      },
    ],
    tests: gate,
  },
]
