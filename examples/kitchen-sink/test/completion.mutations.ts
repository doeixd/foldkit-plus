/**
 * The agent's create, completed on state, broken in turn:
 * `pnpm mutate examples/kitchen-sink/test/completion.mutations.ts`.
 */
const tests = ['examples/kitchen-sink/test/completion.test.ts']

export default [
  {
    name: 'a taken id completes a dropped create',
    edits: [
      {
        file: '../src/agent.ts',
        find: 'notes.some(note => note.id === request.id && note.body === request.body),',
        replace: 'notes.some(note => note.id === request.id),',
      },
    ],
    tests,
  },
  {
    name: 'another note with the body completes the create',
    edits: [
      {
        file: '../src/agent.ts',
        find: 'notes.some(note => note.id === request.id && note.body === request.body),',
        replace: 'notes.some(note => note.body === request.body),',
      },
    ],
    tests,
  },
  {
    name: 'update adds a create over a taken id',
    edits: [
      {
        file: '../src/stack.ts',
        find: 'model.notes.some(note => note.id === id) ? model.notes : [...model.notes, { id, body }],',
        replace: '[...model.notes, { id, body }],',
      },
    ],
    tests,
  },
]
