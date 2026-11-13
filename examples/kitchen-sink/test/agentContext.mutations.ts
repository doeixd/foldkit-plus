/**
 * The agent context Surface, declared closed, and the walk of it:
 * `pnpm mutate examples/kitchen-sink/test/agentContext.mutations.ts`.
 */
const tests = ['examples/kitchen-sink/test/agent-context.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/stack.ts', find, replace }],
  tests,
})

export default [
  edit(
    'a Message outside the Surface moves a note',
    '    Ping: () => model,',
    "    Ping: () => modifyFields(model, { notes: () => [...model.notes, { id: 'p', body: 'p' }] }),",
  ),
  edit(
    'a create reads the project the board shows',
    '[...model.notes, { id, body }],',
    "[...model.notes, { id, body: model.projectId === 'p1' ? body : '' }],",
  ),
  edit(
    'the selection is moved by a Message the Surface does not list',
    'messages: [Message.RequestedCreateNote, Message.RequestedRenameNote, Message.SelectedNote],\n  closed: true,',
    'messages: [Message.RequestedCreateNote, Message.RequestedRenameNote],\n  closed: true,',
  ),
  edit(
    'the Surface is not declared closed',
    'Message.SelectedNote],\n  closed: true,',
    'Message.SelectedNote],\n  closed: false,',
  ),
]
