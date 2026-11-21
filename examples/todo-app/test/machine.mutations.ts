/**
 * The declared writes of `src/machine.ts`, broken in turn:
 * `pnpm mutate examples/todo-app/test/machine.mutations.ts`.
 */
const machine = '../src/machine.ts'
const app = '../src/app.ts'
const unit = 'examples/todo-app/test/machine.test.ts'

export default [
  {
    // The Composer is not redrawn by a keystroke, and the Header is.
    name: 'a transition is declared to write another Surface’s field',
    edits: [
      {
        file: machine,
        find: 'Transition.set(state.draft, input.value)',
        replace: 'Transition.set(state.listTitle, input.value)',
      },
    ],
    tests: [unit],
  },
  {
    // The arm runs the same transition, so the verifier agrees with it: what
    // fails is the Model the list of Messages leaves and the Surface that shows it.
    name: 'a transition stops writing one of its fields',
    edits: [
      {
        file: machine,
        find: 'Transition.set(state.syncFailed, input.failed),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an arm writes a field its transition does not declare',
    edits: [
      {
        file: app,
        find: "model: machine.update(model, { _tag: 'DraftChanged', input: changed })[0],",
        replace:
          "model: modifyFields(machine.update(model, { _tag: 'DraftChanged', input: changed })[0], { listTitle: () => 'Sneaked' }),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'an edit is ended where none is going on',
    edits: [
      {
        file: machine,
        find: 'when: ({ state }) => Eq.isNot(state.editingId, null),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an edit is ended only where none is going on',
    edits: [
      {
        file: machine,
        find: 'when: ({ state }) => Eq.isNot(state.editingId, null),',
        replace: 'when: ({ state }) => Eq.is(state.editingId, null),',
      },
    ],
    tests: [unit],
  },
  {
    // Its arm still writes `listTitle`, which the declaration says it does not.
    name: 'a Message that writes is declared to write nothing',
    edits: [
      {
        file: machine,
        find: '  CompletedFocus: Transition.make({ state: Model, input: Message.CompletedFocus, apply: () => [] }),',
        replace:
          '  RenamedList: Transition.make({ state: Model, input: Message.RenamedList, apply: () => [] }),',
      },
    ],
    tests: [unit],
  },
]
