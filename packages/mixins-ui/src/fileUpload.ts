import { Effect, Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import * as Subscription from 'foldkit/subscription'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { Return, ReturnWithOutMessage } from 'foldkit/update'
import * as Dom from 'foldkit/dom'
import {
  A11y,
  Attr,
  Behaviors,
  Capability,
  Event,
  idSelector,
  Slot,
  Slots,
  SlotView,
  type Diagnostic,
  type MixinValue,
  type NamedStyle,
} from 'foldkit-mixins'
import { layered, type PresetOption, type Presets } from './configure.js'
import * as FileInput from './fileInput.js'
import type { Progress } from './fileUpload/progress.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

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

/** Writes the Local files into the input, so a form posts what the list shows. */
const writeFiles = (model: Model): Commands =>
  Command.mapMessages([FileInput.Sync({ id: model.id, files: localFiles(model.entries) })], () =>
    Message.CompletedSync(),
  )

/** The write, when the files changed. */
const sync = (model: Model, before: ReadonlyArray<Entry>): Commands =>
  localFilesChanged(before, model.entries) ? writeFiles(model) : []

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
  // Chromium empties the input when the dialog is cancelled, and Foldkit after every pick:
  // the list is written back, so a form still posts what it shows.
  if (files.length === 0 && by === 'pick') {
    return localFiles(model.entries).length === 0
      ? { model }
      : { model, commands: writeFiles(model) }
  }
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
      ...(by === 'pick' ? writeFiles(next) : sync(next, model.entries)),
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

/**
 * The anatomy. The `input` is a native file input drawn first, a transparent
 * pixel rather than hidden, and the `picker` is its `label`, always its next
 * sibling, so the browser opens the dialog for a press on the picker and for
 * Enter or Space on the input, and the picker rings when the input has
 * keyboard focus. The picker also owns the drag events and `data-dragging`.
 * A recipe's `layout` only restyles it.
 */
export const FileUploadSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change, Event.KeyDown],
    attributes: [Attr.AriaInvalid, Attr.AriaDescribedby, Attr.Disabled],
  }),
  picker: Slot.make({
    capability: Capability.Container,
    protected: { events: ['dragenter', 'dragleave', 'dragover', 'drop'] },
  }),
  prompt: Slot.make({ capability: Capability.Container }),
  browse: Slot.make({ capability: Capability.Container }),
  constraints: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** Wraps what the view's `picture` draws, the single-image face. */
  picture: Slot.make({ capability: Capability.Container }),
  /** One polite region, drawn always, saying each change once. */
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  errors: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
  summary: Slot.make({ capability: Capability.Container }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Disabled],
  }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  preview: Slot.make({ capability: Capability.Base }),
  name: Slot.make({ capability: Capability.Container }),
  meta: Slot.make({ capability: Capability.Container }),
  state: Slot.make({ capability: Capability.Container }),
  progress: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  retry: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  remove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  /** A button per row, drawn with `sort`, that Reorder's keys and pointer move. */
  grip: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown, Event.Blur, Event.PointerDown],
    attributes: [Attr.AriaLabel],
  }),
})

/** The input is a native file input and the picker its label; a removable row needs a named control. */
export const FileUploadPattern = A11y.pattern({
  input: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaInvalid],
    obligations: [A11y.Activation, A11y.FocusStrategy, A11y.Name],
  },
  picker: { capability: Capability.Container },
  remove: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

/**
 * Every word the field draws, with `{name}`, `{count}`, `{max}`, `{size}` and
 * `{reason}` standing for what a sentence is about. Text, never functions: a
 * view input holds no nested function.
 */
export interface FileUploadWords {
  /** Drawn before the picker's label in a drop zone, such as `Drop files here or`. */
  readonly prompt: string
  /** Names the list of files. */
  readonly list: string
  readonly remove: string
  /** The remove button's name while the file is uploading. */
  readonly cancel: string
  readonly retry: string
  readonly clear: string
  readonly grip: string
  /** What an uploading file says in its state, and names its progress bar. */
  readonly uploading: string
  readonly constraints: string
  readonly constraintsCount: string
  readonly constraintsSize: string
  /** The summary line over a list of several files. */
  readonly summary: string
  readonly held: string
  readonly queued: string
  readonly done: string
  readonly failedReason: string
  readonly added: string
  readonly refused: string
  readonly removed: string
  readonly cleared: string
  readonly uploaded: string
  readonly failedNotice: string
  readonly refusedKind: string
  readonly refusedTooLarge: string
  readonly refusedTooMany: string
  readonly refusedDuplicate: string
  readonly refusedNotFiles: string
}

