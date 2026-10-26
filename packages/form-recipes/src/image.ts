/**
 * `foldkit-form-recipes/image` — an image key, uploaded where it is chosen.
 *
 * The key's value is the `HashedAsset` the upload route answers. The control
 * is a Bundle: a drop zone, then the upload with its progress, which can be
 * cancelled, and a refusal, which can be retried. Only facts the route kept
 * become the value; a file on its way, or refused, is nothing entered.
 */
import { Match, Option, Schema, Stream } from 'effect'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Bundle } from 'foldkit-bundle'
import { Display } from 'foldkit-crud'
import { fillWords, Input, type BundleControl } from 'foldkit-form'
import { HashedAsset } from 'foldkit-media'
import { upload, UploadRefusal, type UploadOptions } from 'foldkit-media/browser'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { FileDrop, type FileDropSlots } from 'foldkit-mixins-ui'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import type { FieldRecipe } from './index.js'

/** A chosen file, held while it is sent. */
const FileSchema = Schema.instanceOf(File)

/**
 * Where the image stands. `Sending` and `Refused` hold the `File` itself, so a
 * retry sends it again; a stored draft cannot hold one, so `settled` empties them.
 */
export const ImageUpload = defineTaggedUnion({
  Empty: {},
  Sending: {
    file: FileSchema,
    attempt: Schema.Number,
    loaded: Schema.Number,
    total: Schema.Number,
  },
  Refused: { file: FileSchema, reason: UploadRefusal, status: Schema.Number },
  Kept: { asset: HashedAsset },
})
export type ImageUpload = typeof ImageUpload.Type

export const ImageModel = Schema.Struct({
  drop: UiFileDrop.Model,
  upload: ImageUpload,
  /** How many sends were started: each one's events carry its number, so a cancelled one's are ignored. */
  attempts: Schema.Number,
})
export type ImageModel = typeof ImageModel.Type

// Upstream's own Message schema types its files as `Schema.Schema<File>`, whose
// decoding services are unknown, and a Bundle's Message must need none. This is
// the same four Messages over a `File` codec; the drop's `update` takes them as they are.
const DropMessage = Schema.Union([
  Schema.TaggedStruct('EnteredDragZone', {}),
  Schema.TaggedStruct('LeftDragZone', {}),
  Schema.TaggedStruct('DroppedFiles', { files: Schema.NonEmptyArray(FileSchema) }),
  Schema.TaggedStruct('DroppedNonFiles', {}),
])

export const ImageMessage = defineMessageUnion({
  GotDrop: { message: DropMessage },
  Progressed: { attempt: Schema.Number, loaded: Schema.Number, total: Schema.Number },
  Uploaded: { attempt: Schema.Number, asset: HashedAsset },
  Failed: { attempt: Schema.Number, reason: UploadRefusal, status: Schema.Number },
  Cancelled: {},
  Retried: {},
  Removed: {},
})
export type ImageMessage = typeof ImageMessage.Type

/** Every element the control draws, with the drop zone's own two under `FileDropSlots`. */
export const ImageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  prompt: Slot.make({ capability: Capability.Base }),
  status: Slot.make({ capability: Capability.Base }),
  progress: Slot.make({ capability: Capability.Base }),
  cancel: Slot.make({ capability: Capability.Interactive }),
  retry: Slot.make({ capability: Capability.Interactive }),
  remove: Slot.make({ capability: Capability.Interactive }),
})

/** What the control says. `{name}`, `{percent}`, `{width}` and `{height}` are filled. */
export interface ImageWords {
  readonly prompt: string
  readonly sending: string
  readonly kept: string
  readonly cancel: string
  readonly retry: string
  readonly remove: string
  /** Why a send was refused, by the route's reason. */
  readonly refused: { readonly [R in UploadRefusal]: string }
}

export const imageWords: ImageWords = {
  prompt: 'Drop an image here, or choose one',
  sending: 'Sending {name}: {percent}%',
  kept: 'An image of {width} × {height}',
  cancel: 'Cancel',
  retry: 'Try again',
  remove: 'Remove',
  refused: {
    Forbidden: 'You may not upload images here.',
    Unauthenticated: 'Sign in again to upload.',
    TooLarge: '{name} is too large.',
    Unsupported: '{name} is not an image this site takes.',
    Malformed: 'The upload of {name} broke off.',
    Network: 'The upload of {name} did not reach the server.',
    Unexpected: 'The upload of {name} failed.',
  },
}

