/**
 * An Assembly is the one list of what joins a parent: bundle placements and
 * integration wiring (Remote, Mirror, Sync, Agent). Routing, initial state,
 * Subscriptions, Managed Resources, and URL handling all derive from it, and
 * `complete` checks that the runtime config uses every one of them.
 */
import { Array, Option, pipe } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { Url } from 'foldkit/url'
import type { AnyMessage } from './link.js'
import { isPlacedCollection, type PlacedCollection } from './collection.js'
import { isPlaced, type Invalid, type Placed } from './placed.js'
import { isWiring, type AnyWiring, type Wiring } from './wiring.js'

const Wired: unique symbol = Symbol.for('foldkit-bundle/Wired')

/** A value that came from an assembly, so `complete` can tell the config uses it. */
export type WiredRecord<Record> = Record & { readonly [Wired]: true }

/** A single placement, a collection, or an integration's wiring, in this parent. */
export type PlacedIn<Model, Message> =
  | Placed<string, Model, Message, any, any, any, any, any, any, any>
  | PlacedCollection<string, Model, Message, any, any, any, any, any, any, any, any>
  | Wiring<Model, Message, any>

type RequirementsOf<P> =
  P extends Placed<string, any, any, any, any, infer R, any, any, any, any>
    ? R
    : P extends PlacedCollection<string, any, any, any, any, infer R, any, any, any, any, any>
      ? R
      : P extends Wiring<any, any, infer R>
        ? R
        : never
type ServicesOf<P> =
  P extends Placed<string, any, any, any, any, any, infer S, any, any, any>
    ? S
    : P extends PlacedCollection<string, any, any, any, any, any, infer S, any, any, any, any>
      ? S
      : P extends Wiring<any, any, infer R>
        ? R
        : never
type FieldOf<P> =
  P extends Placed<string, any, any, any, any, any, any, any, any, any, infer F>
    ? F
    : P extends PlacedCollection<string, any, any, any, any, any, any, any, any, infer F, any>
      ? F
      : never
type CollectionFieldOf<P> =
  P extends PlacedCollection<string, any, any, any, any, any, any, any, any, infer F, any>
    ? F
    : never

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

// A wiring counts only when its type declares the part as a required property.
type ResourceEntriesOf<P> = P extends { readonly resources: infer Resources }
  ? Resources extends object
    ? Resources[keyof Resources]
    : never
  : never
type HasInit<P> = P extends {
  readonly handles: readonly string[]
  readonly init: Update.Step<any, any, any>
}
  ? true
  : never
type HasUrl<P> = P extends {
  readonly handles: readonly string[]
  readonly onUrl: (model: any, url: Url) => any
}
  ? true
  : never

/** The runtime's URL config from `assembly.url`: every wiring's `onUrl` at startup, and a Message after. */
export type WiredUrl<Model, UrlMessage> = WiredRecord<{
  readonly init: (model: Model, url: Url) => Model
  readonly onUrlChange: (url: Url) => UrlMessage
}>

/** `Services` are what the parent's own update may require, as in `Update.Commands<Message, Services>`. */
export interface Assembly<
  Model,
  Message,
  Ps extends ReadonlyArray<PlacedIn<Model, Message>>,
  Services = never,
