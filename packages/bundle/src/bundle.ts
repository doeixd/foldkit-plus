/**
 * A Bundle is one value holding everything a child machine is: its Model and
 * Message Schemas, `init`, `update`, Subscriptions, Managed Resources, view,
 * and programmatic entry points. It holds no state; placing it with a Link
 * compiles each part to the Foldkit lift that already exists for it.
 */
import { Pipeable, type Option, type Schema } from 'effect'
import type * as ManagedResource from 'foldkit/managedResource'
import type * as Submodel from 'foldkit/submodel'
import type * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import type { AnyMessage, Link } from './link.js'
import { each, type EachConfig, type PlacedCollection } from './collection.js'
import { checkArgs, place, type Invalid, type PlaceConfig, type Placed } from './placed.js'
import type { CollectionLink } from './link.js'

const BundleTypeId: unique symbol = Symbol.for('foldkit-bundle/Bundle')

/** A child Managed Resource entry: its requirements are an `Option`, so the entry can release. */
export type ResourceEntry<Model, Message> = ManagedResource.Entry<
  Model,
  Message,
  Option.Option<any>,
  any,
  any
>

export type ResourceEntries<Model, Message> = Readonly<
  Record<string, ResourceEntry<Model, Message>>
>

/** A programmatic entry point, like `Dialog.open`: the child Model plus any input. */
export type Helper<Model, Message, OutMessage, R> = (
  model: Model,
  ...input: ReadonlyArray<any>
) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>

export interface BundleSpec<
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
> {
  readonly name: Name
  readonly Model: Schema.Codec<Model, unknown>
  readonly Message: Schema.Codec<Message, unknown>
  /**
   * The args Schema. When given, `Args` is inferred from it, a placement's args
   * are checked against it, and Module lists them.
   */
  readonly args?: Schema.Codec<Args, unknown>
  /** Set by `with`: the bound args, encoded as text, for Module. */
  readonly preset?: string | undefined
  /** Runs when the bundle is placed; its Commands start with the placement. */
  readonly init: (args: Args) => Update.Return<Model, Message, R>
  readonly update: (
    model: Model,
    message: Message,
    args: Args,
  ) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>
  readonly subscriptions?: (args: Args) => Subscription.Subscriptions<Model, Message, S>
  readonly resources?: (args: Args) => Resources
  readonly view?: Submodel.View<Model, Message, ViewInputs>
  readonly helpers?: Helpers
}

export interface Bundle<
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
>
  extends
    BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
    Pipeable.Pipeable {
  readonly [BundleTypeId]: typeof BundleTypeId
  /**
   * A preset: the same bundle with its args bound, so placements need no `args`.
   * The args are checked against the args Schema when there is one.
   */
  readonly with: (
    args: Args,
  ) => Bundle<Name, void, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>
  /** Places the bundle where `link` points. */
  readonly at: <Parent, LinkMessage, OutStepMessage = never, R2 = never>(
    link: Link<Parent, LinkMessage, Model, Message>,
    ...config: PlaceConfigParam<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>
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
  /** Places the bundle once per key of the record `link` points at. */
  readonly each: [keyof Resources] extends [never]
    ? <Parent, LinkMessage, Key extends string, OutStepMessage = never, R2 = never>(
        link: CollectionLink<Parent, LinkMessage, Model, Message, Key>,
        ...config: EachConfigParam<
          Args,
          Parent,
          LinkMessage,
          Message,
          OutMessage,
          OutStepMessage,
          R2,
          Key
        >
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
        string,
        Key
      >
    : Invalid<'Bundle.each does not support Managed Resources yet: the runtime provides a resource by one tag, so items would share it'>
}

/**
 * What placing needs: `args` when `init` takes them, and `onOut` when the
 * bundle has an OutMessage, so an OutMessage is never dropped by omission.
 */
export type PlacementConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2> = {
  /** Prefix for the placement's Subscription and resource keys. Defaults to `Name@path`. */
  readonly key?: string
  /** A gate beside the Link's own: the child's Subscriptions and resources run only while both hold. */
  readonly when?: (parent: Parent) => boolean
} & ([Args] extends [void] ? { readonly args?: never } : { readonly args: Args }) &
  ([OutMessage] extends [never]
    ? { readonly onOut?: never }
    : {
        readonly onOut: Required<
          PlaceConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>
        >['onOut']
      })

/** The config argument is optional only when it would be empty. */
export type PlaceConfigParam<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2> = [
  Args,
] extends [void]
  ? [OutMessage] extends [never]
    ? [config?: PlacementConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>]
    : [config: PlacementConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>]
  : [config: PlacementConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2>]

type EachOptions<
  Args,
  Parent,
  LinkMessage,
  Message,
  OutMessage,
  OutStepMessage,
  R2,
  Key extends string = string,
> = {
  readonly key?: string
  /** A gate per item beside the Link's own: an item's Subscriptions run only while both hold. */
  readonly when?: (parent: Parent, key: Key) => boolean
} & ([Args] extends [void] ? { readonly args?: never } : { readonly args: Args }) &
  ([OutMessage] extends [never]
    ? { readonly onOut?: never }
    : {
        readonly onOut: Required<
          EachConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2, Key>
        >['onOut']
      })

export type EachConfigParam<
  Args,
  Parent,
  LinkMessage,
  Message,
  OutMessage,
  OutStepMessage,
  R2,
  Key extends string = string,
> = [Args] extends [void]
  ? [OutMessage] extends [never]
    ? [
        config?: EachOptions<
          Args,
          Parent,
          LinkMessage,
          Message,
          OutMessage,
          OutStepMessage,
          R2,
          Key
        >,
      ]
    : [config: EachOptions<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2, Key>]
  : [config: EachOptions<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2, Key>]

/** Any bundle, for APIs that accept one without caring about its types. */
export type AnyBundle = Bundle<string, any, any, any, any, any, any, any, any, any>

export const isBundle = (value: unknown): value is AnyBundle =>
  typeof value === 'object' && value !== null && BundleTypeId in value

const build = <
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Resources extends ResourceEntries<Model, Message> = {},
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  spec: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
): Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers> => {
  const bundle: Bundle<
    Name,
    Args,
    Model,
    Message,
    OutMessage,
    R,
    S,
    ViewInputs,
    Resources,
    Helpers
  > = {
    ...spec,
    [BundleTypeId]: BundleTypeId,
    pipe() {
      return Pipeable.pipeArguments(this, arguments)
    },
    with: args => {
      const preset = checkArgs(spec, args, spec.name)
      return build({
        name: spec.name,
        preset,
        Model: spec.Model,
        Message: spec.Message,
        init: () => spec.init(args),
        update: (model, message) => spec.update(model, message, args),
        ...(spec.subscriptions === undefined
          ? {}
          : { subscriptions: () => spec.subscriptions!(args) }),
        ...(spec.resources === undefined ? {} : { resources: () => spec.resources!(args) }),
        ...(spec.view === undefined ? {} : { view: spec.view }),
        ...(spec.helpers === undefined ? {} : { helpers: spec.helpers }),
      })
    },
    at: (link, ...[config]) => place(bundle, link, config),
    // The conditional type only hides `each` from bundles with resources; the function is the same.
    each: ((
      link: CollectionLink<any, any, Model, Message>,
      config?: EachConfig<any, any, any, Message, OutMessage, any, any>,
    ) => each(bundle, link, config)) as unknown as Bundle<
      Name,
      Args,
      Model,
      Message,
      OutMessage,
      R,
      S,
      ViewInputs,
      Resources,
      Helpers
    >['each'],
  }
  return bundle
}

/** A spec without its name, for the `make(name, spec)` form; `name` is given once. */
export type NamelessSpec<
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
> = Omit<
  BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  'name'
> & { readonly name?: never }

/**
 * Collects a child machine's parts into a bundle. Name it first,
 * `make('Search', { Model, Message, init, update })`, or inside the spec.
 */
export function make<
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Resources extends ResourceEntries<Model, Message> = {},
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  name: Name,
  spec: NamelessSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
): Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>
export function make<
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Resources extends ResourceEntries<Model, Message> = {},
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  spec: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
): Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>
export function make(
  nameOrSpec: string | BundleSpec<string, any, any, any, any, any, any, any, any, any>,
  spec?: Omit<BundleSpec<string, any, any, any, any, any, any, any, any, any>, 'name'>,
): AnyBundle {
  return build(typeof nameOrSpec === 'string' ? { ...spec!, name: nameOrSpec } : nameOrSpec)
}

