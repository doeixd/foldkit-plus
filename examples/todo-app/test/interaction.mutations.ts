/**
 * The delete-with-undo, focus and connection behaviour, broken in turn:
 * `pnpm mutate examples/todo-app/test/interaction.mutations.ts`.
 */
const app = '../src/app.ts'
const machine = '../src/machine.ts'
const network = '../src/network.ts'
const unit = 'examples/todo-app/test/interaction.test.ts'
const gate = 'examples/todo-app/test/network.test.ts'

export default [
  {
    name: 'a restore puts back a todo that is already there',
    edits: [
      {
        file: machine,
        find: 'Transition.insert(state.todos, input.todo)',
        replace: 'Transition.append(state.todos, input.todo)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an expiry clears an offer made for another todo',
    edits: [
      {
        file: machine,
        find: 'when: ({ state, input }) => Eq.equals(state.undo.id, input.id),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a delete keeps nothing to offer back',
    edits: [
      {
        file: machine,
        find: 'Arr.find(state.todos, todo => Eq.is(todo.id, input.id)),\n      ),',
        replace: 'null,\n      ),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Enter in the editor leaves focus where it was',
    edits: [
      {
        file: machine,
        find: 'EditingSubmitted: endsEdit(Message.EditingSubmitted, true),',
        replace: 'EditingSubmitted: endsEdit(Message.EditingSubmitted, false),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Escape in the editor leaves focus where it was',
    edits: [
      {
        file: machine,
        find: "Transition.emit('Focus', { id: state.editingId }, { when: Null.isNotNull(state.editingId) }),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an unchanged sync status hands back a new Model',
    edits: [
      {
        file: '../../../packages/surface/src/declared.ts',
        find: '    const [next, emitted] = machine.update(model, machineMessage, readerOptions)\n    if (emitted.length === 0) return { model: next }',
        replace:
          '    const [next, emitted] = machine.update(model, machineMessage, readerOptions)\n    if (emitted.length === 0) return { model: { ...next } }',
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
