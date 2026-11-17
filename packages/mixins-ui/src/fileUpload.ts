import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { Return, ReturnWithOutMessage } from 'foldkit/update'
import * as Dom from 'foldkit/dom'
import { idSelector } from 'foldkit-mixins'
import * as FileInput from './fileInput.js'

/**
 * A file upload: the files a field holds, each with a status, validated
 * against limits the Model carries. `update` is the whole machine and the
 * application places it, as it places `TagsInput`. Files chosen by the
 * dialog, dropped or pasted arrive as one `Offered` Message; each is judged
 * (kind, size, duplicate, count), then listed, previewed and, when the field
 * has lanes, sent.
 *
 * ```text
 * Offered -> validate -> Held | Queued -> Uploading(lane) -> Done | Failed -> Retried
 * ```
 *
 * The widget sends nothing itself. With `lanes` above zero it keeps each
 * lane's current `Job`; the application's Subscription entries (`lane`) turn a
 * Job into a stream of its own Messages, which it folds back in as
 * `Progressed`, `Succeeded` or `Failed`.
 */

const FileSchema = Schema.instanceOf(File)

/** Where an entry's bytes are. */
export const Source = defineTaggedUnion({
  /** Chosen here; the bytes are in the page. */
  Local: { file: FileSchema },
  /** Already uploaded: an initial file, known by its address. */
  Stored: { url: Schema.String },
})
export type Source = typeof Source.Type

/** An entry's place in the send. `attempt` counts sends of the entry; a Message of another attempt is stale. */
export const Status = defineTaggedUnion({
  /** Nothing to send: the field has no lanes, or the file is stored. */
  Held: {},
  Queued: {},
  Uploading: {
    attempt: Schema.Number,
    lane: Schema.Number,
    loaded: Schema.Number,
    total: Schema.Number,
  },
  Done: { url: Schema.OptionFromNullOr(Schema.String) },
  Failed: { reason: Schema.String, retryable: Schema.Boolean },
})
export type Status = typeof Status.Type

export const Entry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  size: Schema.Number,
  type: Schema.String,
  source: Source,
  /** An object URL of a `Local` image, once the Preview Command answered. */
  preview: Schema.OptionFromNullOr(Schema.String),
  attempts: Schema.Number,
  status: Status,
})
export type Entry = typeof Entry.Type

/** Why a file was not listed. */
export const Refusal = defineTaggedUnion({
  /** Not one of the kinds the field accepts. */
  Kind: { name: Schema.String },
  TooLarge: { name: Schema.String, size: Schema.Number, max: Schema.Number },
  /** The files would pass `maxFiles`: none of the batch was added. */
  TooMany: { max: Schema.Number },
  Duplicate: { name: Schema.String },
  /** A drop that held text or a link. */
  NotFiles: {},
})
export type Refusal = typeof Refusal.Type

/** What the live region says; one sentence per change, never a percentage. */
export const Notice = defineTaggedUnion({
  Added: { count: Schema.Number },
  Refused: { count: Schema.Number },
  Removed: { name: Schema.String },
  Cleared: { count: Schema.Number },
  Uploaded: { name: Schema.String },
  Failed: { name: Schema.String, reason: Schema.String },
  /** Words the application wrote (a reorder step). */
  Said: { text: Schema.String },
})
export type Notice = typeof Notice.Type

