/**
 * The file store and its claim, broken in turn:
 * `pnpm mutate packages/media/test/fileStore.mutations.ts`.
 */
const store = '../src/server/fileStore.ts'
const tests = ['packages/media/test/fileStore.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: store, find, replace }],
  tests,
})

export default [
  edit('keep takes any name', 'if (!isFileName(declared.name))', 'if (false)'),
  edit(
    'a re-save claims again',
    'Option.filter(current, kept => kept.key === submitted.key)',
    'Option.none<FileAsset>()',
  ),
  edit(
    'a re-save keeps what the client sent',
    'onSome: Effect.succeed,',
    'onSome: () => Effect.succeed(submitted),',
  ),
  edit('a key names any part of the store', 'isFileKey(key)\n          ?', 'true\n          ?'),
  edit('keys repeat', 'hex(yield* random.randomBytes(16))', "'0'.repeat(32)"),
  edit('a shorter key is minted', 'random.randomBytes(16)', 'random.randomBytes(15)'),
  {
    name: 'the record is written before the bytes',
    edits: [
      {
        file: store,
        find: 'yield* store.set(bytesKey(key), bytes)\n',
        replace: '',
      },
      {
        file: store,
        find: '            )\n            return asset',
        replace:
          '            )\n            yield* store.set(bytesKey(key), bytes)\n            return asset',
      },
    ],
    tests,
  },
  edit('a claimed key is claimed again', '!record.claimed &&', ''),
  edit('anyone may claim', 'record.owner === owner &&', ''),
  edit('a claim never expires', '&& now - record.uploadedAt <= claimWithin', ''),
  edit('a claim on the last moment is refused', '<= claimWithin', '< claimWithin'),
  edit(
    'a claim is not recorded',
    'encodeRecord({ ...record.value, claimed: true })',
    'encodeRecord(record.value)',
  ),
  edit(
    "a claim answers the client's facts",
    'return record.value.asset',
    "return { ...record.value.asset, name: 'x' }",
  ),
]
