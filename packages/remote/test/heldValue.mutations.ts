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
const store = '../src/store.ts'

/** Asking again about a deleted entity, which `domain.test.ts` drives. */
const absent = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: ['packages/remote/test/domain.test.ts'],
})

const partial = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: index, find, replace }],
  tests: [
    ...tests,
    'packages/remote/test/domain.test.ts',
    'packages/remote/test/unavailable.test.ts',
  ],
})

export default [
  partial(
    'a row not yet read hides the whole list',
    'missing = true\n          continue',
    'return undefined',
  ),
  partial(
    'a list with no row read shows an empty page',
    '        missing &&\n        rows.length === 0 &&',
    '        false &&',
  ),
  partial(
    'a list whose shown rows were deleted reads as never shown',
    '        !deletedInWindow(',
    '        !!deletedInWindow(',
  ),
  partial('a list missing a row reads Ready', 'return refreshing || missing', 'return refreshing'),
  partial(
    'a row the server will not answer is left out',
    "if (row._tag === 'Failed') return row",
    "if (row._tag === 'Failed') continue",
  ),
  edit(
    'a stale list reads as if it held nothing',
    index,
    'connection === undefined || (connection.stale && connection.segments.length === 0)',
    'connection === undefined || connection.stale',
  ),
  edit(
    'a list reads Loading while its rows are refetched',
    index,
    'const read =\n          readPage(remote, connection) ??',
    'const read =\n          loadingItem(remote, connection) ??\n          readPage(remote, connection) ??',
  ),
  edit(
    'an entity reads Loading while it is refetched',
    index,
    '      if (present !== undefined) {',
    '      if (isLoadingThrough(remote, selection.entity, id, relation)) return LOADING\n      if (present !== undefined) {',
  ),
  edit(
    "a failed list's query drops its rows",
    index,
    'return failedWith(read, failure)',
    "return { _tag: 'Failed', error: failure }",
  ),
  edit(
    "a failed entity's refresh drops its value",
    index,
    '? failedWith(present, failure)',
    "? { _tag: 'Failed', error: failure }",
  ),
  edit(
    'an invalidated list drops its pages',
    model,
    'connections: setConnectionStale(model.connections, connection, true),',
    'connections: setConnectionStale({ ...model.connections, [connection]: emptyConnection }, connection, true),',
  ),
  edit(
    'a refresh forgets a deleted entity it asks about',
    store,
    'next[key] = { ...previous, stale: asked }',
    'delete next[key]',
  ),
  edit(
    'a refresh forgets every entity it asks about',
    model,
    'setStale(askAgain(model.entities, marks), marks, true)',
    'setStale(Object.fromEntries(Object.entries(model.entities).filter(([key]) => !marks.some(([asked]) => asked === key))), marks, true)',
  ),
  absent(
    'a deleted entity asked about again is not read',
    store,
    'return [...fields].filter(f => value.stale.has(f))',
    'return []',
  ),
  absent(
    'an absent answer leaves the asking open',
    store,
    'isTombstone(store, key) && store[key]!.stale.size === 0',
    'isTombstone(store, key)',
  ),
  absent(
    'a settled answer keeps the tombstone',
    model,
    'else if (settled.has(key) && isTombstone(answered, key)) answered = remove(answered, key)',
    '',
  ),
  edit(
    'retention keeps only what is shown',
    model,
    'const retained = gc(model, heldRoots(recent))',
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
    'const departed = batches.slice(oldestKept)',
    'const departed: ReadonlyArray<RetentionRoots> = []',
  ),
]