export const Model = Schema.Struct({
  /** Prefixes every id the field draws, unique on the page. */
  id: Schema.String,
  multiple: Schema.Boolean,
  /** Normalised tokens: `.ext`, `type/*`, `type/subtype`, lowercase. */
  accept: Schema.Array(Schema.String),
  maxSize: Schema.OptionFromNullOr(Schema.Number),
  maxFiles: Schema.OptionFromNullOr(Schema.Number),
  previews: Schema.Boolean,
  /** How many sends run at once; 0 sends nothing. */
  lanes: Schema.Number,
  /** In drawn order. */
  entries: Schema.Array(Entry),
  /** Ids minted so far. */
  minted: Schema.Number,
  dragging: Schema.Boolean,
  /** This batch's refusals, until the next offer or `DismissedRefusals`. */
  refusals: Schema.Array(Refusal),
  notice: Schema.OptionFromNullOr(Notice),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** Files arrived by the dialog (`pick`, empty when cancelled), a drop or a paste. */
  Offered: {
    files: Schema.Array(FileSchema),
    by: Schema.Literals(['pick', 'drop', 'paste']),
  },
  DragEntered: {},
  DragLeft: {},
  Removed: { id: Schema.String },
  /** Backspace or Delete on the input. */
  RemovedLast: {},
  Cleared: {},
  DismissedRefusals: {},
  Retried: { id: Schema.String },
  Previewed: {
    previews: Schema.Array(Schema.Struct({ id: Schema.String, url: Schema.String })),
  },
  /** From the application's transport. */
  Progressed: {
    id: Schema.String,
    attempt: Schema.Number,
    loaded: Schema.Number,
    total: Schema.Number,
  },
  Succeeded: {
    id: Schema.String,
    attempt: Schema.Number,
    url: Schema.OptionFromNullOr(Schema.String),
  },
  Failed: {
    id: Schema.String,
    attempt: Schema.Number,
    reason: Schema.String,
    retryable: Schema.Boolean,
  },
  CompletedSync: {},
  CompletedFocus: {},
  CompletedRevoke: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** An offer was judged: the ids it added, the ids it replaced, and why files were refused. */
  Picked: {
    added: Schema.Array(Schema.String),
    replaced: Schema.Array(Schema.String),
    refused: Schema.Array(Refusal),
  },
  /** The reader removed entries (one, the last, or all). */
  Removed: { ids: Schema.Array(Schema.String) },
})
export type OutMessage = typeof OutMessage.Type

export interface InitialFile {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly type: string
  /** Where the file already is. */
  readonly url: string
}

export interface InitOptions {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly multiple?: boolean | undefined
  /** `.ext`, `type/*` or `type/subtype` tokens; every file when empty. */
  readonly accept?: ReadonlyArray<string> | undefined
  /** Bytes per file. */
  readonly maxSize?: number | undefined
  /** Needs `multiple`. */
  readonly maxFiles?: number | undefined
  /** Draw a thumbnail for each image; default `true`. */
  readonly previews?: boolean | undefined
  /** Sends at once; default 0, which sends nothing. */
  readonly lanes?: number | undefined
  /** Files already uploaded. */
  readonly initial?: ReadonlyArray<InitialFile> | undefined
}

const TOKEN_PART = '[a-z0-9][a-z0-9!#$&^_.+-]*'
const EXTENSION = /^\.[a-z0-9][a-z0-9._+-]*$/
const TYPE = new RegExp(`^${TOKEN_PART}/(\\*|${TOKEN_PART})$`)

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0

/** Throws, naming the option, for what no field can honour. */
export const init = (options: InitOptions): Model => {
  const multiple = options.multiple === true
  const accept = (options.accept ?? []).map(token => token.trim().toLowerCase())
  for (const token of accept) {
    if (!EXTENSION.test(token) && !TYPE.test(token)) {
      throw new Error(
        `FileUpload.init: accept token "${token}" is not ".ext", "type/*" or "type/subtype"`,
      )
    }
  }
  for (const [option, value] of [
    ['maxSize', options.maxSize],
    ['maxFiles', options.maxFiles],
    ['lanes', options.lanes],
  ] as const) {
    if (value !== undefined && !isCount(value)) {
      throw new Error(`FileUpload.init: ${option} must be a non-negative integer, got ${value}`)
    }
  }
  if (options.maxFiles !== undefined && !multiple) {
    throw new Error('FileUpload.init: maxFiles needs multiple')
  }
  const initial = options.initial ?? []
  if (new Set(initial.map(file => file.id)).size !== initial.length) {
    throw new Error('FileUpload.init: initial files must have distinct ids')
  }
  if (initial.length > 1 && !multiple) {
    throw new Error('FileUpload.init: more than one initial file needs multiple')
  }
  return {
    id: options.id,
    multiple,
    accept,
    maxSize: Option.fromUndefinedOr(options.maxSize),
    maxFiles: Option.fromUndefinedOr(options.maxFiles),
    previews: options.previews ?? true,
    lanes: options.lanes ?? 0,
    entries: initial.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      source: Source.Stored({ url: file.url }),
      preview: Option.none(),
      attempts: 0,
      status: Status.Held(),
    })),
    minted: 0,
    dragging: false,
    refusals: [],
    notice: Option.none(),
  }
}