/** The defaults, in English. */
export const words: FileUploadWords = {
  prompt: '',
  list: 'Files',
  remove: 'Remove {name}',
  cancel: 'Cancel {name}',
  retry: 'Try {name} again',
  clear: 'Clear all',
  grip: 'Reorder {name}',
  uploading: 'Uploading {name}',
  constraints: 'Up to {max} files, {size} each',
  constraintsCount: 'Up to {max} files',
  constraintsSize: 'Up to {size} each',
  summary: '{count} files, {size}',
  held: '',
  queued: 'Waiting',
  done: 'Uploaded',
  failedReason: 'Failed: {reason}',
  added: '{count} added',
  refused: '{count} refused',
  removed: 'Removed {name}',
  cleared: 'Removed {count} files',
  uploaded: '{name} uploaded',
  failedNotice: '{name} failed: {reason}',
  refusedKind: '{name} is not an accepted type',
  refusedTooLarge: '{name} is over {max}',
  refusedTooMany: 'No more than {max} files',
  refusedDuplicate: '{name} is already added',
  refusedNotFiles: 'Drop files, not text or links',
}

export type Route<Outer> = Behaviors.Keys.Route<Model, Outer>

export interface FileUploadView<Outer> {
  readonly model: Model
  /** Lifts the field's own Messages into the application's. */
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** Names the input (the picker's words) and the list. */
  readonly label: string
  /** The form field the local files submit under. Give none when `lanes` sends them. */
  readonly name?: string | undefined
  /** The native `required`. */
  readonly required?: boolean | undefined
  /** The input takes no pick or drop, and the buttons are off. */
  readonly disabled?: boolean | undefined
  /** No picker, remove or grip is drawn; the input stays, so a form still posts. */
  readonly readOnly?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly description?: string | undefined
  /** Draws the single-image face (an avatar, a cover) in the picker: given the first entry's image address. The list is not drawn. */
  readonly picture?: ((url: Option.Option<string>) => Html) | undefined
  /** Extra buttons in a row's `actions`, such as a download or a zoom. */
  readonly itemActions?: ((entry: Entry) => ReadonlyArray<Html>) | undefined
  /** Draws an uploading entry's progress; built by the application (`FileUploadProgress.make`). */
  readonly progress?: Progress | undefined
  /** Keys the application answers in the input, beside Enter and Space (which open the dialog) and Delete or Backspace. */
  readonly routes?: ReadonlyArray<Route<NoInfer<Outer>>> | undefined
  /** Draws a grip per row and marks the list sortable: the sort Behavior is the application's (`Reorder.behavior`), given with the model it reads. */
  readonly sort?: { readonly input: unknown; readonly mixin: MixinValue<Outer> } | undefined
  readonly words?: Partial<FileUploadWords> | undefined
  /** A style of `FileUploadSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof FileUploadSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Outer> | undefined
}

const lowerTag = (status: Status): string =>
  Status.match(status, {
    Held: () => 'held',
    Queued: () => 'queued',
    Uploading: () => 'uploading',
    Done: () => 'done',
    Failed: () => 'failed',
  })

const refusalText = (refusal: Refusal, text: FileUploadWords): string =>
  Refusal.match(refusal, {
    Kind: ({ name }) => fill(text.refusedKind, { name }),
    TooLarge: ({ name, max }) => fill(text.refusedTooLarge, { name, max: sizeText(max) }),
    TooMany: ({ max }) => fill(text.refusedTooMany, { max }),
    Duplicate: ({ name }) => fill(text.refusedDuplicate, { name }),
    NotFiles: () => text.refusedNotFiles,
  })

const noticeText = (notice: Notice, text: FileUploadWords): string =>
  Notice.match(notice, {
    Added: ({ count }) => fill(text.added, { count }),
    Refused: ({ count }) => fill(text.refused, { count }),
    Removed: ({ name }) => fill(text.removed, { name }),
    Cleared: ({ count }) => fill(text.cleared, { count }),
    Uploaded: ({ name }) => fill(text.uploaded, { name }),
    Failed: ({ name, reason }) => fill(text.failedNotice, { name, reason }),
    Said: ({ text: said }) => said,
  })

const stateText = (entry: Entry, text: FileUploadWords): string =>
  Status.match(entry.status, {
    Held: () => text.held,
    Queued: () => text.queued,
    Uploading: () => fill(text.uploading, { name: entry.name }),
    Done: () => text.done,
    Failed: ({ reason }) => fill(text.failedReason, { reason }),
  })

const constraintsText = (model: Model, text: FileUploadWords): Option.Option<string> =>
  Option.match(model.maxFiles, {
    onNone: () =>
      Option.map(model.maxSize, size => fill(text.constraintsSize, { size: sizeText(size) })),
    onSome: max =>
      Option.some(
        Option.match(model.maxSize, {
          onNone: () => fill(text.constraintsCount, { max }),
          onSome: size => fill(text.constraints, { max, size: sizeText(size) }),
        }),
      ),
  })

/** Enter and Space belong to the native dialog, so a route on either would kill the picker. */
const ownRoutes = <Outer>(
  answer: (model: Model) => Option.Option<Outer>,
): ReadonlyArray<Route<Outer>> => [
  Behaviors.Keys.route<Model, Outer>('Open', {
    on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(' ')],
    handle: () => Option.none(),
  }),
  Behaviors.Keys.route<Model, Outer>('RemoveLast', {
    on: [Behaviors.Keys.chord('Backspace'), Behaviors.Keys.chord('Delete')],
    handle: ({ input }) => answer(input),
  }),
]

/**
 * The `mixins:key-conflict` that drawing the input with `routes` would throw,
 * or none: the application's routes against Enter and Space (the dialog's),
 * Backspace and Delete (the last file's), and each other.
 */
export const conflict = <Outer>(routes: ReadonlyArray<Route<Outer>>): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<Outer>(() => Option.none()), ...routes],
    Option.some('input'),
  )

