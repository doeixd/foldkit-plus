/**
 * `foldkit-form-recipes/file` — a file key, uploaded where it is chosen.
 *
 * The key's value is the `FileAsset` the file route answers. The control is
 * the image recipe's Bundle: a drop zone, then the upload with its progress,
 * which can be cancelled, and a refusal, which can be retried. Only facts the
 * route kept become the value; a file on its way, or refused, is nothing entered.
 */
import { Effect, Match, Option, Schema, Stream } from 'effect'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Bundle } from 'foldkit-bundle'
import { Display } from 'foldkit-crud'
import { fillWords, Input, type BundleControl } from 'foldkit-form'
import { FileAsset } from 'foldkit-media'
import { UploadRefusal, uploadFile, type UploadOptions } from 'foldkit-media/browser'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { FileDrop, type FileDropSlots } from 'foldkit-mixins-ui'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import type { FieldRecipe } from './index.js'
import { checkUploadOptions, FileSchema, percentOf } from './uploadControl.js'

/**
 * Where the file stands. `Sending` and `Refused` hold the `File` itself, so a
 * retry sends it again; a stored draft cannot hold one, so `settled` empties them.
 */
export const FileUpload = defineTaggedUnion({
  Empty: {},
  Sending: {
    file: FileSchema,
    attempt: Schema.Number,
    loaded: Schema.Number,
    total: Schema.Number,
  },
  Refused: { file: FileSchema, reason: UploadRefusal, status: Schema.Number },
  Kept: { asset: FileAsset },
})
export type FileUpload = typeof FileUpload.Type

export const FileModel = Schema.Struct({
  drop: UiFileDrop.Model,
  upload: FileUpload,
  /** How many sends were started: each one's events carry its number, so a cancelled one's are ignored. */
  attempts: Schema.Number,
})
export type FileModel = typeof FileModel.Type

export const FileMessage = defineMessageUnion({
  GotDrop: { message: FileDrop.Message },
  Progressed: { attempt: Schema.Number, loaded: Schema.Number, total: Schema.Number },
  Uploaded: { attempt: Schema.Number, asset: FileAsset },
  Failed: { attempt: Schema.Number, reason: UploadRefusal, status: Schema.Number },
  Cancelled: {},
  Retried: {},
  Removed: {},
  /** Focus moved on after a press took away the button pressed. */
  CompletedFocus: {},
})
export type FileMessage = typeof FileMessage.Type

/** Every element the control draws, with the drop zone's own two under `FileDropSlots`. */
export const FileSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  prompt: Slot.make({ capability: Capability.Base }),
  status: Slot.make({ capability: Capability.Base }),
  progress: Slot.make({ capability: Capability.Base }),
  /** The link to the kept file's download. */
  download: Slot.make({ capability: Capability.Interactive }),
  cancel: Slot.make({ capability: Capability.Interactive }),
  retry: Slot.make({ capability: Capability.Interactive }),
  remove: Slot.make({ capability: Capability.Interactive }),
})

/**
 * What the control says. `{name}` and `{size}` are filled. Each is said once,
 * in a live region: the progress shows how far a send has gone.
 */
export interface FileWords {
  readonly prompt: string
  readonly sending: string
  readonly kept: string
  readonly cancel: string
  readonly retry: string
  readonly remove: string
  /** Why a send was refused, by the route's reason. */
  readonly refused: { readonly [R in UploadRefusal]: string }
}

export const fileWords: FileWords = {
  prompt: 'Drop a file here, or choose one',
  sending: 'Sending {name}',
  kept: '{name}, {size}',
  cancel: 'Cancel',
  retry: 'Try again',
  remove: 'Remove',
  refused: {
    Forbidden: 'You may not upload files here.',
    Unauthenticated: 'Sign in again to upload.',
    TooLarge: '{name} is too large.',
    Unsupported: '{name} is not a kind of file this site takes.',
    Malformed: 'The upload of {name} broke off.',
    TooSlow: 'The upload of {name} was too slow.',
    Busy: 'The server is busy. Try {name} again soon.',
    RateLimited: 'Too many uploads lately. Try {name} again soon.',
    Network: 'The upload of {name} did not reach the server.',
    Unexpected: 'The upload of {name} failed.',
  },
}

