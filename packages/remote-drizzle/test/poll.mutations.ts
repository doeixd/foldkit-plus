/**
 * Polled live data and its row log, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/poll.mutations.ts`
 */
const file = '../src/poll.ts'
const tests = ['packages/remote-drizzle/test/poll.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the last entry read is not remembered',
    'readAt = Option.some(logged.value.through)',
    'readAt = readAt',
  ),
  edit('every subscribed row is read, logged or not', 'if (!reads(id)) continue', ''),
  edit(
    'an unreadable log reads nothing',
    'readAt = yield* Effect.option(changes.head)\n            return Option.none<ReadonlySet<string>>()',
    'return Option.some<ReadonlySet<string>>(new Set())',
  ),
  edit(
    'a log that no longer reaches back is read as quiet',
    'return Option.map(logged.value.ids, (ids): ReadonlySet<string> => new Set(ids))',
    'return Option.some<ReadonlySet<string>>(new Set(Option.getOrElse(logged.value.ids, () => [])))',
  ),
  edit(
    'a known list reads its whole window anyway',
    'const logged = Option.isNone(listing.known) ? Option.none() : only',
    'const logged = Option.none<ReadonlySet<string>>()',
  ),
  edit(
    'a logged row the principal can read does not join',
    'if (rows.has(id)) kept.add(id)\n                  else kept.delete(id)',
    'if (!rows.has(id)) kept.delete(id)',
  ),
  edit(
    'a logged row that is gone stays listed',
    'if (rows.has(id)) kept.add(id)\n                  else kept.delete(id)',
    'if (rows.has(id)) kept.add(id)',
  ),
  edit(
    'every list is polled, watched or not',
    'const watched = (options.lists ?? []).filter(list => wanted.has(list.watchId))',
    'const watched = options.lists ?? []',
  ),
  edit('a row joining two lists is patched twice', '                patched.add(id)\n', ''),
  edit('the log keeps no limit', 'where seq <= new.seq - ${keep}', 'where 0'),
  edit('a delete is not logged', "    trigger('delete', 'old'),\n", ''),
  edit(
    'the log is read past its trimmed end as if whole',
    'if (oldest !== null && after < oldest - 1) {',
    'if (false) {',
  ),
  edit(
    'a Postgres table gets SQLite triggers',
    'if (!is(binding.table, SQLiteTable)) {',
    'if (false) {',
  ),
]
