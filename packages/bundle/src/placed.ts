/**
 * A placement: a bundle's parts lifted into one parent through one Link. Every
 * part is built from the Foldkit lift that exists for it, so a placement adds
 * no store, reducer, or render path.
 */
import { Option, Record } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as ManagedResource from 'foldkit/managedResource'
import type * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { AnyMessage, Link } from './link.js'
import type { BundleSpec, Helper, ResourceEntries } from './bundle.js'

const PlacedTypeId: unique symbol = Symbol.for('foldkit-bundle/Placed')

export interface PlaceConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2> {
  readonly args?: Args
  /** Handles the child's OutMessage in parent terms, with the child already written back. */
  readonly onOut?: (
    outMessage: OutMessage,
    context: Update.FoldContext<Message, LinkMessage>,
  ) => Update.Step<Parent, OutStepMessage, R2>
  /** Prefix for the placement's Subscription and resource keys. Defaults to `Name@path`. */
  readonly key?: string
}

/** A lifted resource record: each child entry in parent terms, keyed by the placement. */
export type PlacedResources<Parent, ParentMessage, Resources> = Readonly<
  Record<
    string,
    {
      readonly [K in keyof Resources]: Resources[K] extends ManagedResource.Entry<
        any,
        any,
        infer Requirements,
        infer Value,
        infer Service,
        any
      >
        ? ManagedResource.Entry<Parent, ParentMessage, Requirements, Value, Service>
        : never
    }[keyof Resources]
  >
>

export type PlacedHelpers<Parent, ParentMessage, R, Helpers> = {
  readonly [K in keyof Helpers]: Helpers[K] extends (model: any, ...input: infer Input) => any
    ? (...input: Input) => Update.Step<Parent, ParentMessage, R>
    : never
}

export interface Placed<
  Name extends string,
  Parent,
  ParentMessage,
  Model,
  Message,
  R,
  S,
  ViewInputs,
  Resources,
  Helpers,
> {
  readonly [PlacedTypeId]: typeof PlacedTypeId
  readonly name: Name
  /** `Name@path`, or the configured `key`: the prefix of every Subscription and resource key. */
  readonly key: string
  readonly link: Link<Parent, ParentMessage, Model, Message>
  /** Writes the child's initial Model and starts its `init` Commands. */
  readonly init: Update.Step<Parent, ParentMessage, R>
  /** Folds the Message when it belongs to this placement; `None` otherwise. */
  readonly update: (
    parent: Parent,
    message: AnyMessage,
  ) => Option.Option<Update.Return<Parent, ParentMessage, R>>
  readonly subscriptions: Subscription.Subscriptions<Parent, ParentMessage, S>
  readonly resources: PlacedResources<Parent, ParentMessage, Resources>
  /**
   * Renders the child through `h.submodel`; nothing while the child is absent.
   * Generic over the parent's whole Message, which must include this placement's.
   */
  readonly view: PlacedView<Parent, ParentMessage, ViewInputs>
  /**
   * The same view in another slot, for rendering one placement in two DOM
   * positions (desktop and mobile). `h.submodel` throws on a repeated slot.
   */
  readonly viewIn: (slot: string) => PlacedView<Parent, ParentMessage, ViewInputs>
  readonly helpers: PlacedHelpers<Parent, ParentMessage, R, Helpers>
}

export type PlacedView<Parent, ParentMessage, ViewInputs> = [ViewInputs] extends [void]
  ? <M>(parent: Parent, h: ViewBuilder<M, ParentMessage>) => Html
  : <M>(parent: Parent, h: ViewBuilder<M, ParentMessage>, viewInputs: ViewInputs) => Html

/** Readable failure when the parent's Message union lacks this placement's variant. */
export interface Invalid<Message extends string> {
  readonly invalid: Message
}

export type ViewBuilder<M, ParentMessage> = HtmlBuilder<M> &
  ([ParentMessage] extends [M]
    ? unknown
    : Invalid<"The parent Message does not include this placement's wrapper variant; spread its Link.wrapper(...).cases into defineMessageUnion">)

export type AnyPlaced = Placed<string, any, any, any, any, any, any, any, any, any>

export const isPlaced = (value: unknown): value is AnyPlaced =>
  typeof value === 'object' && value !== null && PlacedTypeId in value

const prefixKeys = <A>(prefix: string, record: Readonly<Record<string, A>>): Record<string, A> =>
  Record.mapKeys(record, key => `${prefix}/${key}`)

