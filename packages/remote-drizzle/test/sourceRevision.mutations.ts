/**
 * A source's revision reaches the wire (#544), each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/sourceRevision.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/sourceRevision.test.ts']
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the revision column is not read',
    drizzle,
    '        if (revisionColumn !== undefined) columns[REVISION_ALIAS] = revisionColumn\n',
    '',
  ),
  edit(
    'a revision that is not a number column is taken',
    drizzle,
    "    !String((revisionColumn as { readonly dataType?: unknown }).dataType).startsWith('number')",
    '    false',
  ),
  edit(
    'the server drops what a source answers',
    server,
    '              ...(record.revision === undefined ? {} : { revision: record.revision }),\n            })\n            settle(name, record.id, omitted)',
    '            })\n            settle(name, record.id, omitted)',
  ),
  edit(
    'a polled patch drops the revision',
    '../src/poll.ts',
    '                ...(record?.revision === undefined ? {} : { revision: record.revision }),\n',
    '',
  ),
]
