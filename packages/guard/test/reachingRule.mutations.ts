/**
 * A rule that reads another row, refused where a check over one row is made
 * (#570), each step broken in turn:
 * `pnpm mutate packages/guard/test/reachingRule.mutations.ts`.
 */
const tests = ['packages/guard/test/reachingRule.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const attach = '../src/attach.ts'
const server = '../src/server.ts'
const sync = '../src/sync.ts'
const reaches = 'Query.dependencies(guard.query).reaches.length > 0'
const leaving = (kept: string) => `Query.dependencies(guard.query).reaches.some(reach => ${kept})`

export default [
  edit(
    'a handler is made over a rule that reads another row',
    server,
    'onSome: attachment => reachingRules(attachment, interaction),',
    'onSome: () => [],',
  ),
  edit(
    'a handler is held to the Update rule, whatever it checks',
    server,
    'onSome: attachment => reachingRules(attachment, interaction),',
    "onSome: attachment => reachingRules(attachment, 'Update'),",
  ),
  edit(
    'a handler is held to the Delete rule, whatever it checks',
    server,
    'onSome: attachment => reachingRules(attachment, interaction),',
    "onSome: attachment => reachingRules(attachment, 'Delete'),",
  ),
  edit(
    'a document is declared over a rule that reads another row',
    sync,
    'if (reaching.length > 0)\n        fail(',
    'if (false)\n        fail(',
  ),
  edit(
    'a document is held to the Delete rule',
    sync,
    "const reaching = reachingRules(attachment, 'Update')",
    "const reaching = reachingRules(attachment, 'Delete')",
  ),
  edit('a path is not read as reaching', attach, reaches, leaving("reach._tag !== 'Path'")),
  edit(
    'a path from the viewer is not read as reaching',
    attach,
    reaches,
    leaving("reach._tag !== 'ViewerPath'"),
  ),
  edit(
    'an exists over the row is not read as reaching',
    attach,
    reaches,
    leaving("reach._tag !== 'Exists' || reach.via.length > 0"),
  ),
  edit(
    'an exists reached through a path is not read as reaching',
    attach,
    reaches,
    leaving("reach._tag !== 'Exists' || reach.via.length === 0"),
  ),
  edit(
    'a rule inside all is not opened',
    attach,
    'flattenRules(attachment.row[interaction]?.rules ?? [])',
    '(attachment.row[interaction]?.rules ?? [])',
  ),
]
