const tests = ['packages/successor/test/eventSourced.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file: `../src/${file}.ts`, find, replace }],
  tests,
})

export default [
  edit(
    'a cross-stream retry ignores the saved transaction',
    'eventSourced',
    'if (Option.isSome(previous)) return yield* answers(previous.value)',
    '',
  ),
  edit(
    'a SQLite transaction publishes its first write even when a later stream fails',
    'sqlite',
    "db.exec('ROLLBACK')",
    "db.exec('COMMIT')",
  ),
  edit(
    'an in-memory transaction leaks the first stream on later conflict',
    'journal',
    'const streams = new Map(data.streams)\n              const stored = structuredClone(decoded)',
    'const streams = data.streams as Map<string, MemoryStream>\n              const stored = structuredClone(decoded)',
  ),
  edit(
    'a cross-stream transaction can overwrite an existing dispatch identity',
    'journal',
    'if (current.byDispatch.has(commit.dispatchId))',
    'if (false)',
  ),
  edit(
    'a transaction trusts an adapter without transaction isolation',
    'eventSourced',
    'if (missing.length !== 0)',
    'if (false)',
  ),
  {
    name: 'a retry never retrieves its saved disposition',
    edits: [
      {
        file: '../src/eventSourced.ts',
        find: 'if (Option.isSome(previous)) return yield* retrieve(previous.value, input)',
        replace: '',
      },
      {
        file: '../src/eventSourced.ts',
        find: 'if (Option.isSome(duplicate)) return yield* retrieve(duplicate.value, input)',
        replace: '',
      },
    ],
    tests,
  },
  edit(
    'a journal gap does not prevent replay',
    'eventSourced',
    'if (record.revision !== revision + 1)',
    'if (false)',
  ),
  edit(
    'a delayed input reaches a replacement with the same key',
    'block',
    'row.value.incarnation !== target.incarnation',
    'false',
  ),
  edit(
    'a known store capability is not checked when opening the machine',
    'eventSourced',
    'if (missing.length > 0)',
    'if (false)',
  ),
  edit(
    'a concurrent SQLite commit appears as a storage fault',
    'sqlite',
    'if (actual !== expected) throw new RevisionConflict({ expected, actual })',
    'if (actual !== expected) throw new Error("duplicate revision")',
  ),
  edit(
    'a checkpoint does not restore its state',
    'eventSourced',
    'onSome: readSnapshot,',
    'onSome: saved => ({ revision: saved.revision, state: config.initial(aggregate) }),',
  ),
]