/**
 * Whether a file is one of the kinds. An empty list takes everything; `.ext`
 * matches the name's ending, `type/*` the type's prefix and anything else the
 * type exactly, all case-insensitively. A file with no type matches only an
 * extension.
 */
export const accepts = (
  tokens: ReadonlyArray<string>,
  file: { readonly name: string; readonly type: string },
): boolean => {
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return tokens.some(token => {
    const lower = token.toLowerCase()
    if (lower.startsWith('.')) return name.endsWith(lower)
    if (type === '') return false
    return lower.endsWith('/*') ? type.startsWith(lower.slice(0, -1)) : type === lower
  })
}

/** `1536` as `1.5 kB`, `1234567` as `1.2 MB`: decimal units, one decimal from a kilobyte up. */
export const sizeText = (bytes: number): string => {
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}

/** The id of an entry's remove button, which takes the focus when its neighbour leaves. */
export const removeId = (id: string, entryId: string): string => `${id}-remove-${entryId}`

// An entry's id may be any text, so the target is never a bare `#id`.
const Focus = Command.define('FileUpload.Focus', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Dom.focus(idSelector(id)).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

const Preview = Command.define('FileUpload.Preview', {
  args: { files: Schema.Array(Schema.Struct({ id: Schema.String, file: FileSchema })) },
  messages: [Message.Previewed],
  execute: ({ files }) =>
    Effect.sync(() =>
      Message.Previewed({
        previews: files.map(({ id, file }) => ({ id, url: URL.createObjectURL(file) })),
      }),
    ),
})

const Revoke = Command.define('FileUpload.Revoke', {
  args: { urls: Schema.Array(Schema.String) },
  messages: [Message.CompletedRevoke],
  execute: ({ urls }) =>
    Effect.sync(() => {
      for (const url of urls) URL.revokeObjectURL(url)
    }).pipe(Effect.as(Message.CompletedRevoke())),
})

type Commands = ReadonlyArray<Command.Command<Message>>
type Step = ReturnWithOutMessage<Model, Message, OutMessage>

const localFiles = (entries: ReadonlyArray<Entry>): ReadonlyArray<File> =>
  entries.flatMap(entry =>
    Source.matchOrElse(entry.source, { Local: ({ file }) => [file] }, () => []),
  )

const previewsOf = (entries: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  entries.flatMap(entry => Option.toArray(entry.preview))

const revoke = (urls: ReadonlyArray<string>): Commands =>
  urls.length === 0 ? [] : [Revoke({ urls })]

const localFilesChanged = (before: ReadonlyArray<Entry>, after: ReadonlyArray<Entry>): boolean => {
  const was = localFiles(before)
  const now = localFiles(after)
  return was.length !== now.length || was.some((file, index) => file !== now[index])
}

/** Writes the Local files into the input when they changed, so a form posts what the list shows. */
const sync = (model: Model, before: ReadonlyArray<Entry>): Commands =>
  localFilesChanged(before, model.entries)
    ? Command.mapMessages(
        [FileInput.Sync({ id: model.id, files: localFiles(model.entries) })],
        () => Message.CompletedSync(),
      )
    : []

const laneOf = (entry: Entry): Option.Option<number> =>
  Status.matchOrElse(entry.status, { Uploading: ({ lane }) => Option.some(lane) }, () =>
    Option.none(),
  )

/**
 * Starts queued entries, in list order, in each free lane below `lanes`. A lane
 * number holds for an entry's whole send, which is what keeps one Subscription
 * entry per lane from restarting another's upload. The same array when nothing
 * starts.
 */
const promote = (entries: ReadonlyArray<Entry>, lanes: number): ReadonlyArray<Entry> => {
  const busy = new Set(entries.flatMap(entry => Option.toArray(laneOf(entry))))
  let next = entries
  for (let lane = 0; lane < lanes; lane += 1) {
    if (busy.has(lane)) continue
    const at = next.findIndex(entry =>
      Status.matchOrElse(entry.status, { Queued: () => true }, () => false),
    )
    if (at === -1) break
    const entry = next[at]!
    next = next.map((each, index) =>
      index === at
        ? {
            ...entry,
            attempts: entry.attempts + 1,
            status: Status.Uploading({
              attempt: entry.attempts + 1,
              lane,
              loaded: 0,
              total: entry.size,
            }),
          }
        : each,
    )
  }
  return next
}

const withEntries = (model: Model, entries: ReadonlyArray<Entry>): Model =>
  entries === model.entries
    ? model
    : modifyFields(model, { entries: () => promote(entries, model.lanes) })

const mapEntry = (
  model: Model,
  id: string,
  change: (entry: Entry) => Entry,
): ReadonlyArray<Entry> => model.entries.map(entry => (entry.id === id ? change(entry) : entry))

/** The entry with `id` while it is `Uploading` that `attempt`; else nothing, so a stale Message changes nothing. */
const sending = (model: Model, id: string, attempt: number): Option.Option<Entry> =>
  Option.fromNullishOr(
    model.entries.find(
      entry =>
        entry.id === id &&
        Status.matchOrElse(
          entry.status,
          { Uploading: uploading => uploading.attempt === attempt },
          () => false,
        ),
    ),
  )

const toInput = (model: Model): Commands => [Focus({ id: FileInput.inputId(model.id) })]

/** Where focus goes when `leaving` leaves: the next remove button, else the previous, else the input. */
const focusAfter = (model: Model, leaving: ReadonlySet<string>): Commands => {
  const first = model.entries.findIndex(entry => leaving.has(entry.id))
  const after = model.entries.slice(first + 1).find(entry => !leaving.has(entry.id))
  const before = model.entries
    .slice(0, first)
    .filter(entry => !leaving.has(entry.id))
    .at(-1)
  const target = after ?? before
  return target === undefined ? toInput(model) : [Focus({ id: removeId(model.id, target.id) })]
}

const nameOf = (entries: ReadonlyArray<Entry>, id: string): string =>
  entries.find(entry => entry.id === id)?.name ?? id

const removeEntries = (
  model: Model,
  ids: ReadonlySet<string>,
  focus: (leaving: ReadonlySet<string>) => Commands,
  notice: Option.Option<Notice>,
): Step => {
  const leaving = model.entries.filter(entry => ids.has(entry.id))
  if (leaving.length === 0) return { model }
  const entries = model.entries.filter(entry => !ids.has(entry.id))
  const next = modifyFields(model, {
    entries: () => promote(entries, model.lanes),
    notice: current => (Option.isSome(notice) ? notice : current),
  })
  return {
    model: next,
    commands: [...sync(next, model.entries), ...revoke(previewsOf(leaving)), ...focus(ids)],
    outMessage: OutMessage.Removed({ ids: leaving.map(entry => entry.id) }),
  }
}

/** The ids not already taken, `local-<n>`, counting from `minted`. */
const mint = (
  taken: ReadonlySet<string>,
  minted: number,
  count: number,
): { readonly ids: ReadonlyArray<string>; readonly minted: number } => {
  const ids: Array<string> = []
  let next = minted
  while (ids.length < count) {
    next += 1
    const id = `local-${next}`
    if (!taken.has(id)) ids.push(id)
  }
  return { ids, minted: next }
}

const refusalOf = (model: Model, file: File): Option.Option<Refusal> => {
  if (!accepts(model.accept, file)) return Option.some(Refusal.Kind({ name: file.name }))
  return Option.flatMap(model.maxSize, max =>
    file.size > max
      ? Option.some(Refusal.TooLarge({ name: file.name, size: file.size, max }))
      : Option.none(),
  )
}

const offer = (model: Model, files: ReadonlyArray<File>, by: 'pick' | 'drop' | 'paste'): Step => {
  if (files.length === 0 && by === 'pick') return { model }
  const refused: Array<Refusal> = []
  const fresh: Array<File> = []
  if (files.length === 0) {
    refused.push(Refusal.NotFiles())
  } else if (!model.multiple) {
    // Only the first is judged: a second file of a drop is not offered to a single field.
    const file = files[0]!
    Option.match(refusalOf(model, file), {
      onSome: refusal => refused.push(refusal),
      onNone: () => fresh.push(file),
    })
  } else {
    const held = new Set(localFiles(model.entries).map(FileInput.keyOf))
    for (const file of files) {
      const refusal = Option.orElse(refusalOf(model, file), () => {
        const key = FileInput.keyOf(file)
        return held.has(key) ? Option.some(Refusal.Duplicate({ name: file.name })) : Option.none()
      })
      Option.match(refusal, {
        onSome: each => refused.push(each),
        onNone: () => {
          held.add(FileInput.keyOf(file))
          fresh.push(file)
        },
      })
    }
    const room = Option.map(model.maxFiles, max => max - model.entries.length)
    if (fresh.length > 0 && Option.exists(room, available => fresh.length > available)) {
      refused.push(Refusal.TooMany({ max: Option.getOrElse(model.maxFiles, () => 0) }))
      fresh.length = 0
    }
  }
  const replacing = !model.multiple && fresh.length > 0 ? model.entries : []
  const kept = replacing.length === 0 ? model.entries : []
  const minting = mint(new Set(model.entries.map(entry => entry.id)), model.minted, fresh.length)
  const added: ReadonlyArray<Entry> = fresh.map((file, index) => ({
    id: minting.ids[index]!,
    name: file.name,
    size: file.size,
    type: file.type,
    source: Source.Local({ file }),
    preview: Option.none(),
    attempts: 0,
    status: model.lanes === 0 ? Status.Held() : Status.Queued(),
  }))
  const entries = promote([...kept, ...added], model.lanes)
  const next = modifyFields(model, {
    entries: () => entries,
    minted: () => minting.minted,
    dragging: () => false,
    refusals: () => refused,
    notice: () =>
      Option.some(
        added.length > 0
          ? Notice.Added({ count: added.length })
          : Notice.Refused({ count: refused.length }),
      ),
  })
  const previewing = model.previews
    ? added.flatMap(entry =>
        entry.type.toLowerCase().startsWith('image/')
          ? Source.matchOrElse(
              entry.source,
              { Local: ({ file }) => [{ id: entry.id, file }] },
              () => [],
            )
          : [],
      )
    : []
  return {
    model: next,
    commands: [
      ...sync(next, model.entries),
      ...(previewing.length === 0 ? [] : [Preview({ files: previewing })]),
      ...revoke(previewsOf(replacing)),
    ],
    outMessage: OutMessage.Picked({
      added: added.map(entry => entry.id),
      replaced: replacing.map(entry => entry.id),
      refused,
    }),
  }
}

/** The field after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Step =>
  Message.match(message, {
    Offered: ({ files, by }) => offer(model, files, by),
    DragEntered: () =>
      model.dragging ? { model } : { model: modifyFields(model, { dragging: () => true }) },
    DragLeft: () =>
      model.dragging ? { model: modifyFields(model, { dragging: () => false }) } : { model },
    Removed: ({ id }) =>
      removeEntries(
        model,
        new Set([id]),
        leaving => focusAfter(model, leaving),
        Option.some(Notice.Removed({ name: nameOf(model.entries, id) })),
      ),
    RemovedLast: () => {
      const last = model.entries.at(-1)
      return last === undefined
        ? { model }
        : removeEntries(
            model,
            new Set([last.id]),
            () => toInput(model),
            Option.some(Notice.Removed({ name: last.name })),
          )
    },
    Cleared: () =>
      removeEntries(
        model,
        new Set(model.entries.map(entry => entry.id)),
        () => toInput(model),
        Option.some(Notice.Cleared({ count: model.entries.length })),
      ),
    DismissedRefusals: () =>
      model.refusals.length === 0
        ? { model }
        : { model: modifyFields(model, { refusals: () => [] }) },
    Retried: ({ id }) => {
      const entry = model.entries.find(each => each.id === id)
      const retryable =
        entry !== undefined &&
        Status.matchOrElse(entry.status, { Failed: ({ retryable }) => retryable }, () => false)
      if (!retryable) return { model }
      return {
        model: withEntries(
          model,
          mapEntry(model, id, each => ({ ...each, status: Status.Queued() })),
        ),
        // The retry button leaves with the Failed status.
        commands: [Focus({ id: removeId(model.id, id) })],
      }
    },
    Previewed: ({ previews }) => {
      const present = new Map(
        previews.flatMap(preview => {
          const entry = model.entries.find(each => each.id === preview.id)
          return entry !== undefined && Option.isNone(entry.preview)
            ? ([[preview.id, preview.url]] as const)
            : []
        }),
      )
      const late = previews.filter(preview => present.get(preview.id) !== preview.url)
      const entries =
        present.size === 0
          ? model.entries
          : model.entries.map(entry => {
              const url = present.get(entry.id)
              return url === undefined ? entry : { ...entry, preview: Option.some(url) }
            })
      return {
        model: entries === model.entries ? model : modifyFields(model, { entries: () => entries }),
        // A remove before the Command answered: the URL has no owner.
        commands: revoke(late.map(preview => preview.url)),
      }
    },
    Progressed: ({ id, attempt, loaded, total }) =>
      Option.match(sending(model, id, attempt), {
        onNone: () => ({ model }),
        onSome: entry =>
          Status.matchOrElse(
            entry.status,
            {
              Uploading: uploading =>
                uploading.loaded === loaded && uploading.total === total
                  ? { model }
                  : {
                      model: modifyFields(model, {
                        entries: () =>
                          mapEntry(model, id, each => ({
                            ...each,
                            status: Status.Uploading({ ...uploading, loaded, total }),
                          })),
                      }),
                    },
            },
            () => ({ model }),
          ),
      }),
    Succeeded: ({ id, attempt, url }) =>
      Option.match(sending(model, id, attempt), {
        onNone: () => ({ model }),
        onSome: entry => ({
          model: modifyFields(
            withEntries(
              model,
              mapEntry(model, id, each => ({ ...each, status: Status.Done({ url }) })),
            ),
            { notice: () => Option.some(Notice.Uploaded({ name: entry.name })) },
          ),
        }),
      }),
    Failed: ({ id, attempt, reason, retryable }) =>
      Option.match(sending(model, id, attempt), {
        onNone: () => ({ model }),
        onSome: entry => ({
          model: modifyFields(
            withEntries(
              model,
              mapEntry(model, id, each => ({
                ...each,
                status: Status.Failed({ reason, retryable }),
              })),
            ),
            { notice: () => Option.some(Notice.Failed({ name: entry.name, reason })) },
          ),
        }),
      }),
    CompletedSync: () => ({ model }),
    CompletedFocus: () => ({ model }),
    CompletedRevoke: () => ({ model }),
  })

// Helpers the application calls from its own `update`.

/** The entries' ids in drawn order, for a sort Behavior's `items`. */
export const ids = (model: Model): ReadonlyArray<string> => model.entries.map(entry => entry.id)

/**
 * The entries in the order of `order` (pass `Reorder.apply(FileUpload.ids(model), move)`);
 * an id it lacks keeps its place at the end. The same Model when the order is unchanged.
 */
export const ordered = (model: Model, order: ReadonlyArray<string>): Model => {
  const byId = new Map(model.entries.map(entry => [entry.id, entry]))
  const placed = new Set<string>()
  const entries = [
    ...order.flatMap(id => {
      const entry = byId.get(id)
      if (entry === undefined || placed.has(id)) return []
      placed.add(id)
      return [entry]
    }),
    ...model.entries.filter(entry => !placed.has(entry.id)),
  ]
  return entries.every((entry, index) => entry === model.entries[index])
    ? model
    : modifyFields(model, { entries: () => entries })
}

/** Has the live region say `text`, for a step the application caused (a reorder). */
export const announce = (model: Model, text: string): Model =>
  modifyFields(model, { notice: () => Option.some(Notice.Said({ text })) })

/** Removes entries the application chose to drop; focus stays where it is. */
export const without = (model: Model, removed: ReadonlyArray<string>): Return<Model, Message> => {
  const { model: next, commands } = removeEntries(model, new Set(removed), () => [], Option.none())
  return commands === undefined ? { model: next } : { model: next, commands }
}

/** What the entries are doing, and how many bytes they hold. */
export const counts = (
  model: Model,
): {
  readonly held: number
  readonly queued: number
  readonly uploading: number
  readonly done: number
  readonly failed: number
  readonly bytes: number
} => {
  const tally = { held: 0, queued: 0, uploading: 0, done: 0, failed: 0, bytes: 0 }
  for (const entry of model.entries) {
    tally.bytes += entry.size
    Status.match(entry.status, {
      Held: () => (tally.held += 1),
      Queued: () => (tally.queued += 1),
      Uploading: () => (tally.uploading += 1),
      Done: () => (tally.done += 1),
      Failed: () => (tally.failed += 1),
    })
  }
  return tally
}

/** The address an `img` can show: the preview of a local file, or a stored image's own. */
export const displayUrl = (entry: Entry): Option.Option<string> =>
  Option.orElse(entry.preview, () =>
    Source.matchOrElse(
      entry.source,
      {
        Stored: ({ url }) =>
          entry.type.toLowerCase().startsWith('image/') ? Option.some(url) : Option.none(),
      },
      () => Option.none(),
    ),
  )

/**
 * The Model as a draft or a server may keep it: uploaded files become stored
 * ones, every other local file goes, and what only a live page holds
 * (dragging, refusals, the notice, object URLs) is cleared.
 */
export const settled = (model: Model): Model =>
  modifyFields(model, {
    entries: entries =>
      entries.flatMap(entry =>
        Source.match(entry.source, {
          Stored: () => [{ ...entry, preview: Option.none<string>() }],
          Local: () =>
            Status.matchOrElse(
              entry.status,
              {
                Done: ({ url }) =>
                  Option.match(url, {
                    onNone: () => [],
                    onSome: stored => [
                      {
                        ...entry,
                        source: Source.Stored({ url: stored }),
                        preview: Option.none<string>(),
                        status: Status.Held(),
                      },
                    ],
                  }),
              },
              () => [],
            ),
        }),
      ),
    dragging: () => false,
    refusals: () => [],
    notice: () => Option.none(),
  })

/**
 * Lets go of every preview: call it from the Message that drops the widget (a
 * route change, a dialog closing). Nothing revokes on unmount, so without it
 * the object URLs live until the document unloads.
 */
export const released = (model: Model): Return<Model, Message> => {
  const urls = previewsOf(model.entries)
  return urls.length === 0
    ? { model }
    : {
        model: modifyFields(model, {
          entries: entries => entries.map(entry => ({ ...entry, preview: Option.none<string>() })),
        }),
        commands: [Revoke({ urls })],
      }
}
