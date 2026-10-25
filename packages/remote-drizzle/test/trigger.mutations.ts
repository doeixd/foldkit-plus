/**
 * `revisionTrigger`, each part broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/trigger.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/trigger.test.ts', 'packages/guard/test/pinned.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'SQLite moves a revision the update already moved',
    ' for each row when new.${moved} = old.${moved}',
    ' for each row',
  ),
  edit('SQLite moves every row', 'where ${id} = new.${id}; end;', 'where 1 = 1; end;'),
  edit(
    'Postgres moves a revision the update already moved',
    'begin if new.${moved} = old.${moved} then',
    'begin if true then',
  ),
  edit(
    'a missing revision column is taken',
    'if (column === undefined) {\n    throw new Error(\n      `[foldkit-remote-drizzle] revisionTrigger',
    'if (false) {\n    throw new Error(\n      `[foldkit-remote-drizzle] revisionTrigger',
  ),
]
