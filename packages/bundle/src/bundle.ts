/**
 * A Bundle is one value holding everything a child machine is: its Model and
 * Message Schemas, `init`, `update`, Subscriptions, Managed Resources, view,
 * and programmatic entry points. It holds no state; placing it with a Link
 * compiles each part to the Foldkit lift that already exists for it.
 */
import type { Option, Schema } from 'effect'
import type * as ManagedResource from 'foldkit/managedResource'
import type * as Submodel from 'foldkit/submodel'
import type * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import type { AnyMessage, Link } from './link.js'
import { place, type PlaceConfig, type Placed } from './placed.js'

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
> extends BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers> {
  readonly [BundleTypeId]: typeof BundleTypeId
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
}

/**
 * What placing needs: `args` when `init` takes them, and `onOut` when the
 * bundle has an OutMessage, so an OutMessage is never dropped by omission.
 */
export type PlacementConfig<Args, Parent, LinkMessage, Message, OutMessage, OutStepMessage, R2> = {
  /** Prefix for the placement's Subscription and resource keys. Defaults to `Name@path`. */
  readonly key?: string
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

/** Any bundle, for APIs that accept one without caring about its types. */
export type AnyBundle = Bundle<string, any, any, any, any, any, any, any, any, any>

export const isBundle = (value: unknown): value is AnyBundle =>
  typeof value === 'object' && value !== null && BundleTypeId in value

export const make = <
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
    at: (link, ...[config]) => place(bundle, link, config),
  }
  return bundle
}

export { assemble } from './assembly.js'
export type { Assembly, WiredRecord } from './assembly.js'