/** What one entry draws, unassembled, for a layout of the application's own (a table row, a card). */
export interface FileUploadItem {
  readonly entry: Entry
  /** The row's own element, an `li` carrying the item Slot's attributes and key, around `children`. */
  readonly item: (children: ReadonlyArray<Html>) => Html
  readonly preview: Option.Option<Html>
  readonly name: Html
  readonly meta: Html
  readonly state: Option.Option<Html>
  /** Drawn only for an uploading entry, and only when the view was given `progress`. */
  readonly progress: Option.Option<Html>
  /** The row's extra actions, Try again and Remove or Cancel. */
  readonly actions: Option.Option<Html>
  readonly grip: Option.Option<Html>
}

/** The drawings `view` assembles, each alone. */
export interface FileUploadParts {
  /** The root `div` around `children`. */
  readonly root: (children: ReadonlyArray<Html>) => Html
  readonly input: Html
  /** None when read-only. */
  readonly picker: Option.Option<Html>
  readonly description: Option.Option<Html>
  readonly constraints: Option.Option<Html>
  readonly errors: Option.Option<Html>
  readonly status: Html
  readonly summary: Option.Option<Html>
  /** The list `ul` around the rows' `item`s, or none when there are no entries. */
  readonly list: (items: ReadonlyArray<Html>) => Html
  readonly items: ReadonlyArray<FileUploadItem>
}

