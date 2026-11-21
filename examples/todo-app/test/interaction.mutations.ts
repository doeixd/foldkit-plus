/**
 * The delete-with-undo, focus and connection behaviour, broken in turn:
 * `pnpm mutate examples/todo-app/test/interaction.mutations.ts`.
 */
const app = '../src/app.ts'
const network = '../src/network.ts'
const unit = 'examples/todo-app/test/interaction.test.ts'
const gate = 'examples/todo-app/test/network.test.ts'

export default [
  {
    name: 'a restore puts back a todo that is already there',
    edits: [{ file: app, find: 'model.todos.some(({ id }) => id === todo.id)', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'an expiry clears an offer made for another todo',
    edits: [
      { file: app, find: 'Option.exists(model.undo, todo => todo.id === id)', replace: 'true' },
    ],
    tests: [unit],
  },
  {
    name: 'a delete keeps nothing to offer back',
    edits: [
      {
        file: app,
        find: 'undo: () => Option.some(todo) }',
        replace: 'undo: () => Option.none() }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Enter in the editor leaves focus where it was',
    edits: [
      {
        file: app,
        find: 'commands: [...(committed.commands ?? []), focusTitle(id)],',
        replace: 'commands: committed.commands,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Escape in the editor leaves focus where it was',
    edits: [{ file: app, find: 'onSome: id => [focusTitle(id)],', replace: 'onSome: () => [],' }],
    tests: [unit],
  },
  {
    name: 'an unchanged sync status hands back a new Model',
    edits: [
      {
        file: app,
        find: "model: machine.update(model, { _tag: 'SyncStatusChanged', input: status })[0],",
        replace:
          "model: { ...machine.update(model, { _tag: 'SyncStatusChanged', input: status })[0] },",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the strip says retrying while offline',
    edits: [{ file: app, find: "if (model.offline) return 'offline'", replace: '' }],
    tests: [unit],
  },
  {
    name: 'going offline leaves the live socket open',
    edits: [
      {
        file: network,
        find: 'const drop = (): void => real.close()',
        replace: 'const drop = (): void => {}',
      },
    ],
    tests: [gate],
  },
  {
    name: 'going online leaves the waiting socket open',
    edits: [{ file: network, find: 'for (const listener of [...closed]) listener()', replace: '' }],
    tests: [gate],
  },
  {
    name: 'a closed socket is still closed again by the switch',
    edits: [
      { file: network, find: 'drops.delete(drop)\n        real.close()', replace: 'real.close()' },
    ],
    tests: [gate],
  },
  {
    name: 'the offline socket opens',
    edits: [
      {
        file: network,
        find: 'onOpen: () => () => {},',
        replace: 'onOpen: listener => { listener(); return () => {} },',
      },
    ],
    tests: [gate],
  },
]