export interface ImageOptions extends UploadOptions {
  /**
   * The drop zone's `id`, which its file input takes: unique on the page, so
   * two image keys never share one.
   */
  readonly id: string
  readonly words?: Partial<Omit<ImageWords, 'refused'>> & {
    readonly refused?: Partial<ImageWords['refused']> | undefined
  }
  readonly styles?: {
    readonly field?: NamedStyle<typeof ImageSlots> | undefined
    readonly drop?: NamedStyle<typeof FileDropSlots> | undefined
  }
}

/** The facts and the Model that holds them, whatever was in flight. */
const keep = (model: ImageModel, asset: HashedAsset): ImageModel =>
  modifyFields(model, { upload: () => ImageUpload.Kept({ asset }) })

/** Nothing chosen, whatever was. */
const emptied = (model: ImageModel): ImageModel =>
  modifyFields(model, { upload: () => ImageUpload.Empty() })

/** A new send of `file`: the next attempt, from nothing sent. */
const send = (model: ImageModel, file: File): ImageModel =>
  modifyFields(model, {
    attempts: attempts => attempts + 1,
    upload: () =>
      ImageUpload.Sending({ file, attempt: model.attempts + 1, loaded: 0, total: file.size }),
  })

/** The Model when `attempt` is the send in flight, for that send's events. */
const sending = (
  model: ImageModel,
  attempt: number,
  next: (upload: Extract<ImageUpload, { readonly _tag: 'Sending' }>) => ImageModel,
): ImageModel =>
  ImageUpload.matchOrElse(
    model.upload,
    { Sending: upload => (upload.attempt === attempt ? next(upload) : model) },
    () => model,
  )

const update = (model: ImageModel, message: ImageMessage): { readonly model: ImageModel } =>
  ImageMessage.match(message, {
    GotDrop: ({ message }) => {
      const dropped = UiFileDrop.update(model.drop, message)
      const next = modifyFields(model, { drop: () => dropped.model })
      return {
        model: Option.match(Option.fromNullishOr(dropped.outMessage), {
          onNone: () => next,
          onSome: UiFileDrop.OutMessage.match({
            ReceivedFiles: ({ files }) => send(next, files[0]),
            RejectedNonFiles: () => next,
          }),
        }),
      }
    },
    Progressed: ({ attempt, loaded, total }) => ({
      model: sending(model, attempt, upload =>
        modifyFields(model, { upload: () => ImageUpload.Sending({ ...upload, loaded, total }) }),
      ),
    }),
    Uploaded: ({ attempt, asset }) => ({
      model: sending(model, attempt, () => keep(model, asset)),
    }),
    Failed: ({ attempt, reason, status }) => ({
      model: sending(model, attempt, ({ file }) =>
        modifyFields(model, { upload: () => ImageUpload.Refused({ file, reason, status }) }),
      ),
    }),
    Cancelled: () => ({
      model: ImageUpload.matchOrElse(model.upload, { Sending: () => emptied(model) }, () => model),
    }),
    Retried: () => ({
      model: ImageUpload.matchOrElse(
        model.upload,
        { Refused: ({ file }) => send(model, file) },
        () => model,
      ),
    }),
    Removed: () => ({
      model: ImageUpload.matchOrElse(model.upload, { Empty: () => model }, () => emptied(model)),
    }),
  })

/** The send in flight, which is what the upload Subscription follows. */
const inFlight = Schema.Option(Schema.Struct({ attempt: Schema.Number, file: FileSchema }))

