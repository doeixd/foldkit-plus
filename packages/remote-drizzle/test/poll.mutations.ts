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
    'a known list reads every row of its window again',
    'filter(id => !current.has(id) || stale(id))',
    'filter(() => true)',
  ),
  edit(
    'a listed row the log does not name is read again',
    'if (current.has(id) && !stale(id)) {',
    'if (false) {',
  ),
  edit(
    'a quiet tick runs the window',
    'if (Option.isSome(only) && only.value.size === 0) return Option.some([])',
    '',
  ),
  edit(
    'a row the window no longer holds stays listed',
    '              if (listed.has(id)) continue',
    '              continue',
  ),
  {
    name: 'a row that leaves the window, still there, is deleted',
    edits: [
      {
        file,
        find: 'if (values !== undefined) patch(id, values)\n              else if (!deleted.has(id)) {',
        replace: 'if (!deleted.has(id)) {',
      },
    ],
    tests: [...tests, 'packages/remote-drizzle/test/pollWindow.test.ts'],
  },
  {
    name: 'a row that leaves the window is not read',
    edits: [{ file, find: '...[...current].filter(id => !edgeOf.has(id)),', replace: '' }],
    tests: [...tests, 'packages/remote-drizzle/test/pollWindow.test.ts'],
  },
  {
    // What the row log did before: a logged row the principal can read is listed.
    name: 'with a log, a list holds the logged rows rather than its window',
    edits: [
      {
        file,
        find: 'const edgeOf = new Map(edges.value.map(edge => [edge.id, edge]))',
        replace:
          'const edgeOf = new Map([...current, ...Option.getOrElse(only, () => edges.value.map(edge => edge.id))].map(id => [id, { entity: source.entity, id, key: entityKey(source.entity, id) }]))',
      },
    ],
    tests: [...tests, 'packages/remote-drizzle/test/pollWindow.test.ts'],
  },
  edit(
    'a list of another entity is watched',
    'const watched = queries.filter(query => query.select.entity === source.entity)',
    'const watched = queries',
  ),
  edit(
    'a row joining two lists is patched twice',
    '              if (changed.length === 0 || patched.has(id)) return\n              patched.add(id)',
    '              if (changed.length === 0 || patched.has(id)) return',
  ),
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
