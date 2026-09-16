/**
 * An Assembly is the one list of a parent's placements. Routing, init,
 * Subscriptions, and Managed Resources all derive from it, and `complete`
 * checks that the runtime config wires every one of them.
 */
import { Array, Option, pipe } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { AnyMessage } from './link.js'
import type { PlacedCollection } from './collection.js'
import { isPlaced, type Invalid, type Placed } from './placed.js'

const Wired: unique symbol = Symbol.for('foldkit-bundle/Wired')

/** A record that came from an assembly, so `complete` can tell it includes the placements. */
export type WiredRecord<Record> = Record & { readonly [Wired]: true }

/** A single placement or a collection, in this parent. */
type PlacedIn<Model, Message> =
  | Placed<string, Model, Message, any, any, any, any, any, any, any>
  | PlacedCollection<string, Model, Message, any, any, any, any, any, any>

type RequirementsOf<P> =
  P extends Placed<string, any, any, any, any, infer R, any, any, any, any>
    ? R
    : P extends PlacedCollection<string, any, any, any, any, infer R, any, any, any>
      ? R
      : never
type ServicesOf<P> =
  P extends Placed<string, any, any, any, any, any, infer S, any, any, any>
    ? S
    : P extends PlacedCollection<string, any, any, any, any, any, infer S, any, any>
      ? S
      : never
type FieldOf<P> =
  P extends Placed<string, any, any, any, any, any, any, any, any, any, infer F>
    ? F
    : P extends PlacedCollection<string, any, any, any, any, any, any, any, any, infer F>
      ? F
      : never
type CollectionFieldOf<P> =
  P extends PlacedCollection<string, any, any, any, any, any, any, any, any, infer F> ? F : never

/**
 * What `initial` needs besides the placements: exactly the fields no placement
 * owns, with collection fields optional. When a placement came from a custom
 * Link its field is unknown, so every field is optional.
 */
export type InitialRest<Model, Ps extends ReadonlyArray<unknown>> =
  string extends FieldOf<Ps[number]>
    ? Partial<Model>
    : Omit<Model, FieldOf<Ps[number]>> &
        Partial<Pick<Model, CollectionFieldOf<Ps[number]> & keyof Model>>

type ResourceEntriesOf<P> = P extends { readonly resources: infer Resources }
  ? Resources[keyof Resources]
  : never

/** `Services` are what the parent's own update may require, as in `Update.Commands<Message, Services>`. */
export interface Assembly<
  Model,
  Message,
  Ps extends ReadonlyArray<PlacedIn<Model, Message>>,
  Services = never,
> {
  readonly placements: Ps
  /** The update of the placement a Message belongs to; `None` for the parent's own Messages. */
  readonly route: (
    model: Model,
    message: Message,
  ) => Option.Option<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
  /**
   * The parent's update: a placement's Message goes to that placement, and every
   * other Message to `own`. Without `own`, other Messages leave the Model unchanged.
   */
  // Deliberately not generic: a generic call written inline in `complete`'s config
  // stops TypeScript inferring that config, so the parent's services are stated once
  // on `assemble`.
  readonly update: (
    own?: (model: Model, message: Message) => Update.Return<Model, Message, Services>,
  ) => (
    model: Model,
    message: Message,
  ) => Update.Return<Model, Message, RequirementsOf<Ps[number]> | Services>
  /**
   * The parent's initial Model and Commands: `rest` for the fields no placement
   * owns, each single placement's `init`, and `{}` for a collection `rest` leaves
   * out. A placement whose field `rest` gives keeps that value and skips its
   * `init`, so an optional child can start as `None`. For `init` in the runtime config.
   */
  readonly initial: (
    rest: InitialRest<Model, Ps>,
  ) => Update.Return<Model, Message, RequirementsOf<Ps[number]>>
  /** Every single placement's init, in list order. Collections start empty; add items with `add`. */
  readonly init: Update.Step<Model, Message, RequirementsOf<Ps[number]>>
  /** The placements' Subscriptions merged with the parent's own. Throws on a duplicate key. */
  readonly subscriptions: <S = never>(
    own?: Subscription.Subscriptions<Model, Message, S>,
  ) => WiredRecord<Subscription.Subscriptions<Model, Message, S | ServicesOf<Ps[number]>>>
  /** The placements' Managed Resources merged with the parent's own. Throws on a duplicate key. */
  readonly resources: <
    Own extends Readonly<Record<string, ManagedResource.Entry<Model, Message, any, any, any>>> = {},
  >(
    own?: Own,
  ) => WiredRecord<Readonly<Record<string, ResourceEntriesOf<Ps[number]> | Own[keyof Own]>>>
  /**
   * Returns the runtime config unchanged after checking it wires the assembly:
   * `update` accepts every placement's Messages, and `subscriptions` and
   * `managedResources` came from this assembly. Wrap the config passed to
   * `Runtime.makeApplication` or `makeElement`.
   */
  readonly complete: <Config extends CompletableConfig<Model>>(
    config: Config & NoInfer<CompletenessChecks<Config, Message, Ps>>,
  ) => Config
}

