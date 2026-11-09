import { Clock, Context, Duration, Effect, Layer, Option, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'
import { FileAsset, FileKey } from '../file.js'

/** What the upload route was told about a file, beside its bytes. */
export interface Declared {
  readonly name: string
  readonly type: string
  /** Who uploaded it: `FileUploadPolicy`'s answer. */
  readonly owner: string
}

/** A kept file's bytes and the facts its upload recorded. */
export interface StoredFile {
  readonly asset: FileAsset
  readonly bytes: Uint8Array<ArrayBuffer>
}

/**
 * No file the asking owner may claim under this key: unknown, expired,
 * another's, or claimed already. Each reads alike, so a refusal never says
 * which.
 */
export class FileUnclaimed extends Schema.TaggedError<FileUnclaimed>()('FileUnclaimed', {
  key: Schema.String,
}) {}

/**
 * Where uploaded files live, apart from `Originals`, so no file is ever read
 * as an image to transform.
 */
export class FileStore extends Context.Service<
  FileStore,
  {
    /** Keeps a file's bytes, then its record, under a key it mints. */
    readonly keep: (bytes: Uint8Array, declared: Declared) => Effect.Effect<FileAsset>
    /** A kept file, by its key; none for a key outside the grammar. */
    readonly read: (key: string) => Effect.Effect<Option.Option<StoredFile>>
    /**
     * The facts the upload recorded, for the application to store in place of
     * what its client sent: once, by the file's owner, within `claimWithin`
     * of its upload.
     */
    readonly claim: (key: string, owner: string) => Effect.Effect<FileAsset, FileUnclaimed>
  }
>()('foldkit-media/FileStore') {}

const FileRecord = Schema.Struct({
  asset: FileAsset,
  owner: Schema.String,
  uploadedAt: Schema.Number,
  claimed: Schema.Boolean,
})
const RecordJson = Schema.fromJsonString(FileRecord)
const encodeRecord = Schema.encodeSync(RecordJson)
// The store wrote every record, so one that does not decode is a defect, never a miss.
const decodeRecord = Schema.decodeUnknownSync(RecordJson)
const isFileKey = Schema.is(FileKey)

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export interface FileStoreOptions {
  /** Where in the store files are kept; `files/` by default. */
  readonly prefix?: string
  /** How long after its upload a file may be claimed; a day by default. */
  readonly claimWithin?: Duration.Input
}

/**
 * Files in the application's `KeyValueStore`, each key minted from
 * `SecureRandom`. Bytes are never shared between uploads, even equal ones, so
 * an upload's speed says nothing of what others hold. A store that fails is a
 * defect: the file is data.
 *
 * A key-value store cannot compare and set, so two claims racing by the same
 * owner may both succeed; a claim by anyone else cannot.
 */
export const filesKeyValueStore = (
  options: FileStoreOptions = {},
): Layer.Layer<FileStore, never, KeyValueStore.KeyValueStore | SecureRandom.SecureRandom> =>
  Layer.effect(
    FileStore,
    Effect.gen(function* () {
      const store = KeyValueStore.prefix(
        yield* KeyValueStore.KeyValueStore,
        options.prefix ?? 'files/',
      )
      const random = yield* SecureRandom.SecureRandom
      const claimWithin = Duration.toMillis(options.claimWithin ?? '24 hours')
      const bytesKey = (key: string) => `bytes/${key}`
      const recordKey = (key: string) => `records/${key}`
      const recordOf = (key: string) =>
        isFileKey(key)
          ? store.get(recordKey(key)).pipe(
              Effect.orDie,
              Effect.map(stored => Option.map(Option.fromNullishOr(stored), decodeRecord)),
            )
          : Effect.succeed(Option.none())

      return {
        keep: (bytes, declared) =>
          Effect.gen(function* () {
            const key = hex(yield* random.randomBytes(16))
            const asset = { key, name: declared.name, type: declared.type, size: bytes.byteLength }
            // Bytes first: a record is never read for bytes not yet written.
            yield* store.set(bytesKey(key), bytes)
            yield* store.set(
              recordKey(key),
              encodeRecord({
                asset,
                owner: declared.owner,
                uploadedAt: yield* Clock.currentTimeMillis,
                claimed: false,
              }),
            )
            return asset
          }).pipe(Effect.orDie),
        read: key =>
          recordOf(key).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.succeedNone,
                onSome: record =>
                  store.getUint8Array(bytesKey(key)).pipe(
                    Effect.orDie,
                    Effect.flatMap(bytes =>
                      bytes === undefined
                        ? Effect.die(new Error(`The bytes of file ${key} are missing`))
                        : Effect.succeedSome({ asset: record.asset, bytes: new Uint8Array(bytes) }),
                    ),
                  ),
              }),
            ),
          ),
        claim: (key, owner) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis
            const record = Option.filter(
              yield* recordOf(key),
              record =>
                !record.claimed && record.owner === owner && now - record.uploadedAt <= claimWithin,
            )
            if (Option.isNone(record)) return yield* new FileUnclaimed({ key })
            yield* store
              .set(recordKey(key), encodeRecord({ ...record.value, claimed: true }))
              .pipe(Effect.orDie)
            return record.value.asset
          }),
      }
    }),
  )

/**
 * The file a row should hold after a save: the one it holds already when the
 * submitted key is that file's, so a re-save claims nothing, and otherwise
 * the submitted key claimed for `owner`. The facts come from the server
 * either way, never from the client. Call it after the write is authorized,
 * so a refused write claims nothing.
 */
export const keepOrClaim = (
  current: Option.Option<FileAsset>,
  submitted: FileAsset,
  owner: string,
): Effect.Effect<FileAsset, FileUnclaimed, FileStore> =>
  Option.match(
    Option.filter(current, kept => kept.key === submitted.key),
    {
      onSome: Effect.succeed,
      onNone: () => FileStore.use(files => files.claim(submitted.key, owner)),
    },
  )