export interface FileOptions extends UploadOptions {
  /**
   * The drop zone's `id`, which its file input takes: unique on the page, so
   * two file keys never share one.
   */
  readonly id: string
  /**
   * The kinds the picker offers, such as `['application/pdf', 'image/*']`.
   * Only the picker is filtered: a dropped file is judged by the route.
   * Default: every file.
   */
  readonly accept?: ReadonlyArray<string> | undefined
  /** The most bytes a file may have to be sent at all. Default 20 MB. */
  readonly maxBytes?: number | undefined
  readonly words?: Partial<Omit<FileWords, 'refused'>> & {
    readonly refused?: Partial<FileWords['refused']> | undefined
  }
  readonly styles?: {
    readonly field?: NamedStyle<typeof FileSlots> | undefined
    readonly drop?: NamedStyle<typeof FileDropSlots> | undefined
  }
}

const defaultUrl = '/_media/files'
const defaultMaxBytes = 20 * 1024 * 1024

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

/** The facts and the Model that holds them, whatever was in flight. */
const keep = (model: FileModel, asset: FileAsset): FileModel =>
  modifyFields(model, { upload: () => FileUpload.Kept({ asset }) })

/** Nothing chosen, whatever was. */
const emptied = (model: FileModel): FileModel =>
  modifyFields(model, { upload: () => FileUpload.Empty() })

/** A new send of `file`: the next attempt, from nothing sent. */
const send = (model: FileModel, file: File): FileModel =>
  modifyFields(model, {
    attempts: attempts => attempts + 1,
    upload: () =>
      FileUpload.Sending({ file, attempt: model.attempts + 1, loaded: 0, total: file.size }),
  })

/** The Model when `attempt` is the send in flight, for that send's events. */
const sending = (
  model: FileModel,
  attempt: number,
  next: (upload: Extract<FileUpload, { readonly _tag: 'Sending' }>) => FileModel,
): FileModel =>
  FileUpload.matchOrElse(
    model.upload,
    { Sending: upload => (upload.attempt === attempt ? next(upload) : model) },
    () => model,
  )

// A file past `maxBytes` would be refused again, so it is refused before its bytes go
// anywhere, and no retry is offered for it.
const sendable = (maxBytes: number, file: File): boolean => file.size <= maxBytes

const update =
  (maxBytes: number) =>
  (
    model: FileModel,
    message: FileMessage,
  ): {
    readonly model: FileModel
    readonly commands?: ReadonlyArray<Command.Command<FileMessage>>
  } => {
    return FileMessage.match(message, {
      GotDrop: ({ message }) => {
        const dropped = UiFileDrop.update(model.drop, message)
        const next = modifyFields(model, { drop: () => dropped.model })
        return {
          model: Option.match(Option.fromNullishOr(dropped.outMessage), {
            onNone: () => next,
            onSome: UiFileDrop.OutMessage.match({
              ReceivedFiles: ({ files }) =>
                sendable(maxBytes, files[0])
                  ? send(next, files[0])
                  : modifyFields(next, {
                      upload: () =>
                        FileUpload.Refused({ file: files[0], reason: 'TooLarge', status: 0 }),
                    }),
              RejectedNonFiles: () => next,
            }),
          }),
        }
      },
      Progressed: ({ attempt, loaded, total }) => ({
        model: sending(model, attempt, upload =>
          modifyFields(model, { upload: () => FileUpload.Sending({ ...upload, loaded, total }) }),
        ),
      }),
      Uploaded: ({ attempt, asset }) => ({
        model: sending(model, attempt, () => keep(model, asset)),
      }),
      Failed: ({ attempt, reason, status }) => ({
        model: sending(model, attempt, ({ file }) =>
          modifyFields(model, { upload: () => FileUpload.Refused({ file, reason, status }) }),
        ),
      }),
      // Each press takes away the button pressed, so focus goes where the reader goes next.
      Cancelled: () =>
        FileUpload.matchOrElse(
          model.upload,
          { Sending: () => ({ model: emptied(model), commands: [focus(`#${model.drop.id}`)] }) },
          () => ({ model }),
        ),
      Retried: () =>
        FileUpload.matchOrElse(
          model.upload,
          {
            Refused: ({ file }) =>
              sendable(maxBytes, file)
                ? { model: send(model, file), commands: [focus(`#${model.drop.id}-cancel`)] }
                : { model },
          },
          () => ({ model }),
        ),
      Removed: () =>
        FileUpload.matchOrElse(model.upload, { Empty: () => ({ model }) }, () => ({
          model: emptied(model),
          commands: [focus(`#${model.drop.id}`)],
        })),
      CompletedFocus: () => ({ model }),
    })
  }

