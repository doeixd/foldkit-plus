/**
 * A bundle placed many times: one child per key in a record. Routing, init,
 * and folds work per item; each child Subscription becomes one parent entry
 * over every item.
 */
import { Array, Option, Record, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { BundleSpec, Helper, ResourceEntries } from './bundle.js'
import type { AnyMessage, CollectionLink } from './link.js'
import type { ViewBuilder } from './placed.js'

const PlacedCollectionTypeId: unique symbol = Symbol.for('foldkit-bundle/PlacedCollection')

export interface EachConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2> {
  /** The args every item's `init` and `update` receive. */
  readonly args?: Args
  /** Handles an item's OutMessage in parent terms, with the item already written back. */
  readonly onOut?: (
    outMessage: OutMessage,
    key: string,
    context: Update.FoldContext<Message, LinkMessage>,
  ) => Update.Step<NoInfer<Parent>, OutStepMessage, R2>
  /** Prefix for the collection's Subscription keys. Defaults to `Name@path[]`. */
  readonly key?: string
}

export type CollectionView<Parent, ParentMessage, ViewInputs> = [ViewInputs] extends [void]
  ? <H extends HtmlBuilder<any>>(
      parent: Parent,
      h: ViewBuilder<H, ParentMessage>,
      key: string,
    ) => Html
  : <H extends HtmlBuilder<any>>(
      parent: Parent,
      h: ViewBuilder<H, ParentMessage>,
      key: string,
      viewInputs: ViewInputs,
    ) => Html

export type CollectionHelpers<Parent, ParentMessage, R, Helpers> = {
  readonly [K in keyof Helpers]: Helpers[K] extends (model: any, ...input: infer Input) => any
    ? (key: string, ...input: Input) => Update.Step<Parent, ParentMessage, R>
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
> {
  readonly [PlacedCollectionTypeId]: typeof PlacedCollectionTypeId
  /** Types only: the record field this collection owns, or `string` when unknown. */
  readonly field?: Field
  readonly name: Name
  /** `Name@path[]`, or the configured `key`: the prefix of every Subscription key. */
  readonly key: string
  readonly link: CollectionLink<Parent, ParentMessage, Model, Message>
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
    key: string,
    prepare?: (model: Model) => Model,
  ) => Update.Step<Parent, ParentMessage, R>
  /** Removes an item; its Subscriptions stop with it, and later Messages for it are ignored. */
  readonly remove: (key: string) => Update.Step<Parent, ParentMessage, never>
  readonly subscriptions: Subscription.Subscriptions<Parent, ParentMessage, S>
  /** One item's view; nothing when the key is missing. */
  readonly view: CollectionView<Parent, ParentMessage, ViewInputs>
  /** Every item's view, in the record's key order. */
  readonly viewAll: <H extends HtmlBuilder<any>>(
    parent: Parent,
    h: ViewBuilder<H, ParentMessage>,
    ...viewInputs: [ViewInputs] extends [void] ? [] : [viewInputs: ViewInputs]
  ) => ReadonlyArray<Html>
  readonly helpers: CollectionHelpers<Parent, ParentMessage, R, Helpers>
}

export type AnyPlacedCollection = PlacedCollection<string, any, any, any, any, any, any, any, any>

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
>(
  bundle: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  link: CollectionLink<Parent, LinkMessage, Model, Message>,
  config?: EachConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>,
) => PlacedCollection<
  Name,
  Parent,
  LinkMessage | OutStepMessage,
  Model,
  Message,
  R | R2,
  S,
  ViewInputs,
  Helpers
>

type ErasedSpec = BundleSpec<string, any, any, any, any, any, any, any, any, any>
type ErasedLink = CollectionLink<any, any, any, any>
type ErasedConfig = EachConfig<any, any, any, any, any, any, any>
type ErasedStep = Update.Step<any, any, any>
type ErasedHelper = Helper<any, any, any, any>
type ErasedEntry = Subscription.Subscription<any, any, any, any>

const eachErased = (bundle: ErasedSpec, link: ErasedLink, config: ErasedConfig = {}) => {
  const args = config.args
  const prefix = config.key ?? `${bundle.name}@${link.path.join('.')}[]`

  const itemLink = (key: string) => ({
    read: (parent: unknown) => Record.get(link.read(parent), key),
    write: (parent: unknown, child: unknown) => link.write(parent, key, Option.some(child)),
    toParentMessage: (message: unknown) => link.toParentMessage(key, message),
  })

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
    Option.match(link.when, { onNone: () => true, onSome: when => when(parent, key) })

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
        items: Object.entries(link.read(parent))
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

  const subscriptions = bundle.subscriptions
    ? Subscription.make<any, any, any>()(() =>
        Record.mapKeys(
          Record.map(bundle.subscriptions!(args), liftEntry),
          key => `${prefix}/${key}`,
        ),
      )
    : {}

  const childView = bundle.view
  const view = (parent: unknown, h: HtmlBuilder<any>, key: string, viewInputs?: unknown): Html =>
    childView === undefined
      ? null
      : Option.match(Record.get(link.read(parent), key), {
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
    link,
    update: (parent: unknown, message: AnyMessage) =>
      Option.map(link.fromParentMessage(message), ([key, childMessage]) =>
        foldItem(key, model => bundle.update(model, childMessage, args))(parent),
      ),
    add:
      (key: string, prepare: (model: unknown) => unknown = model => model): ErasedStep =>
      parent => {
        const initial = bundle.init(args)
        return {
          model: link.write(parent, key, Option.some(prepare(initial.model))),
          commands: Command.mapMessages(initial.commands, message =>
            link.toParentMessage(key, message),
          ),
        }
      },
    remove:
      (key: string): ErasedStep =>
      parent => ({ model: link.write(parent, key, Option.none()) }),
    subscriptions,
    view,
    viewAll: (parent: unknown, h: HtmlBuilder<any>, viewInputs?: unknown) =>
      Array.map(Object.keys(link.read(parent)), key => view(parent, h, key, viewInputs)),
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