> {
  readonly placements: Ps
  /** The update of the placement or wiring a Message belongs to; `None` for the parent's own Messages. */
  readonly route: (
    model: Model,
    message: Message,
  ) => Option.Option<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
  /**
   * The parent's update: a placement's or wiring's Message goes there, and every
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
   * owns, each single placement's `init`, and empty storage for a collection `rest`
   * leaves out. A placement whose top-level field `rest` gives keeps that value and
   * skips its `init`, so an optional child can start as `None`. Each wiring's `init`
   * runs after the placements', in list order. For `init` in the runtime config.
   */
  readonly initial: (
    rest: InitialRest<Model, Ps>,
  ) => WiredRecord<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
  /** Every single placement's init, outer before nested, then each wiring's init in list order. */
  readonly init: Update.Step<Model, Message, RequirementsOf<Ps[number]>>
  /**
   * The runtime URL config: `init` applies every wiring's `onUrl` to the Model, and
   * a URL change becomes `onUrlChange`'s Message, which a wiring routes.
   */
  readonly url: <UrlMessage extends Message>(
    onUrlChange: (url: Url) => UrlMessage,
  ) => WiredUrl<Model, UrlMessage>
  /** Every item's Subscriptions merged with the parent's own. Throws on a duplicate key. */
  readonly subscriptions: <S = never>(
    own?: Subscription.Subscriptions<Model, Message, S>,
  ) => WiredRecord<Subscription.Subscriptions<Model, Message, S | ServicesOf<Ps[number]>>>
  /** Every item's Managed Resources merged with the parent's own. Throws on a duplicate key or a shared tag. */
  readonly resources: <
    Own extends Readonly<Record<string, ManagedResource.Entry<Model, Message, any, any, any>>> = {},
  >(
    own?: Own,
  ) => WiredRecord<Readonly<Record<string, ResourceEntriesOf<Ps[number]> | Own[keyof Own]>>>
  /**
   * Returns the runtime config unchanged after checking it uses the assembly:
   * `update` accepts the whole parent Message; `subscriptions`, `managedResources`,
   * `init`, and `url` came from this assembly wherever an item needs them. Wrap the
   * config passed to `Runtime.makeApplication`, `makeElement`, or `Sync.mount`.
   */
  readonly complete: <Config extends CompletableConfig<Model>>(
    config: Config & NoInfer<CompletenessChecks<Config, Message, Ps>>,
  ) => Config
}

interface CompletableConfig<Model> {
  readonly update: (model: Model, message: never) => unknown
  readonly init?: unknown
  readonly subscriptions?: unknown
  readonly managedResources?: unknown
  readonly url?: unknown
}

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
  ([ResourceEntriesOf<Ps[number]>] extends [never]
    ? unknown
    : Config extends { readonly managedResources: { readonly [Wired]: true } }
      ? unknown
      : {
          readonly managedResources: Invalid<'managedResources must come from assembly.resources(own), or the placements never acquire their resources'>
        }) &
  ([HasInit<Ps[number]>] extends [never]
    ? unknown
    : Config extends { readonly init: (...args: any) => { readonly [Wired]: true } }
      ? unknown
      : {
          readonly init: Invalid<'init must return assembly.initial(rest), or a wiring never runs its startup Commands'>
        }) &
  ([HasUrl<Ps[number]>] extends [never]
    ? unknown
    : Config extends { readonly url: { readonly [Wired]: true } }
      ? unknown
      : {
          readonly url: Invalid<'url must come from assembly.url(onUrlChange), or a wiring never reads the URL'>
        })

// Non-enumerable, so the runtime's entry iteration never sees the brand as a record key.
const brand = <A extends object>(record: A): WiredRecord<A> =>
  Object.defineProperty(record, Wired, { value: true, enumerable: false }) as WiredRecord<A>

type ResourceRecord = Readonly<Record<string, ManagedResource.Entry<any, any, any, any, any>>>

/** Two users of one Managed Resource tag: the runtime provides a resource by tag, so one would replace the other. */
const assertDistinctResources = (
  users: ReadonlyArray<{ readonly key: string; readonly resources: ResourceRecord }>,
): void => {
  const owners = new Map<string, string>()
  for (const user of users) {
    for (const entry of Object.values(user.resources)) {
      const owner = owners.get(entry.resource.key)
      if (owner !== undefined && owner !== user.key) {
        throw new Error(
          `Bundle.assemble: ${owner} and ${user.key} both use the Managed Resource "${entry.resource.key}". ` +
            'The runtime provides a resource by its tag, so one would replace the other. ' +
            'Give each its own resource tag.',
        )
      }
      owners.set(entry.resource.key, user.key)
    }
  }
}

type AnyPlacement =
  | Placed<string, any, any, any, any, any, any, any, any, any>
  | PlacedCollection<string, any, any, any, any, any, any, any, any, any, any>

const isPlacement = (item: unknown): item is AnyPlacement =>
  isPlaced(item) || isPlacedCollection(item)

/**
 * Collects a parent's placements and wiring. Curried so the parent Model and
 * Message are stated once and every item is checked against them.
 */