const Focus = Command.define('FieldRecipes.File.Focus', {
  args: { selector: Schema.String },
  messages: [FileMessage.CompletedFocus],
  // Nothing to focus is nothing to do: the control may be gone by the next draw.
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(FileMessage.CompletedFocus())),
})
const focus = (selector: string) => Focus({ selector })

/** The send in flight, which is what the upload Subscription follows. */
const inFlight = Schema.Option(Schema.Struct({ attempt: Schema.Number, file: FileSchema }))

const subscriptions = (options: UploadOptions) =>
  Subscription.make<FileModel, FileMessage>()(entry => ({
    upload: entry(
      { sending: inFlight },
      {
        modelToDependencies: model => ({
          sending: FileUpload.matchOrElse(
            model.upload,
            { Sending: ({ attempt, file }) => Option.some({ attempt, file }) },
            () => Option.none(),
          ),
        }),
        // A change of attempt ends this stream, and ending it aborts the request.
        dependenciesToStream: ({ sending }) =>
          Option.match(sending, {
            onNone: () => Stream.empty,
            onSome: ({ attempt, file }) =>
              uploadFile(file, options).pipe(
                Stream.map(event =>
                  Match.valueTags(event, {
                    Progressed: ({ loaded, total }) =>
                      FileMessage.Progressed({ attempt, loaded, total }),
                    FileUploaded: ({ asset }) => FileMessage.Uploaded({ attempt, asset }),
                  }),
                ),
                Stream.catch(failed =>
                  Stream.make(
                    FileMessage.Failed({ attempt, reason: failed.reason, status: failed.status }),
                  ),
                ),
              ),
          }),
      },
    ),
  }))

