/**
 * The example's `update`s and save fixture, broken in turn:
 * `pnpm mutate examples/authoring/test/authoring.mutations.ts`.
 */
const unit = 'examples/authoring/test/updates.test.ts'
const save = 'examples/authoring/test/save.test.ts'

export default [
  {
    name: 'a disabled option is chosen',
    edits: [
      {
        file: '../src/popup/app.ts',
        find: 'choice === undefined || choice.disabled === true',
        replace: 'choice === undefined',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a late Hidden removes a row that was shown again',
    edits: [
      {
        file: '../src/list/app.ts',
        find: "model.presence[id]?.phase === 'hidden'",
        replace: 'true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a result of another instance is picked',
    edits: [
      {
        file: '../src/search/app.ts',
        find: '!FRUITS.includes(fruit) ||',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a pick keeps the results open',
    edits: [
      {
        file: '../src/search/app.ts',
        find: "needle === '' || Option.isSome(model.picked)",
        replace: "needle === ''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a save resolves for the agent on the dispatch, not the answer',
    edits: [
      {
        file: '../src/save/agent.ts',
        find: 'correlate: (_request, result, { invocation }) => result.requestId === invocation.id,',
        replace: 'correlate: () => true,',
      },
    ],
    tests: [save],
  },
  {
    name: 'a refused save forgets the writer reason',
    edits: [
      {
        file: '../src/save/app.ts',
        find: 'refusal => refusal.reason',
        replace: "() => ''",
      },
    ],
    tests: [save],
  },
]
