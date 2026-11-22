/**
 * A late answer in a domain that reads nothing live: what the layer capability
 * keeps of a read, and settles on an answer, taken back to the live capability
 * alone in turn; and the value a read keeps, which a relative layer resolves
 * over. `pnpm mutate packages/remote/test/lateAnswer.mutations.ts`.
 */
const tests = ['packages/remote/test/lateAnswer.test.ts']

export default [
  {
    name: 'the layer capability keeps nothing a read moved',
    edits: [
      {
        file: '../src/layers.ts',
        find: '  capabilities.keeps = keepsRead\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an answer settles what is kept only where the domain reads live',
    edits: [
      {
        file: '../src/model.ts',
        find: '        : layers.settleReplayed(\n',
        replace:
          '        : Option.isNone(capabilities.live)\n          ? { kept: model.kept, again: [] }\n          : layers.settleReplayed(\n',
      },
    ],
    tests,
  },
  {
    // A relative layer then resolves over the count from before the read.
    name: 'a read keeps the value it replaced, not its own',
    edits: [
      {
        file: '../src/replay.ts',
        find: "const over = from === 'patch' ? held(field) : Option.some(values[field])",
        replace: 'const over = held(field)',
      },
    ],
    tests: ['packages/remote/test/derivedCount.test.ts'],
  },
]