const view = (options: FileOptions, words: FileWords, url: string, maxBytes: number) =>
  Submodel.defineView<FileModel, FileMessage>((model, h) => {
    const slots = SlotView.buildersFor(
      FileSlots,
      options.styles?.field === undefined ? [] : [options.styles.field.mixin],
      { input: model, h },
    )
    const { id } = model.drop
    const button = (slot: 'cancel' | 'retry' | 'remove', message: FileMessage) =>
      h.button(slots[slot].attrs([h.Id(`${id}-${slot}`), h.Type('button'), h.OnClick(message)]), [
        words[slot],
      ])
    const drop = h.submodel({
      slotId: model.drop.id,
      model: model.drop,
      view: UiFileDrop.view,
      viewInputs: {
        accept: options.accept === undefined ? [] : [...options.accept],
        toView: attributes => {
          const resolved = FileDrop.resolve(
            attributes,
            options.styles?.drop === undefined ? [] : [options.styles.drop.mixin],
            { h },
          )
          return h.label(resolved.root, [
            h.span(slots.prompt.attrs(), [words.prompt]),
            h.input(resolved.input),
          ])
        },
      },
      toParentMessage: message => FileMessage.GotDrop({ message }),
    })
    // One live region, drawn in every state and first, so a reader hears each
    // change of state once, and never the percentages that move under it.
    const said = FileUpload.match(model.upload, {
      Empty: () => '',
      Sending: ({ file }) => fillWords(words.sending, { name: file.name }),
      Refused: ({ file, reason }) => fillWords(words.refused[reason], { name: file.name }),
      Kept: ({ asset }) => fillWords(words.kept, { name: asset.name, size: sizeText(asset.size) }),
    })
    const status = h.p(
      slots.status.attrs([h.Id(`${id}-status`), h.Role('status'), h.AriaLive('polite')]),
      [said],
    )
    return h.div(slots.root.attrs([h.DataAttribute('upload', model.upload._tag)]), [
      status,
      ...FileUpload.match(model.upload, {
        Empty: () => [drop],
        Sending: ({ loaded, total }) => [
          h.progress(
            slots.progress.attrs([
              h.Max('100'),
              h.Value(String(percentOf(loaded, total))),
              h.AriaLabelledBy(`${id}-status`),
            ]),
            [],
          ),
          button('cancel', FileMessage.Cancelled()),
        ],
        Refused: ({ file }) => [
          ...(sendable(maxBytes, file) ? [button('retry', FileMessage.Retried())] : []),
          button('remove', FileMessage.Removed()),
          drop,
        ],
        Kept: ({ asset }) => [
          h.a(
            slots.download.attrs([
              h.Id(`${id}-download`),
              h.Href(`${url}/${asset.key}`),
              h.Attribute('download', asset.name),
            ]),
            [`${asset.name} (${sizeText(asset.size)})`],
          ),
          button('remove', FileMessage.Removed()),
        ],
      }),
    ])
  })

const FileDisplay = Display.kind<{}>('FieldRecipes.File', {
  text: (_, value) =>
    Schema.is(FileAsset)(value) ? `${value.name} (${sizeText(value.size)})` : String(value),
})

/**
 * A file key: its value is the `FileAsset` the file route kept. The Bundle
 * uploads a file once it is chosen, through `uploadFile` with `url` and
 * `headers`, so who may upload is still the route's policy. Like every Bundle
 * control it has no `check`, and a row of a nested form cannot hold it.
 */
export const file = (
  options: FileOptions,
): FieldRecipe<BundleControl<FileModel, FileMessage, FileAsset>> => {
  const words: FileWords = {
    ...fileWords,
    ...options.words,
    refused: { ...fileWords.refused, ...options.words?.refused },
  }
  checkUploadOptions('file', options)
  if (
    options.maxBytes !== undefined &&
    !(Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0)
  )
    throw new Error(`file: maxBytes is a whole number of bytes, not ${options.maxBytes}`)
  const url = options.url ?? defaultUrl
  const maxBytes = options.maxBytes ?? defaultMaxBytes
  const uploadOptions: UploadOptions = { url, headers: options.headers }
  const bundle = Bundle.make({
    name: 'File',
    Model: FileModel,
    Message: FileMessage,
    init: () => ({
      model: {
        drop: UiFileDrop.init({ id: options.id }),
        upload: FileUpload.Empty(),
        attempts: 0,
      },
    }),
    update: update(maxBytes),
    subscriptions: () => subscriptions(uploadOptions),
    view: view(options, words, url, maxBytes),
  })
  return {
    control: Input.bundle('FieldRecipes.File', {
      bundle,
      value: model =>
        FileUpload.matchOrElse(model.upload, { Kept: ({ asset }) => asset }, () => undefined),
      fill: keep,
      // A submit made while a file is on its way waits for the route's answer.
      busy: model => FileUpload.matchOrElse(model.upload, { Sending: () => true }, () => false),
      // A stored draft holds no File: what was on its way, or refused, is gone with it.
      settled: model =>
        modifyFields(model, {
          drop: drop => (drop.isDragOver ? { ...drop, isDragOver: false } : drop),
          upload: upload =>
            FileUpload.matchOrElse(upload, { Kept: () => upload }, () => FileUpload.Empty()),
        }),
    }),
    display: FileDisplay.of({}),
  }
}
