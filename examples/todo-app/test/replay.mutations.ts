/** The derived update against the hand-written one: `pnpm mutate examples/todo-app/test/replay.mutations.ts` */
const tests = ['examples/todo-app/test/replay.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the derived update runs emitted records in reverse order',
    '../../../packages/surface/src/declared.ts',
    'for (const emittedRecord of emitted) {',
    'for (const emittedRecord of [...emitted].reverse()) {',
  ),
  edit(
    'the derived update returns a new Model for a step that changes nothing',
    '../../../packages/surface/src/declared.ts',
    '    if (emitted.length === 0) return { model: next }',
    '    if (emitted.length === 0) return { model: { ...next } }',
  ),
  edit(
    'a requested todo’s fact loses the request it answers',
    '../src/app.ts',
    "...(typeof requestId === 'string' ? { requestId } : {}),",
    '...{},',
  ),
  edit(
    'a new todo’s fact is not given the id it was supplied',
    '../src/app.ts',
    '      Message.SubmittedTodo({\n        id,',
    "      Message.SubmittedTodo({\n        id: 'minted',",
  ),
]