/** Draws the field's pieces apart; `view` is `parts` in order, so there is one drawing. */
export const parts = <Outer>(
  options: FileUploadView<Outer>,
  h: HtmlBuilder<Outer>,
): FileUploadParts => {
  const { model } = options
  const lift = options.onMessage
  const disabled = options.disabled === true
  const readOnly = options.readOnly === true
  const text = wordsOf(words, options.words)
  const inputId = FileInput.inputId(model.id)
  const idOf = {
    description: `${model.id}-description`,
    constraints: `${model.id}-constraints`,
    errors: `${model.id}-errors`,
    status: `${model.id}-status`,
  }
  const builders = SlotView.buildersFor(
    FileUploadSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(options.sort === undefined ? [] : [options.sort.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: options.sort?.input, h },
  )
  const constraints = constraintsText(model, text)
  const described = [
    ...(options.description === undefined ? [] : [idOf.description]),
    ...(Option.isSome(constraints) ? [idOf.constraints] : []),
    ...(model.refusals.length === 0 ? [] : [idOf.errors]),
  ]
  const inputKeys = Behaviors.Keys.attribute<Model, Outer>(
    [
      ...ownRoutes<Outer>(state =>
        state.entries.length > 0 ? Option.some(lift(Message.RemovedLast())) : Option.none(),
      ),
      ...(options.routes ?? []),
    ],
    { slot: 'input', moveFocus: false },
  )
  const input = h.input(
    builders.input.attrs([
      h.Id(inputId),
      h.Type('file'),
      ...(options.name === undefined ? [] : [h.Name(options.name)]),
      ...(model.accept.length === 0 ? [] : [h.Accept(model.accept.join(','))]),
      ...(model.multiple ? [h.Multiple(true)] : []),
      ...(options.required === true ? [h.Required(true)] : []),
      ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
      ...(described.length === 0 ? [] : [h.AriaDescribedBy(described.join(' '))]),
      ...(disabled ? [h.Disabled(true)] : []),
      ...(readOnly ? [h.Tabindex(-1)] : []),
      ...(disabled || readOnly
        ? []
        : [
            h.OnFileChange(files => lift(Message.Offered({ files, by: 'pick' }))),
            inputKeys({ input: model, h }),
          ]),
    ]),
  )
  const first = model.entries[0]
  const face =
    options.picture === undefined
      ? [
          // The space keeps the two spans one name for the input ("Drop files or browse").
          ...(text.prompt === '' ? [] : [h.span(builders.prompt.attrs(), [text.prompt]), ' ']),
          h.span(builders.browse.attrs(), [options.label]),
        ]
      : [
          h.span(builders.picture.attrs(), [
            options.picture(first === undefined ? Option.none() : displayUrl(first)),
          ]),
        ]
  const picker = readOnly
    ? Option.none()
    : Option.some(
        h.label(
          builders.picker.attrs([
            h.For(inputId),
            ...(model.dragging ? [h.DataAttribute('dragging', '')] : []),
            ...(disabled
              ? [h.DataAttribute('disabled', '')]
              : [
                  h.OnDragEnter(lift(Message.DragEntered())),
                  h.OnDragLeave(lift(Message.DragLeft())),
                  h.AllowDrop(),
                  h.OnDropFiles(files => lift(Message.Offered({ files, by: 'drop' }))),
                ]),
          ]),
          face,
        ),
      )
  const item = (entry: Entry, index: number): FileUploadItem => {
    const cancelling = Status.matchOrElse(entry.status, { Uploading: () => true }, () => false)
    const retryable = Status.matchOrElse(
      entry.status,
      { Failed: failed => failed.retryable },
      () => false,
    )
    const label = (word: string) => fill(word, { name: entry.name })
    const preview = model.previews
      ? Option.some(
          Option.match(displayUrl(entry), {
            onSome: url => h.img(builders.preview.attrs([h.Src(url), h.Alt('')])),
            onNone: () => h.span(builders.preview.attrs(), [extensionOf(entry.name)]),
          }),
        )
      : Option.none<Html>()
    const state = stateText(entry, text)
    const buttons = [
      ...(options.itemActions?.(entry) ?? []),
      ...(retryable && !disabled && !readOnly
        ? [
            h.button(
              builders.retry.attrs([
                h.Type('button'),
                h.AriaLabel(label(text.retry)),
                h.OnClick(lift(Message.Retried({ id: entry.id }))),
              ]),
              [],
            ),
          ]
        : []),
      ...(readOnly
        ? []
        : [
            h.button(
              builders.remove.attrs([
                h.Id(removeId(model.id, entry.id)),
                h.Type('button'),
                h.AriaLabel(label(cancelling ? text.cancel : text.remove)),
                ...(disabled
                  ? [h.Disabled(true)]
                  : [h.OnClick(lift(Message.Removed({ id: entry.id })))]),
              ]),
              [],
            ),
          ]),
    ]
    const bar = Option.flatMap(Option.fromNullishOr(options.progress), progress =>
      Status.matchOrElse(
        entry.status,
        {
          Uploading: () =>
            Option.some(
              h.div(builders.progress.attrs(), [
                progress.draw(
                  { id: `${model.id}-progress-${entry.id}`, entry, label: label(text.uploading) },
                  h,
                ),
              ]),
            ),
        },
        () => Option.none<Html>(),
      ),
    )
    return {
      entry,
      item: children =>
        h.li(
          builders.item.attrs(
            [h.Key(entry.id), h.DataAttribute('status', lowerTag(entry.status))],
            { index, id: entry.id },
          ),
          children,
        ),
      preview,
      name: h.span(builders.name.attrs([h.Title(entry.name)]), [entry.name]),
      meta: h.span(builders.meta.attrs(), [sizeText(entry.size)]),
      // The bar, named by the same words, says what an uploading row is doing.
      state:
        state === '' || Option.isSome(bar)
          ? Option.none()
          : Option.some(h.span(builders.state.attrs(), [state])),
      progress: bar,
      actions:
        buttons.length === 0
          ? Option.none()
          : Option.some(h.div(builders.actions.attrs(), buttons)),
      grip:
        options.sort === undefined || disabled || readOnly
          ? Option.none()
          : Option.some(
              h.button(
                builders.grip.attrs([h.Type('button'), h.AriaLabel(label(text.grip))], {
                  index,
                  id: entry.id,
                }),
                [],
              ),
            ),
    }
  }
  const root = (children: ReadonlyArray<Html>) =>
    h.div(
      builders.root.attrs([
        ...(disabled ? [h.DataAttribute('disabled', '')] : []),
        ...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),
        ...(options.picture === undefined ? [] : [h.DataAttribute('picture', '')]),
      ]),
      children,
    )
  const counted = counts(model)
  return {
    root,
    input,
    picker,
    description:
      options.description === undefined
        ? Option.none()
        : Option.some(
            h.p(builders.description.attrs([h.Id(idOf.description)]), [options.description]),
          ),
    constraints: Option.map(constraints, said =>
      h.p(builders.constraints.attrs([h.Id(idOf.constraints)]), [said]),
    ),
    errors:
      model.refusals.length === 0
        ? Option.none()
        : Option.some(
            h.ul(
              builders.errors.attrs([h.Id(idOf.errors)]),
              model.refusals.map(refusal =>
                h.li(builders.error.attrs(), [refusalText(refusal, text)]),
              ),
            ),
          ),
    // Drawn always, so the region is in place before it speaks.
    status: h.p(
      builders.status.attrs([h.Id(idOf.status), h.Role('status')]),
      Option.toArray(Option.map(model.notice, notice => noticeText(notice, text))),
    ),
    summary:
      model.multiple && model.entries.length > 0 && options.picture === undefined
        ? Option.some(
            h.div(builders.summary.attrs(), [
              fill(text.summary, { count: model.entries.length, size: sizeText(counted.bytes) }),
              ...(disabled || readOnly
                ? []
                : [
                    h.button(
                      builders.clear.attrs([h.Type('button'), h.OnClick(lift(Message.Cleared()))]),
                      [text.clear],
                    ),
                  ]),
            ]),
          )
        : Option.none(),
    list: items =>
      h.ul(
        builders.list.attrs([
          h.AriaLabel(text.list),
          ...(options.sort === undefined ? [] : [h.DataAttribute('sortable', '')]),
        ]),
        items,
      ),
    items: model.entries.map(item),
  }
}