export interface PartsConfig<
  Name extends string,
  Args,
  Model,
  Message extends AnyMessage,
  OutMessage,
  R,
  S,
  ViewInputs,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>>,
> {
  readonly name: Name
  readonly Model: Schema.Codec<Model, unknown>
  readonly Message: Schema.Codec<Message, unknown>
  readonly init: (args: Args) => Model
  readonly parts: {
    readonly update: (
      model: Model,
      message: Message,
    ) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>
    readonly view?: Submodel.View<Model, Message, ViewInputs>
  }
  readonly subscriptions?: (args: Args) => Subscription.Subscriptions<Model, Message, S>
  readonly helpers?: Helpers
}

type ErasedPartsConfig = PartsConfig<string, any, any, any, any, any, any, any, any>

/**
 * A bundle from a component that ships its parts separately, like the
 * `@foldkit/ui` components: `init` returns only the Model, and `parts` is the
 * `{ update, view }` pair their `create()` returns.
 */
export function fromParts<
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  name: Name,
  config: Omit<
    PartsConfig<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Helpers>,
    'name'
  > & {
    readonly name?: never
  },
): Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, {}, Helpers>
export function fromParts<
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  config: PartsConfig<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Helpers>,
): Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, {}, Helpers>
export function fromParts(
  nameOrConfig: string | ErasedPartsConfig,
  maybeConfig?: Omit<ErasedPartsConfig, 'name'>,
): AnyBundle {
  const config: ErasedPartsConfig =
    typeof nameOrConfig === 'string' ? { ...maybeConfig!, name: nameOrConfig } : nameOrConfig
  return build({
    name: config.name,
    Model: config.Model,
    Message: config.Message,
    init: args => ({ model: config.init(args) }),
    update: (model, message) => config.parts.update(model, message),
    ...(config.parts.view === undefined ? {} : { view: config.parts.view }),
    ...(config.subscriptions === undefined ? {} : { subscriptions: config.subscriptions }),
    ...(config.helpers === undefined ? {} : { helpers: config.helpers }),
  })
}

/**
 * An `onOut` that deliberately drops the OutMessage. `onOut` stays required, so
 * dropping one is a visible choice rather than an omission.
 */
// The returned Step is generic rather than `ignore` itself, so the placement still
// infers its parent from the Link.
export const ignore =
  (..._: ReadonlyArray<unknown>) =>
  <Parent>(parent: Parent): Update.Return<Parent, never, never> => ({ model: parent })

export { assemble } from './assembly.js'
export type { Assembly, WiredRecord } from './assembly.js'
export { declare, declareEach } from './declare.js'
export type { Declared, DeclaredEach, WrapperTag } from './declare.js'
export { parent } from './parent.js'
export type { Parent } from './parent.js'
export type { BundleParts } from './declare.js'
export type { InitialRest } from './assembly.js'
export {
  mapInit,
  mapUpdate,
  mapView,
  rename,
  withHelpers,
  withSubscriptions,
} from './combinators.js'
