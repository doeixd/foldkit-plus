/**
 * A bundle placed many times: one child per key of a collection whose storage
 * its Link owns (a record, or an array by id). Routing, init, and folds work per
 * item; each child Subscription becomes one parent entry over every item.
 */
import { Array, Option, Record, Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { BundleSpec, Helper, ResourceEntries } from './bundle.js'
import type { AnyMessage, CollectionLink } from './link.js'
import {
  checkArgs,
  isArgsFactory,
  UnresolvedArgsError,
  writeIfChanged,
  type ArgsSource,
  type BuilderLike,
  type TagOf,
  type ViewBuilder,
} from './placed.js'

const PlacedCollectionTypeId: unique symbol = Symbol.for('foldkit-bundle/PlacedCollection')

export interface EachConfig<
  Args,
  Parent,
  LinkMessage,
  Message,
  OutMessage,
  OutStepMessage,
  R2,
  Key extends string = string,
  ParentSeed = Parent,
> {
  /**
   * The args every item's `init` and `update` receive: a static value, or a
   * factory from the parent seed, computed once per initialization and
   * retained. Requires `initial`/`config` to have run before items are added.
   */
  readonly args?: ArgsSource<ParentSeed, Args>
  /** Handles an item's OutMessage in parent terms, with the item already written back. */
  readonly onOut?: (
    outMessage: OutMessage,
    key: Key,
    context: Update.FoldContext<Message, LinkMessage>,
  ) => Update.Step<NoInfer<Parent>, OutStepMessage, R2>
  /** Observes each item's Messages in parent terms, after the item has handled it and its `onOut` has run. */
  readonly onMessage?: (
    message: Message,
    key: Key,
  ) => Update.Step<NoInfer<Parent>, OutStepMessage, R2>
  /** Prefix for the collection's Subscription keys. Defaults to `Name@path[]`. */
  readonly key?: string
  readonly when?: (parent: Parent, key: Key) => boolean
}

export type CollectionView<Parent, ParentMessage, ViewInputs, Key extends string = string> = [
  ViewInputs,
] extends [void]
  ? <H extends BuilderLike>(parent: Parent, h: ViewBuilder<H, ParentMessage>, key: Key) => Html
  : <H extends BuilderLike>(
      parent: Parent,
      h: ViewBuilder<H, ParentMessage>,
      key: Key,
      viewInputs: ViewInputs,
    ) => Html

export type CollectionHelpers<Parent, ParentMessage, R, Helpers, Key extends string = string> = {
  readonly [K in keyof Helpers]: Helpers[K] extends (model: any, ...input: infer Input) => any
    ? (key: Key, ...input: Input) => Update.Step<Parent, ParentMessage, R>
    : never
}

export interface PlacedCollection<
  Name extends string,
  Parent,
  ParentMessage,
  Model,
  Message,
  R,
  S,
  ViewInputs,
  Helpers,
  Field extends string = string,
  Key extends string = string,
  Claimed extends string = string,
> {
  readonly [PlacedCollectionTypeId]: typeof PlacedCollectionTypeId
  /** Types only: the record field this collection owns, or `string` when unknown. */
  readonly field?: Field
  /** Types only: the parent Message tag this collection routes, or `string` when unknown. */
  readonly claims?: Claimed
  readonly name: Name
  /** `Name@path[]`, or the configured `key`: the prefix of every Subscription key. */
  readonly key: string
  /** The encoded args as text, when the bundle has an args Schema. */
  readonly argsSummary: string | undefined
  /** Whether `args` was given as a seed factory; resolved once per initialization. */
  readonly hasDynamicArgs: boolean
  /**
   * Derives the factory's args from `seed` and retains them for `add`,
   * `update`, and Subscriptions. A no-op for static args.
   */
  readonly resolveArgs: (seed: unknown) => void
  readonly link: CollectionLink<Parent, ParentMessage, Model, Message, Key>
  /** Folds the Message into its item; `None` when it is not this collection's. A missing key leaves the parent unchanged. */
  readonly update: (
    parent: Parent,
    message: AnyMessage,
  ) => Option.Option<Update.Return<Parent, ParentMessage, R>>
  /**
   * Writes a new item from `init` and starts its Commands. `prepare` adjusts the
   * initial Model first, for what only the parent knows, such as the item's id.
   * An existing item is replaced.
   */
  readonly add: (
    key: Key,
    prepare?: (model: Model) => Model,
  ) => Update.Step<Parent, ParentMessage, R>
  /** Removes an item; its Subscriptions stop with it, and later Messages for it are ignored. */
  readonly remove: (key: Key) => Update.Step<Parent, ParentMessage, never>
  readonly subscriptions: Subscription.Subscriptions<Parent, ParentMessage, S>
  /** One item's view; nothing when the key is missing. */
  readonly view: CollectionView<Parent, ParentMessage, ViewInputs, Key>
  /** Every item's view, in the order of the Link's `entries`. */
  readonly viewAll: <H extends BuilderLike>(
    parent: Parent,
    h: ViewBuilder<H, ParentMessage>,
    ...viewInputs: [ViewInputs] extends [void] ? [] : [viewInputs: ViewInputs]
  ) => ReadonlyArray<Html>
  readonly helpers: CollectionHelpers<Parent, ParentMessage, R, Helpers, Key>
}

export type AnyPlacedCollection = PlacedCollection<
  string,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export const isPlacedCollection = (value: unknown): value is AnyPlacedCollection =>
  typeof value === 'object' && value !== null && PlacedCollectionTypeId in value

export type Each = <
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
  Key extends string,
  Field extends string,
>(
  bundle: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  link: CollectionLink<Parent, LinkMessage, Model, Message, Key, Field>,
  config?: EachConfig<
    Args,
    Parent,
    LinkMessage,
    Message,
    OutMessage,
    OutStepMessage,
    R2,
    Key,
    string extends Field ? Parent : Omit<Parent, Field>
  >,
) => PlacedCollection<
  Name,
  Parent,
  LinkMessage | OutStepMessage,
  Model,
  Message,
  R | R2,
  S,
  ViewInputs,
  Helpers,
  Field,
  Key,
  TagOf<LinkMessage>
>

type ErasedSpec = BundleSpec<string, any, any, any, any, any, any, any, any, any>
type ErasedLink = CollectionLink<any, any, any, any>
type ErasedConfig = EachConfig<any, any, any, any, any, any, any>
type ErasedStep = Update.Step<any, any, any>
type ErasedHelper = Helper<any, any, any, any>
type ErasedEntry = Subscription.Subscription<any, any, any, any>

const eachErased = (bundle: ErasedSpec, link: ErasedLink, config: ErasedConfig = {}) => {
  // The types reject this through `bundle.each`; a scope or declaration reaching
  // here from a loosely typed bundle must not drop the resources silently.
  if (bundle.resources !== undefined) {
    throw new Error(
      `Bundle.each: ${bundle.name} has Managed Resources, which a collection cannot place: the runtime provides a resource by one tag, so every item would share it.`,
    )
  }
  const rawArgs = config.args
  const factory = isArgsFactory(rawArgs)
  const prefix = config.key ?? `${bundle.name}@${link.path.join('.')}[]`
  let summary = factory ? undefined : (checkArgs(bundle, rawArgs, prefix) ?? bundle.preset)
  let resolved: unknown
  let hasResolved = false

  const needArgs = (): unknown => {
    if (!factory) return rawArgs
    if (!hasResolved) {
      throw new UnresolvedArgsError(prefix, 'items are added, updated, or Subscriptions read')
    }
    return resolved
  }

  const resolveFrom = (seed: unknown): void => {
    if (!factory) return
    const value = (rawArgs as (seed: unknown) => unknown)(seed)
    summary = checkArgs(bundle, value, prefix) ?? bundle.preset
    resolved = value
    hasResolved = true
    subsRecord = buildSubscriptions(value)
  }

  const buildSubscriptions = (args: unknown) =>
    bundle.subscriptions
      ? Subscription.make<any, any, any>()(() =>
          Record.mapKeys(
            Record.map(bundle.subscriptions!(args), liftEntry),
            key => `${prefix}/${key}`,
          ),
        )
      : {}

  const itemLink = (key: string) => {
    const read = (parent: unknown) => link.get(parent, key)
    return {
      read,
      write: writeIfChanged(read, (parent: unknown, child: unknown) =>
        link.write(parent, key, Option.some(child)),
      ),
      toParentMessage: (message: unknown) => link.toParentMessage(key, message),
    }
  }

  const foldItem = (
    key: string,
    run: (model: any) => Update.ReturnWithOutMessage<any, any, any, any>,
  ): ErasedStep =>
    Update.foldChildStep({
      update: run,
      ...itemLink(key),
      foldOutMessage: (outMessage, context) =>
        config.onOut === undefined
          ? parent => ({ model: parent })
          : config.onOut(outMessage, key, context),
    })

  const isOpen = (parent: unknown, key: string): boolean =>
    Option.match(link.when, { onNone: () => true, onSome: when => when(parent, key) }) &&
    (config.when === undefined || config.when(parent, key))

  type Items = ReadonlyArray<readonly [string, unknown]>

  // Each child entry becomes one parent entry whose dependencies list every open
  // item's own dependencies by key. A change restarts the entry's streams, unless
  // the child entry keeps alive: then the parent keeps alive while the keys are
  // unchanged and every item's dependencies are equivalent, and each item reads
  // its own latest dependencies.
  const liftEntry = (entry: ErasedEntry) => {
    const childEquivalence = entry.keepAliveEquivalence
    const toStream = (items: Items, readItems: () => Items) =>
      Stream.mergeAll(
        items.map(([key, dependencies]) => {
          const readDependencies = () =>
            Option.getOrElse(
              Option.map(
                Array.findFirst(readItems(), ([itemKey]) => itemKey === key),
                ([, latest]) => latest,
              ),
              () => dependencies,
            )
          return Stream.map(entry.dependenciesToStream(dependencies, readDependencies), message =>
            link.toParentMessage(key, message),
          )
        }),
        { concurrency: 'unbounded' },
      )
    return {
      dependenciesSchema: Schema.Struct({
        items: Schema.Array(Schema.Tuple([Schema.String, entry.dependenciesSchema])),
      }),
      modelToDependencies: (parent: unknown) => ({
        items: link
          .entries(parent)
          .filter(([key]) => isOpen(parent, key))
          .map(([key, child]) => [key, entry.modelToDependencies(child)] as const),
      }),
      ...(childEquivalence === undefined
        ? {
            dependenciesToStream: ({ items }: { readonly items: Items }) =>
              toStream(items, () => items),
          }
        : {
            keepAliveEquivalence: (
              self: { readonly items: Items },
              that: { readonly items: Items },
            ) =>
              self.items.length === that.items.length &&
              self.items.every(
                ([key, dependencies], index) =>
                  that.items[index]![0] === key &&
                  childEquivalence(dependencies, that.items[index]![1]),
              ),
            dependenciesToStream: (
              { items }: { readonly items: Items },
              readDependencies: () => { readonly items: Items },
            ) => toStream(items, () => readDependencies().items),
          }),
    }
  }

  // `liftEntry` is defined, so static args can build Subscriptions now; a
  // factory rebuilds them in `resolveFrom` once the seed exists.
  let subsRecord: Subscription.Subscriptions<any, any, any> = factory
    ? {}
    : buildSubscriptions(rawArgs)

  const childView = bundle.view
  const view = (parent: unknown, h: HtmlBuilder<any>, key: string, viewInputs?: unknown): Html =>
    childView === undefined
      ? null
      : Option.match(link.get(parent, key), {
          onNone: () => null,
          onSome: model =>
            viewInputs === undefined
              ? h.submodel({
                  slotId: `${prefix}/${key}`,
                  model,
                  view: childView,
                  toParentMessage: (message: unknown) => link.toParentMessage(key, message),
                })
              : h.submodel({
                  slotId: `${prefix}/${key}`,
                  model,
                  view: childView,
                  toParentMessage: (message: unknown) => link.toParentMessage(key, message),
                  // With `ViewInputs` erased, Foldkit's conditional config cannot name the inputs' type.
                  viewInputs: viewInputs as never,
                }),
        })

  return {
    [PlacedCollectionTypeId]: PlacedCollectionTypeId,
    name: bundle.name,
    key: prefix,
    get argsSummary() {
      return summary
    },
    hasDynamicArgs: factory,
    resolveArgs: resolveFrom,
    link,
    update: (parent: unknown, message: AnyMessage) =>
      Option.map(link.fromParentMessage(message), ([key, childMessage]) => {
        const args = needArgs()
        const fold = foldItem(key, model => bundle.update(model, childMessage, args))
        return config.onMessage === undefined
          ? fold(parent)
          : Update.combine(parent, [fold, config.onMessage(childMessage, key)])
      }),
    add:
      (key: string, prepare: (model: unknown) => unknown = model => model): ErasedStep =>
      parent => {
        // The assembly pre-resolves the factory from the base seed; adding
        // items standalone, the current parent is the seed.
        const args = factory && !hasResolved ? (resolveFrom(parent), resolved) : needArgs()
        return Update.foldChildInit(bundle.init(args), {
          toParentModel: child => link.write(parent, key, Option.some(prepare(child))),
          toParentMessage: message => link.toParentMessage(key, message),
        })
      },
    remove:
      (key: string): ErasedStep =>
      parent => ({ model: link.write(parent, key, Option.none()) }),
    get subscriptions() {
      if (factory && !hasResolved) needArgs()
      return subsRecord
    },
    view,
    viewAll: (parent: unknown, h: HtmlBuilder<any>, viewInputs?: unknown) =>
      Array.map(link.entries(parent), ([key]) => view(parent, h, key, viewInputs)),
    helpers: Record.map(
      bundle.helpers ?? {},
      (helper: ErasedHelper) =>
        (key: string, ...input: ReadonlyArray<unknown>) =>
          foldItem(key, model => helper(model, ...input)),
    ),
  }
}

// The one boundary where types are restored, as in `place`; the type tests pin them.
export const each: Each = eachErased as unknown as Each