/** The field: input, picker, description and constraints, errors, status, summary and list, in that order. */
export const view = <Outer>(options: FileUploadView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const drawn = parts(options, h)
  const lone = options.picture === undefined ? undefined : drawn.items[0]
  return drawn.root([
    // Before the picker so the browser's `:focus-visible` can ring the label that follows.
    drawn.input,
    ...Option.toArray(drawn.picker),
    ...(lone === undefined
      ? []
      : [...Option.toArray(lone.progress), ...Option.toArray(lone.actions)]),
    ...Option.toArray(drawn.description),
    ...Option.toArray(drawn.constraints),
    ...Option.toArray(drawn.errors),
    drawn.status,
    ...Option.toArray(drawn.summary),
    ...(options.picture !== undefined || drawn.items.length === 0
      ? []
      : [
          drawn.list(
            drawn.items.map(each =>
              each.item([
                ...Option.toArray(each.grip),
                ...Option.toArray(each.preview),
                each.name,
                each.meta,
                ...Option.toArray(each.state),
                ...Option.toArray(each.progress),
                ...Option.toArray(each.actions),
              ]),
            ),
          ),
        ]),
  ])
}

/**
 * What a FileUpload is given once: its look, its words and the drawings it
 * is handed, none of which holds a Message or reads the Model. `sort` reads
 * the Model each draw and `routes` hold Messages, so both stay at the call.
 */
