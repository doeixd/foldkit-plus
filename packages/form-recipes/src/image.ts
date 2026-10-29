/**
 * `foldkit-form-recipes/image` — an image key, uploaded where it is chosen.
 *
 * The key's value is the `HashedAsset` the upload route answers. The control
 * is a Bundle: a drop zone, then the upload with its progress, which can be
 * cancelled, and a refusal, which can be retried. Only facts the route kept
 * become the value; a file on its way, or refused, is nothing entered.
 */
import { Effect, Match, Option, Schema, Stream } from 'effect'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Bundle } from 'foldkit-bundle'
import { Display } from 'foldkit-crud'
import { fillWords, Input, type BundleControl } from 'foldkit-form'
import { HashedAsset } from 'foldkit-media'
import { upload, UploadRefusal, type UploadOptions } from 'foldkit-media/browser'
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

/** The request headers a browser sets itself, and drops from a script (Fetch, "forbidden request-header"). */
const forbidden =
  /^(?:accept-charset|accept-encoding|access-control-request-headers|access-control-request-method|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*)$/i

/** Whether `url` is an address, relative or not; `URL.canParse` is too new for some browsers. */
const parses = (url: string): boolean => {
  try {
    new URL(url, 'http://localhost')
    return true
  } catch {
    return false
  }
}

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
  /** Focus moved on after a press took away the button pressed. */
  CompletedFocus: {},
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

/**
 * What the control says. `{name}`, `{width}` and `{height}` are filled. Each is
 * said once, in a live region: the progress shows how far a send has gone.
 */
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
  sending: 'Sending {name}',
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

/**
 * Whether the control sends `file` at all. `accept` filters the picker, not a
 * drop, so what is no image is refused here, before its bytes go anywhere, and
 * a retry asks again.
 */
const sendable = (file: File): boolean => file.type.startsWith('image/')

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

const update = (
  model: ImageModel,
  message: ImageMessage,
): {
  readonly model: ImageModel
  readonly commands?: ReadonlyArray<Command.Command<ImageMessage>>
} =>
  ImageMessage.match(message, {
    GotDrop: ({ message }) => {
      const dropped = UiFileDrop.update(model.drop, message)
      const next = modifyFields(model, { drop: () => dropped.model })
      return {
        model: Option.match(Option.fromNullishOr(dropped.outMessage), {
          onNone: () => next,
          onSome: UiFileDrop.OutMessage.match({
            ReceivedFiles: ({ files }) =>
              sendable(files[0])
                ? send(next, files[0])
                : modifyFields(next, {
                    upload: () =>
                      ImageUpload.Refused({ file: files[0], reason: 'Unsupported', status: 0 }),
                  }),
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
    // Each press takes away the button pressed, so focus goes where the reader goes next.
    Cancelled: () =>
      ImageUpload.matchOrElse(
        model.upload,
        { Sending: () => ({ model: emptied(model), commands: [focus(`#${model.drop.id}`)] }) },
        () => ({ model }),
      ),
    Retried: () =>
      ImageUpload.matchOrElse(
        model.upload,
        {
          Refused: ({ file }) =>
            sendable(file)
              ? { model: send(model, file), commands: [focus(`#${model.drop.id}-cancel`)] }
              : { model },
        },
        () => ({ model }),
      ),
    Removed: () =>
      ImageUpload.matchOrElse(model.upload, { Empty: () => ({ model }) }, () => ({
        model: emptied(model),
        commands: [focus(`#${model.drop.id}`)],
      })),
    CompletedFocus: () => ({ model }),
  })

const Focus = Command.define('FieldRecipes.Image.Focus', {
  args: { selector: Schema.String },
  messages: [ImageMessage.CompletedFocus],
  // Nothing to focus is nothing to do: the control may be gone by the next draw.
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(ImageMessage.CompletedFocus())),
})
const focus = (selector: string) => Focus({ selector })

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
    const { id } = model.drop
    const button = (slot: 'cancel' | 'retry' | 'remove', message: ImageMessage) =>
      h.button(slots[slot].attrs([h.Id(`${id}-${slot}`), h.Type('button'), h.OnClick(message)]), [
        words[slot],
      ])
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
    // One live region, drawn in every state and first, so a reader hears each
    // change of state once, and never the percentages that move under it.
    const said = ImageUpload.match(model.upload, {
      Empty: () => '',
      Sending: ({ file }) => fillWords(words.sending, { name: file.name }),
      Refused: ({ file, reason }) => fillWords(words.refused[reason], { name: file.name }),
      Kept: ({ asset }) => fillWords(words.kept, { width: asset.width, height: asset.height }),
    })
    const status = h.p(
      slots.status.attrs([h.Id(`${id}-status`), h.Role('status'), h.AriaLive('polite')]),
      [said],
    )
    return h.div(slots.root.attrs([h.DataAttribute('upload', model.upload._tag)]), [
      status,
      ...ImageUpload.match(model.upload, {
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
          button('cancel', ImageMessage.Cancelled()),
        ],
        // A file refused before it was sent would be refused again: no retry for it.
        Refused: ({ file }) => [
          ...(sendable(file) ? [button('retry', ImageMessage.Retried())] : []),
          button('remove', ImageMessage.Removed()),
          drop,
        ],
        Kept: () => [button('remove', ImageMessage.Removed())],
      }),
    ])
  })

const ImageDisplay = Display.kind<{}>('FieldRecipes.Image', {
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
  // What a browser refuses would throw at the first upload, inside the
  // Subscription, and take the runtime with it; what it drops would go unsent
  // without a word. Both are refused here, when the recipe is made.
  // The id is also a focus selector (`#cover`), so it is an identifier CSS takes.
  if (!/^[A-Za-z_][\w-]*$/.test(options.id))
    throw new Error(`image: "${options.id}" is not an id a selector can name, such as "cover"`)
  for (const [name, value] of Object.entries(options.headers ?? {}))
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      forbidden.test(name) ||
      /[\r\n\0]|[^\x00-\xff]/.test(value)
    )
      throw new Error(`image: "${name}" is not a header a browser sends as given`)
  if (options.url !== undefined && !parses(options.url))
    throw new Error(`image: "${options.url}" is not an address`)
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
    control: Input.bundle('FieldRecipes.Image', {
      bundle,
      value: model =>
        ImageUpload.matchOrElse(model.upload, { Kept: ({ asset }) => asset }, () => undefined),
      fill: keep,
      // A submit made while a file is on its way waits for the route's answer.
      busy: model => ImageUpload.matchOrElse(model.upload, { Sending: () => true }, () => false),
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
