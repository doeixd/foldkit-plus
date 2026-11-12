/**
 * The create capability's completion, broken in turn:
 * `pnpm mutate examples/todo/test/completion.mutations.ts`.
 */
const tests = ['examples/todo/test/demo.test.ts']

export default [
  {
    name: 'every fact finishes every create',
    edits: [
      {
        file: '../src/agent.ts',
        find: 'correlate: (_, result, { invocation }) => result.requestId === invocation.id,',
        replace: 'correlate: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'the fact lists no todo',
    edits: [
      {
        file: '../src/app.ts',
        find: 'todos: () => [...model.todos, { id, title, completed: false }],',
        replace: 'todos: () => model.todos,',
      },
    ],
    tests,
  },
  {
    name: 'the request lists the todo before its fact',
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: modifyFields(model, { nextId: () => model.nextId + 1 }),',
        replace:
          'model: modifyFields(model, { nextId: () => model.nextId + 1, todos: () => [...model.todos, { id: `todo-${model.nextId}`, title, completed: false }] }),',
      },
    ],
    tests,
  },
  {
    name: 'two requests in flight share an id',
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: modifyFields(model, { nextId: () => model.nextId + 1 }),',
        replace: 'model,',
      },
    ],
    tests,
  },
  {
    name: 'a Command runs inside the transition that asked for it',
    edits: [
      {
        file: '../src/store.ts',
        find: 'Effect.runPromise(command.effect)\n        .then(dispatch)',
        replace: 'Promise.resolve(dispatch(Effect.runSync(command.effect)))',
      },
    ],
    tests,
  },
]
