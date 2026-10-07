/**
 * The toast adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toast.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/toast.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'the container keeps its base bundles',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'container: builders.container.attrs(render.container),',
        replace: 'container: render.container,',
      },
    ],
    tests,
  },
  {
    name: 'entries keep their base bundles',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'attributes: builders.entry.attrs(entry.attributes),',
        replace: 'attributes: entry.attributes,',
      },
    ],
    tests,
  },
  {
    name: 'the container slot forgets its role',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'container: Slot.make({\n    capability: Capability.Container,\n    attributes: [Attr.Role],\n  }),',
        replace: 'container: Slot.make({\n    capability: Capability.Container,\n  }),',
      },
    ],
    tests: gate,
  },
  {
    name: 'the entry slot forgets its role',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'entry: Slot.make({\n    capability: Capability.Container,\n    attributes: [Attr.Role],\n  }),',
        replace: 'entry: Slot.make({\n    capability: Capability.Container,\n  }),',
      },
    ],
    tests: gate,
  },
]