const subscriptions = (options: UploadOptions) =>
  Subscription.make<ImageModel, ImageMessage>()(entry => ({
    upload: entry(
      { sending: inFlight },
      {
        modelToDependencies: model => ({
          sending: ImageUpload.matchOrElse(
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
              upload(file, options).pipe(
                Stream.map(event =>
                  Match.valueTags(event, {
                    Progressed: ({ loaded, total }) =>
                      ImageMessage.Progressed({ attempt, loaded, total }),
                    Uploaded: ({ asset }) => ImageMessage.Uploaded({ attempt, asset }),
                  }),
                ),
                Stream.catch(failed =>
                  Stream.make(
                    ImageMessage.Failed({ attempt, reason: failed.reason, status: failed.status }),
                  ),
                ),
              ),
          }),
      },
    ),
  }))

const percentOf = (loaded: number, total: number) =>
  total === 0 ? 0 : Math.min(100, Math.round((loaded / total) * 100))

const view = (options: ImageOptions, words: ImageWords) =>
  Submodel.defineView<ImageModel, ImageMessage>((model, h) => {
    const slots = SlotView.buildersFor(
      ImageSlots,
      options.styles?.field === undefined ? [] : [options.styles.field.mixin],
      { input: model, h },
    )
    const button = (slot: 'cancel' | 'retry' | 'remove', message: ImageMessage) =>
      h.button(slots[slot].attrs([h.Type('button'), h.OnClick(message)]), [words[slot]])
    const drop = h.submodel({
      slotId: model.drop.id,
      model: model.drop,
      view: UiFileDrop.view,
      viewInputs: {
        accept: ['image/*'],
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
      toParentMessage: message => ImageMessage.GotDrop({ message }),
    })
    const status = (text: string) =>
      h.p(slots.status.attrs([h.Role('status'), h.AriaLive('polite')]), [text])
    return h.div(
      slots.root.attrs(),
      ImageUpload.match(model.upload, {
        Empty: () => [drop],
        Sending: ({ file, loaded, total }) => {
          const percent = percentOf(loaded, total)
          return [
            status(fillWords(words.sending, { name: file.name, percent })),
            h.progress(slots.progress.attrs([h.Max('100'), h.Value(String(percent))]), []),
            button('cancel', ImageMessage.Cancelled()),
          ]
        },
        Refused: ({ file, reason }) => [
          status(fillWords(words.refused[reason], { name: file.name })),
          button('retry', ImageMessage.Retried()),
          button('remove', ImageMessage.Removed()),
          drop,
        ],
        Kept: ({ asset }) => [
          status(fillWords(words.kept, { width: asset.width, height: asset.height })),
          button('remove', ImageMessage.Removed()),
        ],
      }),
    )
  })

const ImageDisplay = Display.kind<{}>('Image', {
  text: (_, value) =>
    Schema.is(HashedAsset)(value) ? `${value.width} × ${value.height}` : String(value),
})

/**
 * An image key: its value is the `HashedAsset` the upload route kept. The
 * Bundle uploads a file once it is chosen, through `upload` with `url` and
 * `headers`, so who may upload is still the route's `UploadPolicy`. Like every
 * Bundle control it has no `check`, and a row of a nested form cannot hold it.
 */
export const image = (
  options: ImageOptions,
): FieldRecipe<BundleControl<ImageModel, ImageMessage, HashedAsset>> => {
  const words: ImageWords = {
    ...imageWords,
    ...options.words,
    refused: { ...imageWords.refused, ...options.words?.refused },
  }
  const uploadOptions: UploadOptions = { url: options.url, headers: options.headers }
  const bundle = Bundle.make({
    name: 'Image',
    Model: ImageModel,
    Message: ImageMessage,
    init: () => ({
      model: {
        drop: UiFileDrop.init({ id: options.id }),
        upload: ImageUpload.Empty(),
        attempts: 0,
      },
    }),
    update,
    subscriptions: () => subscriptions(uploadOptions),
    view: view(options, words),
  })
  return {
    control: Input.bundle('Image', {
      bundle,
      value: model =>
        ImageUpload.matchOrElse(model.upload, { Kept: ({ asset }) => asset }, () => undefined),
      fill: keep,
      // A stored draft holds no File: what was on its way, or refused, is gone with it.
      settled: model =>
        modifyFields(model, {
          drop: drop => (drop.isDragOver ? { ...drop, isDragOver: false } : drop),
          upload: upload =>
            ImageUpload.matchOrElse(upload, { Kept: () => upload }, () => ImageUpload.Empty()),
        }),
    }),
    display: ImageDisplay.of({}),
  }
}
