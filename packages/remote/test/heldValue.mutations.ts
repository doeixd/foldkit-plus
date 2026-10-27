/**
 * What keeps a value on screen, broken in turn:
 * `pnpm mutate packages/remote/test/heldValue.mutations.ts`
 */
const tests = ['packages/remote/test/heldValue.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const index = '../src/index.ts'
const model = '../src/model.ts'

export default [
  edit(
    'a stale list reads as if it held nothing',
    index,
    'connection === undefined || (connection.stale && connection.segments.length === 0)',
    'connection === undefined || connection.stale',
  ),
  edit(
    'a list reads Loading while its rows are refetched',
    index,
    'const read = readPage(remote, connection) ??',
    'const read = loadingItem(remote, connection) ?? readPage(remote, connection) ??',
  ),
  edit(
    'an entity reads Loading while it is refetched',
    index,
    '        if (present !== undefined) {',
    "        if (isLoadingThrough(remote, selection.entity, id, relation)) return { _tag: 'Loading' }\n        if (present !== undefined) {",
  ),
  edit(
    "a failed list's query drops its rows",
    index,
    "return { _tag: 'Failed', error: failure, previous: read.value }",
    "return { _tag: 'Failed', error: failure }",
  ),
  edit(
    "a failed entity's refresh drops its value",
    index,
    "? { _tag: 'Failed', error: failure, previous: present.value }",
    "? { _tag: 'Failed', error: failure }",
  ),
  edit(
    'an invalidated list drops its pages',
    model,
    'connections: setConnectionStale(model.connections, message.connection, true),',
    'connections: setConnectionStale({ ...model.connections, [message.connection]: emptyConnection }, message.connection, true),',
  ),
  edit(
    'a refresh forgets every entity it asks about',
    model,
    'isTombstone(store, entityKey(request.entity, request.id))',
    'true',
  ),
  edit(
    'retention keeps only what is shown',
    model,
    'const retained = gc(model, recent)',
    'const retained = gc(model, message.roots)',
  ),
  // The exceptions are narrow: a value taken by anything else is caught.
  edit(
    'a failed read reads as deleted',
    model,
    'entities: setStale(model.entities, marksOf(message.requests), false),',
    'entities: message.requests.reduce((store, request) => tombstone(store, entityKey(request.entity, request.id)), model.entities),',
  ),
  edit(
    'retention keeps nothing left',
    '../src/retain.ts',
    'return [...departed.slice(Math.max(0, departed.length - limit)), ...active]',
    'return active',
  ),
]