interface CompletableConfig<Model> {
  readonly update: (model: Model, message: never) => unknown
  readonly subscriptions?: unknown
  readonly managedResources?: unknown
}

type HasResources<Ps extends ReadonlyArray<unknown>> = [ResourceEntriesOf<Ps[number]>] extends [
  never,
]
  ? false
  : true

type CompletenessChecks<Config, Message, Ps extends ReadonlyArray<unknown>> = (Config extends {
  readonly update: (model: any, message: infer Accepted) => unknown
}
  ? [Message] extends [Accepted]
    ? unknown
    : {
        readonly update: Invalid<"update does not accept every placement's Messages; spread each Link.wrapper(...).cases into the parent Message">
      }
  : unknown) &
  (Config extends { readonly subscriptions: { readonly [Wired]: true } }
    ? unknown
    : {
        readonly subscriptions: Invalid<'subscriptions must come from assembly.subscriptions(own), or the placements never subscribe'>
      }) &
  (HasResources<Ps> extends false
    ? unknown
    : Config extends { readonly managedResources: { readonly [Wired]: true } }
      ? unknown
      : {
          readonly managedResources: Invalid<'managedResources must come from assembly.resources(own), or the placements never acquire their resources'>
        })

// Non-enumerable, so the runtime's entry iteration never sees the brand as a record key.
const brand = <A extends object>(record: A): WiredRecord<A> =>
  Object.defineProperty(record, Wired, { value: true, enumerable: false }) as WiredRecord<A>

const assertDistinctResources = (
  placements: ReadonlyArray<Placed<string, any, any, any, any, any, any, any, any, any>>,
): void => {
  const owners = new Map<string, string>()
  for (const placed of placements) {
    for (const entry of Object.values(placed.resources)) {
      const owner = owners.get(entry.resource.key)
      if (owner !== undefined && owner !== placed.key) {
        throw new Error(
          `Bundle.assemble: ${owner} and ${placed.key} both use the Managed Resource "${entry.resource.key}". ` +
            'The runtime provides a resource by its tag, so the second placement would replace the first. ' +
            'Give each placement its own resource tag.',
        )
      }
      owners.set(entry.resource.key, placed.key)
    }
  }
}

/**
 * Collects a parent's placements. Curried so the parent Model and Message are
 * stated once and every placement is checked against them.
 */
export const assemble =
  <Model, Message extends AnyMessage, Services = never>() =>
  <const Ps extends ReadonlyArray<PlacedIn<Model, Message>>>(
    placements: Ps,
  ): Assembly<Model, Message, Ps, Services> => {
    // Collections have no resources and no init: `each` rejects bundles with resources.
    const singles = placements.filter(isPlaced)
    assertDistinctResources(singles)
    const keys = new Set<string>()
    for (const placed of placements) {
      if (keys.has(placed.key)) {
        throw new Error(
          `Bundle.assemble: two placements share the key "${placed.key}"; pass a distinct \`key\`.`,
        )
      }
      keys.add(placed.key)
    }

    const route = (model: Model, message: Message) =>
      pipe(
        placements,
        Array.findFirst(placed => placed.update(model, message)),
      )

    const init: Update.Step<Model, Message, RequirementsOf<Ps[number]>> = Update.combine(
      singles.map(placed => placed.init),
    )

    return {
      placements,
      route,
      update: ((own?: (model: Model, message: Message) => Update.Return<Model, Message, unknown>) =>
        (model: Model, message: Message) =>
          Option.getOrElse(route(model, message), () =>
            own === undefined ? { model } : own(model, message),
          )) as Assembly<Model, Message, Ps, Services>['update'],
      init,
      initial: rest => {
        // Collections at a top-level field start empty. A single placement's init
        // writes its slice unless `rest` already gives that field, which is how an
        // optional child (Link.optional) starts absent.
        const given = new Set(Object.keys(rest))
        const collections = Object.fromEntries(
          placements
            .filter(placement => !isPlaced(placement) && placement.link.path.length === 1)
            .map(placement => [placement.link.path[0], {}]),
        )
        const inits: ReadonlyArray<Update.Step<Model, Message, RequirementsOf<Ps[number]>>> =
          singles.filter(placed => !given.has(placed.link.path[0] ?? '')).map(placed => placed.init)
        return Update.combine({ ...collections, ...rest } as Model, inits)
      },
      subscriptions: own =>
        brand(
          Subscription.aggregate<Model, Message, any>()(
            ...placements.map(placed => placed.subscriptions),
            own ?? {},
          ),
        ),
      resources: own =>
        brand(
          ManagedResource.aggregate<Model, Message>()(
            ...singles.map(placed => placed.resources),
            own ?? {},
          ),
        ),
      complete: config => config,
    }
  }
