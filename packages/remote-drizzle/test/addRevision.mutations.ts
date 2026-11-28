/**
 * A write's answer carries the revision it moved the row to, each step that
 * puts it there broken in turn: the Drizzle writer, `RemoteServer.write`'s
 * answer, the mutate handler, the guard.
 * `pnpm mutate packages/remote-drizzle/test/addRevision.mutations.ts`.
 */
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const tests = [
  'packages/remote-drizzle/test/addRevision.test.ts',
  'packages/remote-server/test/memoryWriter.test.ts',
  'packages/guard/test/pinned.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('the Drizzle writer declares no revision', drizzle, '    revision: revisionField,\n', ''),
  edit(
    'a Drizzle update expecting none leaves the revision where it was',
    drizzle,
    '          ...movesOn,\n',
    '',
  ),
  edit(
    'a Drizzle update does not answer the revision it moved',
    drizzle,
    '...(revisionField === undefined ? [] : [revisionField]),',
    '',
  ),
  edit(
    'the write answer carries no revision',
    server,
    'answered(bound, written.value, revisionOf(written.value))',
    'answered(bound, written.value)',
  ),
  edit(
    'the mutate handler drops the revision of a row it answers',
    server,
    '            ...(patch.revision === undefined ? {} : { revision: patch.revision }),\n',
    '',
  ),
  edit(
    'a guarded writer declares no revision',
    guard,
    '      revision: revision ?? writer.revision,\n',
    '',
  ),
]