/** The precise signature `Bundle.at` exposes; the implementation below works on erased types. */
export type Place = <
  Name extends string,
  Args,
  Model,
  Message extends AnyMessage,
  OutMessage,
  R,
  S,
  ViewInputs,
  Resources extends ResourceEntries<Model, Message>,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>>,
  Parent,
  LinkMessage,
  OutStepMessage,
  R2,
>(
  bundle: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  link: Link<Parent, LinkMessage, Model, Message>,
  config?: PlaceConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>,
) => Placed<
  Name,
  Parent,
  LinkMessage | OutStepMessage,
  Model,
  Message,
  R | R2,
  S,
  ViewInputs,
  Resources,
  Helpers
>

// Inside the implementation the child's and parent's types are unknowable, so
// they are `any`; `Place` states them for callers.
type ErasedSpec = BundleSpec<string, any, any, any, any, any, any, any, any, any>
type ErasedLink = Link<any, any, any, any>
type ErasedConfig = PlaceConfig<any, any, any, any, any, any, any>
type ErasedStep = Update.Step<any, any, any>
type ErasedView = Submodel.View<any, any, any>
type ErasedHelper = Helper<any, any, any, any>

const placeErased = (bundle: ErasedSpec, link: ErasedLink, config: ErasedConfig = {}) => {
  const args = config.args
  const key = config.key ?? `${bundle.name}@${link.path.join('.')}`
  const onOut = config.onOut ?? ((): ErasedStep => parent => ({ model: parent }))

  const foldStep = (
    run: (model: any) => Update.ReturnWithOutMessage<any, any, any, any>,
  ): ErasedStep =>
    Update.foldChildStep({
      update: run,
      read: link.read,
      write: link.write,
      toParentMessage: link.toParentMessage,
      foldOutMessage: onOut,
    })

  const isOpen = (parent: unknown): boolean =>
    Option.isSome(link.read(parent)) &&
    Option.match(link.when, { onNone: () => true, onSome: when => when(parent) })

  const subscriptions = bundle.subscriptions
    ? prefixKeys(
        key,
        Subscription.lift(bundle.subscriptions(args))({
          // The gate runs before `toChildModel`, so the child is present whenever it is read.
          toChildModel: parent => Option.getOrThrow(link.read(parent)),
          toParentMessage: link.toParentMessage,
          when: isOpen,
        }),
      )
    : {}

  const resources = bundle.resources
    ? prefixKeys(
        key,
        ManagedResource.lift(bundle.resources(args))({
          toChildModel: parent => (isOpen(parent) ? link.read(parent) : Option.none()),
          toParentMessage: link.toParentMessage,
        }),
      )
    : {}

  const childView: ErasedView | undefined = bundle.view
  const viewIn =
    (slotId: string) =>
    (parent: unknown, h: HtmlBuilder<any>, viewInputs?: unknown): Html =>
      childView === undefined
        ? null
        : Option.match(link.read(parent), {
            onNone: () => null,
            onSome: model =>
              // `h.submodel` passes inputs positionally whenever the key is present.
              viewInputs === undefined
                ? h.submodel({
                    slotId,
                    model,
                    view: childView,
                    toParentMessage: link.toParentMessage,
                  })
                : h.submodel({
                    slotId,
                    model,
                    view: childView,
                    toParentMessage: link.toParentMessage,
                    // With `ViewInputs` erased, Foldkit's conditional config cannot name the inputs' type.
                    viewInputs: viewInputs as never,
                  }),
          })

  return {
    [PlacedTypeId]: PlacedTypeId,
    name: bundle.name,
    key,
    link,
    init: (parent: unknown) => {
      const initial = bundle.init(args)
      return {
        model: link.write(parent, initial.model),
        commands: Command.mapMessages(initial.commands, link.toParentMessage),
      }
    },
    update: (parent: unknown, message: AnyMessage) =>
      Option.map(link.fromParentMessage(message), childMessage =>
        foldStep(model => bundle.update(model, childMessage, args))(parent),
      ),
    subscriptions,
    resources,
    view: viewIn(key),
    viewIn: (slot: string) => viewIn(`${key}#${slot}`),
    helpers: Record.map(
      bundle.helpers ?? {},
      (helper: ErasedHelper) =>
        (...input: ReadonlyArray<unknown>) =>
          foldStep(model => helper(model, ...input)),
    ),
  }
}

// The one boundary where types are restored. Each part above is checked against
// Foldkit's own lift signatures with the child and parent erased; `Place` gives
// callers the types those lifts produce, and test/types.test-d.ts pins them.
export const place: Place = placeErased as unknown as Place