export const assemble =
  <Model, Message extends AnyMessage, Services = never>() =>
  <const Ps extends ReadonlyArray<PlacedIn<Model, Message>>>(
    items: Ps,
  ): Assembly<Model, Message, Ps, Services> => {
    const singles = items.filter(isPlaced)
    const collections = items.filter(isPlacedCollection)
    const wirings: ReadonlyArray<AnyWiring> = items.filter(
      (item): item is AnyWiring => !isPlacement(item) && isWiring(item),
    )

    const keys = new Set<string>()
    for (const item of items) {
      if (keys.has(item.key)) {
        throw new Error(
          `Bundle.assemble: two items share the key "${item.key}"; pass a distinct \`key\`.`,
        )
      }
      keys.add(item.key)
    }

    // Routing takes the first item that handles a Message, so two claimants of one
    // tag would send one's Messages to the other, unless a wiring declares the tag
    // shared and routes only its own values.
    const shared = new Set(wirings.flatMap(wiring => wiring.shared ?? []))
    const claims = new Map<string, string>()
    const claim = (tag: string, owner: string, sharable: boolean) => {
      const other = claims.get(tag)
      if (other !== undefined && !(sharable && shared.has(tag))) {
        throw new Error(
          `Bundle.assemble: ${other} and ${owner} both handle "${tag}", so its Messages would reach only one. Give each its own wrapper or Message.`,
        )
      }
      claims.set(tag, owner)
    }
    for (const placed of [...singles, ...collections]) {
      claim(placed.link.messages.join(' > '), placed.key, false)
    }
    for (const wiring of wirings) {
      for (const tag of wiring.handles) claim(tag, wiring.key, true)
    }

    const resourceUsers = [
      ...singles.map(placed => ({
        key: placed.key,
        resources: placed.resources as ResourceRecord,
      })),
      ...wirings.map(wiring => ({ key: wiring.key, resources: wiring.resources ?? {} })),
    ]
    assertDistinctResources(resourceUsers)

    // Each item's own types were checked where it was built; the list holds them erased.
    const route = (model: Model, message: Message) =>
      pipe(
        items,
        Array.findFirst(item =>
          isPlacement(item)
            ? item.update(model, message)
            : ((item as AnyWiring).route?.(model, message) ?? Option.none()),
        ),
      ) as Option.Option<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>

    // Shallower placements first, so an outer child's init cannot replace a nested
    // child that was already initialised inside it. Wiring runs after placements.
    const byDepth = [...singles].sort((a, b) => a.link.path.length - b.link.path.length)
    const wiringInits = wirings.flatMap(wiring => (wiring.init === undefined ? [] : [wiring.init]))
    const init: Update.Step<Model, Message, RequirementsOf<Ps[number]>> = Update.combine([
      ...byDepth.map(placed => placed.init),
      ...wiringInits,
    ])

    return {
      placements: items,
      route,
      update: ((own?: (model: Model, message: Message) => Update.Return<Model, Message, unknown>) =>
        (model: Model, message: Message) =>
          Option.getOrElse(route(model, message), () =>
            own === undefined ? { model } : own(model, message),
          )) as Assembly<Model, Message, Ps, Services>['update'],
      init,
      initial: rest => {
        // Collections at a top-level field start as their Link's empty storage. A
        // placement at a top-level field is initialised unless `rest` gives that
        // field, which is how an optional child (Link.optional) starts absent. A
        // nested placement is always initialised, inside whatever `rest` gave.
        const given = new Set(Object.keys(rest))
        const empties = Object.fromEntries(
          collections
            .filter(collection => collection.link.path.length === 1)
            .map(collection => [collection.link.path[0], collection.link.empty]),
        )
        const steps: ReadonlyArray<Update.Step<Model, Message, RequirementsOf<Ps[number]>>> = [
          ...byDepth
            .filter(placed => !(placed.link.path.length === 1 && given.has(placed.link.path[0]!)))
            .map(placed => placed.init),
          ...wiringInits,
        ]
        return brand({ ...Update.combine({ ...empties, ...rest } as Model, steps) })
      },
      url: onUrlChange =>
        brand({
          init: (model: Model, url: Url) =>
            wirings.reduce(
              (next, wiring) => (wiring.onUrl === undefined ? next : wiring.onUrl(next, url)),
              model,
            ),
          onUrlChange,
        }),
      subscriptions: own =>
        brand(
          Subscription.aggregate<Model, Message, any>()(
            ...items.map(item => item.subscriptions ?? {}),
            own ?? {},
          ),
        ),
      resources: own => {
        if (own !== undefined)
          assertDistinctResources([
            ...resourceUsers,
            { key: "the parent's own resources", resources: own },
          ])
        return brand(
          ManagedResource.aggregate<Model, Message>()(
            ...resourceUsers.map(user => user.resources),
            own ?? {},
          ),
        )
      },
      complete: config => config,
    }
  }
