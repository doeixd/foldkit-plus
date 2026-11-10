// @vitest-environment node
/**
 * Files kept under minted keys, each upload's bytes its own, and a key
 * claimed once, by its uploader, within `claimWithin`.
 */
import { Duration, Effect, Exit, Layer, Option } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import {
  FileStore,
  FileUnclaimed,
  filesKeyValueStore,
  keepOrClaim,
} from '../src/server/fileStore.js'

const bytes = new TextEncoder().encode('%PDF-1.7 hello')
const declared = { name: 'Q1 report.pdf', type: 'application/pdf', owner: 'ada' }

const run = <A, E>(
  program: Effect.Effect<A, E, FileStore | KeyValueStore.KeyValueStore>,
  store: Layer.Layer<KeyValueStore.KeyValueStore> = KeyValueStore.layerMemory,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(
        filesKeyValueStore().pipe(
          Layer.provideMerge(store),
          Layer.provide(SecureRandom.layerWebCrypto),
        ),
      ),
      Effect.provide(TestClock.layer()),
    ),
  )

describe('filesKeyValueStore', () => {
  it('keeps a file under a minted key and reads it back', async () => {
    const { asset, read } = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const asset = yield* files.keep(bytes, declared)
        return { asset, read: yield* files.read(asset.key) }
      }),
    )
    expect(asset).toEqual({
      key: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: 'Q1 report.pdf',
      type: 'application/pdf',
      size: bytes.byteLength,
    })
    expect(Option.getOrThrow(read)).toEqual({ asset, bytes })
  })

  it('keeps two copies of equal bytes, under two keys', async () => {
    const stored = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const store = yield* KeyValueStore.KeyValueStore
        const first = yield* files.keep(bytes, declared)
        const second = yield* files.keep(bytes, declared)
        expect(first.key).not.toBe(second.key)
        return [
          yield* store.getUint8Array(`files/bytes/${first.key}`),
          yield* store.getUint8Array(`files/bytes/${second.key}`),
        ]
      }),
    )
    expect(stored).toEqual([bytes, bytes])
  })

  it('reads nothing for an unknown key, or one outside the grammar', async () => {
    const reads = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const store = yield* KeyValueStore.KeyValueStore
        // A record the store holds under a name no minted key could be.
        const kept = yield* files.keep(bytes, declared)
        yield* store.set('files/records/facts', (yield* store.get(`files/records/${kept.key}`))!)
        yield* store.set('files/bytes/facts', bytes)
        return [
          yield* files.read('0'.repeat(32)),
          yield* files.read('facts'),
          yield* files.claim('facts', 'ada').pipe(Effect.exit),
        ]
      }),
    )
    expect(reads.slice(0, 2)).toEqual([Option.none(), Option.none()])
    expect(reads[2]).toEqual(Exit.fail(new FileUnclaimed({ key: 'facts' })))
  })

  it('writes the bytes before the record', async () => {
    // A store that fails to keep bytes: the upload dies, and leaves no record naming them.
    const failingBytes = Layer.effect(
      KeyValueStore.KeyValueStore,
      Effect.map(KeyValueStore.KeyValueStore, memory =>
        KeyValueStore.make({
          ...memory,
          set: (key, value) =>
            key.startsWith('files/bytes/') ? Effect.die('disk full') : memory.set(key, value),
        }),
      ),
    ).pipe(Layer.provide(KeyValueStore.layerMemory))
    const records = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const store = yield* KeyValueStore.KeyValueStore
        expect(Exit.isFailure(yield* files.keep(bytes, declared).pipe(Effect.exit))).toBe(true)
        return (yield* store.keys).filter(key => key.startsWith('files/records/'))
      }),
      failingBytes,
    )
    expect(records).toEqual([])
  })
})

describe('claim', () => {
  const claims = (
    steps: (
      files: FileStore['Service'],
      key: string,
    ) => Effect.Effect<ReadonlyArray<Exit.Exit<unknown, FileUnclaimed>>>,
  ) =>
    run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const { key } = yield* files.keep(bytes, declared)
        return { key, exits: yield* steps(files, key) }
      }),
    )
  const unclaimed = (key: string) => Exit.fail(new FileUnclaimed({ key }))

  it("answers the upload's own facts to its owner, once", async () => {
    const { key, exits } = await claims((files, key) =>
      Effect.all([
        files.claim(key, 'ada').pipe(Effect.exit),
        files.claim(key, 'ada').pipe(Effect.exit),
      ]),
    )
    expect(exits).toEqual([
      Exit.succeed({ key, name: 'Q1 report.pdf', type: 'application/pdf', size: bytes.byteLength }),
      unclaimed(key),
    ])
  })

  it('refuses another owner, as it refuses an unknown key, and leaves the file to its owner', async () => {
    const unknown = 'f'.repeat(32)
    const { key, exits } = await claims((files, key) =>
      Effect.all([
        files.claim(key, 'grace').pipe(Effect.exit),
        files.claim(unknown, 'ada').pipe(Effect.exit),
        files.claim(key, 'ada').pipe(Effect.exit),
      ]),
    )
    expect(exits[0]).toEqual(unclaimed(key))
    expect(exits[1]).toEqual(unclaimed(unknown))
    expect(Exit.isSuccess(exits[2]!)).toBe(true)
  })

  it('takes a claim a day after the upload, and none after', async () => {
    const at = (offset: Duration.Input) =>
      claims((files, key) =>
        TestClock.adjust(offset).pipe(
          Effect.andThen(files.claim(key, 'ada').pipe(Effect.exit)),
          Effect.map(exit => [exit]),
        ),
      )
    const onTime = await at('24 hours')
    const late = await at('86400001 millis')
    expect(Exit.isSuccess(onTime.exits[0]!)).toBe(true)
    expect(late.exits[0]).toEqual(unclaimed(late.key))
  })
})

describe('keepOrClaim', () => {
  it('keeps the file a row holds, claiming nothing, whatever facts the client sent', async () => {
    const exits = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const asset = yield* files.keep(bytes, declared)
        const held = yield* files.claim(asset.key, 'ada')
        // A teammate re-saves the row, the client renaming the file on the way.
        const resaved = yield* keepOrClaim(Option.some(held), { ...held, name: 'x.html' }, 'grace')
        return { held, resaved }
      }),
    )
    expect(exits.resaved).toEqual(exits.held)
  })

  it("claims a key the row did not hold, and answers the server's facts", async () => {
    const result = await run(
      Effect.gen(function* () {
        const files = yield* FileStore
        const asset = yield* files.keep(bytes, declared)
        const other = yield* files.keep(bytes, declared)
        const claimed = yield* keepOrClaim(
          Option.some(other),
          { ...asset, name: 'x.html', size: 1 },
          'ada',
        )
        return { asset, claimed, again: yield* files.claim(asset.key, 'ada').pipe(Effect.exit) }
      }),
    )
    expect(result.claimed).toEqual(result.asset)
    expect(result.again).toEqual(Exit.fail(new FileUnclaimed({ key: result.asset.key })))
  })
})

describe('keep', () => {
  it('refuses a name the route would refuse, which no download could carry', async () => {
    const exit = await run(
      FileStore.use(files => files.keep(bytes, { ...declared, name: 'a/b.pdf' })).pipe(Effect.exit),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