export type FileUploadPreset = Pick<
  FileUploadView<never>,
  'style' | 'words' | 'picture' | 'itemActions' | 'progress'
> & { readonly mixins?: MixinList<never> }

/**
 * The application's own FileUpload: `base` for every use, `presets` chosen
 * at a use with `preset`, and the call over both. `mixins` concatenate in
 * that order and `words` merge word by word; any other option given at the
 * call replaces the preset's. `parts` is bound as `view` is, for a layout of
 * the application's own.
 */
export const configure = <const Names extends string = never>(
  config: Presets<FileUploadPreset, Names>,
): {
  readonly view: <Outer>(
    options: FileUploadView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly parts: <Outer>(
    options: FileUploadView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => FileUploadParts
} => ({
  view: (options, h) => view(layered(config, options), h),
  parts: (options, h) => parts(layered(config, options), h),
})

/** The send a lane is running: what the application's transport is given. */
export const Job = Schema.Struct({
  id: Schema.String,
  attempt: Schema.Number,
  file: FileSchema,
})
export type Job = typeof Job.Type

/** The dependencies of a lane's Subscription entry: its job, none while the lane is free. */
export const laneFields = { job: Schema.Option(Job) }

/** What lane `lane` is sending now. */
export const jobIn = (model: Model, lane: number): Option.Option<Job> =>
  Option.flatMap(
    Option.fromNullishOr(model.entries.find(entry => Option.contains(laneOf(entry), lane))),
    entry =>
      Source.matchOrElse(
        entry.source,
        {
          Local: ({ file }) =>
            Option.map(
              Option.fromNullishOr(
                Status.matchOrElse(
                  entry.status,
                  { Uploading: ({ attempt }) => attempt },
                  () => undefined,
                ),
              ),
              attempt => ({ id: entry.id, attempt, file }),
            ),
        },
        () => Option.none(),
      ),
  )

export interface LaneOptions<Parent, ParentMessage, Services> {
  /** Where the widget's Model is in the application's. */
  readonly model: (parent: Parent) => Model
  /**
   * The send of one job, as the application's own Messages (which carry the
   * typed asset): fold `Message.Progressed`, `Succeeded` and `Failed` back into
   * the widget. Ending the stream aborts the request, as removing the entry does.
   */
  readonly send: (job: Job) => Stream.Stream<ParentMessage, never, Services>
}

/**
 * The callbacks of one lane's Subscription entry, for `entry(FileUpload.laneFields, FileUpload.lane({ lane: 0, … }))`.
 * One entry per lane keeps an upload from restarting when another finishes;
 * `lanes` makes them all.
 */
export const lane = <Parent, ParentMessage, Services = never>(
  options: LaneOptions<Parent, ParentMessage, Services> & { readonly lane: number },
) => ({
  modelToDependencies: (parent: Parent) => ({ job: jobIn(options.model(parent), options.lane) }),
  dependenciesToStream: ({ job }: { readonly job: Option.Option<Job> }) =>
    Option.match(job, {
      onNone: () => Stream.empty as Stream.Stream<ParentMessage, never, Services>,
      onSome: options.send,
    }),
})

/**
 * Every lane's Subscription entry for `count` lanes, so an application cannot
 * wire fewer entries than `init({ lanes })` asked for. Take the count from the
 * one constant that feeds both.
 */
export const lanes = <Parent, ParentMessage, Services = never>(
  options: LaneOptions<Parent, ParentMessage, Services> & { readonly count: number },
) =>
  Subscription.make<Parent, ParentMessage, Services>()(entry =>
    Object.fromEntries(
      Array.from({ length: options.count }, (_, index) => [
        `send${index}`,
        entry(laneFields, lane({ ...options, lane: index })),
      ]),
    ),
  )

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

/** What stands in a non-image's preview: the name's extension, upper case, `FILE` when it has none. */
const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? 'FILE' : name.slice(dot + 1, dot + 5).toUpperCase()
}
