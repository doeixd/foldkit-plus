/**
 * `Data.preload`, broken in turn:
 * `pnpm mutate packages/remote/test/preload.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/remote/test/satisfy.test.ts']

export default [
  {
    name: 'a preload lands as nothing',
    edits: [
      {
        file: '../src/model.ts',
        find: '      return message.messages.reduce(reduceRemote, model)',
        replace: '      return model',
      },
    ],
    tests,
  },
  {
    name: 'what a preload reads is not handed on',
    edits: [{ file: '../src/index.ts', find: '      heard.push(message)\n', replace: '' }],
    tests,
  },
  {
    name: 'a preload fails as its read does',
    edits: [
      {
        file: '../src/index.ts',
        find: '            Effect.exit,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a foreign Surface is refused only when the read runs',
    edits: [
      {
        file: '../src/index.ts',
        find: "      Object.values(active).forEach(assertOwned)\n      return {\n        name: 'Remote.preload',",
        replace: "      return {\n        name: 'Remote.preload',",
      },
    ],
    tests,
  },
  {
    name: 'a folded preload arrives unwrapped',
    edits: [
      {
        file: '../src/index.ts',
        find: '          toParentMessage,\n        ),\n',
        replace: '          (message: RemoteMessage) => message as never,\n        ),\n',
      },
    ],
    tests,
  },
  {
    name: 'what a preload carries is not checked',
    edits: [
      {
        file: '../src/model.ts',
        find: 'messages: Schema.Array(Schema.suspend(() => remoteMessageSchema)),',
        replace: 'messages: Schema.Array(Schema.Unknown),',
      },
    ],
    tests,
  },
]
