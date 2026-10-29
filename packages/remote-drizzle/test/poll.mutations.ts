/**
 * Polled live data and its row log, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/poll.mutations.ts`
 */
const file = '../src/poll.ts'
const server = '../../remote-server/src/index.ts'
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
  edit(
    'every subscribed row is read, logged or not',
    'const ids = [...asked.keys()].filter(reads)',
    'const ids = [...asked.keys()]',
  ),
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
    'a list of another entity is watched',
    'const watched = queries.filter(query => query.select.entity === source.entity)',
    'const watched = queries',
  ),
  edit('a row joining two lists is patched twice', '                patched.add(id)\n', ''),
  edit('the log keeps no limit', 'where seq <= new.seq - ${keep}', 'where 0'),
  edit('a delete is not logged', "    trigger('delete', 'old'),\n", ''),
  edit(
    'the log is read past its trimmed end as if whole',
    'const trimmed = first !== undefined && first.seq > after + 1',
    'const trimmed = false',
  ),
  edit(
    'a list read that failed moves on past its rows',
    'if (Option.isNone(listed)) readAt = from',
    'if (Option.isNone(listed)) readAt = readAt',
  ),
  edit(
    'a row compares its fields sorted, not in the order asked',
    'if (allowed.length > 0) asked.set(id, allowed)',
    'if (allowed.length > 0) asked.set(id, [...allowed].sort())',
  ),
  edit(
    'each subscribed row is read on its own',
    'const answered = ids.length === 0 ? Option.none() : yield* read(ids, fields)',
    'const answered = ids.length === 0 ? Option.none() : Option.some((yield* Effect.forEach(ids, id => read([id], fields))).flatMap(one => Option.getOrElse(one, () => [])))',
  ),
  edit(
    'a row asked for nothing the principal may read is read beside the rest',
    'if (allowed.length > 0) asked.set(id, allowed)',
    'asked.set(id, [...fields])',
  ),
  // `readAs` is how pollLive keeps to what a read may answer; each of these
  // breaks that check in memory only, to prove `poll.test.ts` notices.
  {
    name: 'readAs asks for a field the principal may not read',
    edits: [
      {
        file: server,
        find: 'source.read({ ids, fields, principal, viewer, ...windowsOf(context.windows, allowed) }),',
        replace:
          'source.read({ ids, fields: context.fields, principal, viewer, ...windowsOf(context.windows, allowed) }),',
      },
    ],
    tests,
  },
  {
    name: 'readAs keeps every value the source returned',
    edits: [
      {
        file: server,
        find: 'if (Object.hasOwn(record.values, field)) values[field] = record.values[field]',
        replace: 'Object.assign(values, record.values)',
      },
    ],
    tests,
  },
  {
    name: 'readAs reads when no field asked may be read',
    edits: [
      {
        file: server,
        find: 'if (allowed.length === 0) return Effect.succeed(Option.none())',
        replace: '',
      },
    ],
    tests,
  },

  edit(
    'a Postgres table gets SQLite triggers',
    'if (!is(binding.table, SQLiteTable)) {',
    'if (false) {',
  ),
]
