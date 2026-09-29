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

// A placement whose wrapper tag the types cannot read (`string`) narrows nothing.
type ClaimedOf<P> =
  P extends Placed<string, any, any, any, any, any, any, any, any, any, any, infer C>
    ? KnownTag<C>
    : P extends PlacedCollection<string, any, any, any, any, any, any, any, any, any, any, infer C>
      ? KnownTag<C>
      : never
type KnownTag<Tag extends string> = string extends Tag ? never : Tag

/** The fields among `Fields` that hold an `Option`, which a placement may start as `None`. */
type OptionFields<Model, Fields> = {
  [K in Fields & keyof Model]: Model[K] extends Option.Option<unknown> ? K : never
}[Fields & keyof Model]

/**
 * What `initial` needs besides the placements: exactly the fields no placement
 * owns, with collection fields and `Option` fields (`Link.optional`) optional,
 * since giving one skips its placement's `init`. When a placement's Link names
 * no field the types can read, every field is optional.
 */
export type InitialRest<Model, Ps extends ReadonlyArray<unknown>> =
  string extends FieldOf<Ps[number]>
    ? Partial<Model>
    : Omit<Model, FieldOf<Ps[number]>> &
        Partial<
          Pick<
            Model,
            (CollectionFieldOf<Ps[number]> | OptionFields<Model, FieldOf<Ps[number]>>) & keyof Model
          >
        >

/**
 * The Messages the parent's own update receives from `assembly.update(own)`:
 * every Message but the wrapper variants its placements route.
 */
export type OwnMessage<Message, Ps extends ReadonlyArray<unknown>> = Exclude<
  Message,
  { readonly _tag: ClaimedOf<Ps[number]> }
>

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

/**
 * What `config` takes: the fields no placement owns, the parent's own update,
 * Subscriptions, and Managed Resources, plus whatever the runtime takes
 * (Model, container, view, routing, the resources Layer, ...). The index
 * signature carries the passthrough; `init` and `url` are reserved with a
 * message naming `complete` instead.
 */
export interface ConfigInput<Model, Message, Ps extends ReadonlyArray<unknown>, Services> {
  readonly initial: InitialRest<Model, Ps>
  readonly update?: (
    model: Model,
    message: OwnMessage<Message, Ps>,
  ) => Update.Return<Model, Message, Services>
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, any>
  readonly managedResources?: Readonly<
    Record<string, ManagedResource.Entry<Model, Message, any, any, any>>
  >
  readonly init?: Invalid<'config owns init: pass initial rest instead, or use complete for a custom init'>
  readonly url?: Invalid<'config does not derive url yet: use complete with assembly.url for URL-mirror assemblies'>
  readonly [key: string]: unknown
}

type OwnSubscriptionServices<Input, Model, Message> = Input extends {
  readonly subscriptions: Subscription.Subscriptions<Model, Message, infer S>
}
  ? S
  : never

type OwnManagedEntries<Input> = Input extends {
  readonly managedResources: infer Managed
}
  ? Managed extends Readonly<Record<string, infer Entry>>
    ? Entry
    : never
  : never

/**
 * Generic inference keeps the caller's literal (so a placement's field in
 * `initial` slips past the constraint's excess check); this names it at the
 * property. Dissolves to `unknown` for valid input, the way `complete` does.
 */
type InitialKeysCheck<Input, Model, Ps extends ReadonlyArray<unknown>> = Input extends {
  readonly initial: infer Rest
}
  ? Exclude<keyof Rest, keyof InitialRest<Model, Ps>> extends never
    ? unknown
    : {
        readonly initial: Invalid<'initial is exactly the fields no placement owns; a placement field is initialised from its args'>
      }
  : unknown

/**
 * What `config` returns: the passthrough unchanged, with `initial` compiled
 * to `init` and the own update, Subscriptions, and Managed Resources derived
 * through the assembly. The derived fields carry the `complete` brands, so
 * `complete` accepts the result unchanged.
 */
export type ConfigResult<
  Input,
  Model,
  Message,
  Ps extends ReadonlyArray<PlacedIn<Model, Message>>,
  Services,
> = Omit<Input, 'initial' | 'update' | 'subscriptions' | 'managedResources'> & {
  readonly init: () => WiredRecord<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
  readonly update: (
    model: Model,
    message: Message,
  ) => Update.Return<Model, Message, RequirementsOf<Ps[number]> | Services>
  readonly subscriptions: WiredRecord<
    Subscription.Subscriptions<
      Model,
      Message,
      OwnSubscriptionServices<Input, Model, Message> | ServicesOf<Ps[number]>
    >
  >
  readonly managedResources: WiredRecord<
    Readonly<Record<string, ResourceEntriesOf<Ps[number]> | OwnManagedEntries<Input>>>
  >
}

/** `Services` are what the parent's own update may require, as in `Update.Commands<Message, Services>`. */
export interface Assembly<
  Model,
  Message,
  Ps extends ReadonlyArray<PlacedIn<Model, Message>>,
  Services = never,
> {
  readonly placements: Ps
  /**
   * The update of the placement or wiring a Message belongs to; `None` for the
   * parent's own Messages. A shared tag is every sharing wiring's, folded in order.
   */
  readonly route: (
    model: Model,
    message: Message,
  ) => Option.Option<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
  /**
   * The parent's update: a placement's or wiring's Message goes there, and every
   * other Message to `own`, typed without the placements' wrapper variants. A
   * shared tag goes to each wiring sharing it and then to `own` as well. Without
   * `own`, other Messages leave the Model unchanged.
   */
  // Deliberately not generic: a generic call written inline in `complete`'s config
  // stops TypeScript inferring that config, so the parent's services are stated once
  // on `assemble`.
  readonly update: (
    own?: (
      model: Model,
      message: OwnMessage<Message, Ps>,
    ) => Update.Return<Model, Message, Services>,
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
  /**
   * The assembled runtime config for `Runtime.makeApplication` or `makeElement`:
   * `initial` rest becomes `init`, the own `update`, `subscriptions`, and
   * `managedResources` merge with the items', and everything else (Model,
   * container, view, routing, the resources Layer, ...) passes through. URL
   * wiring stays on the lower-level derivations with `complete`: calling this
   * on an assembly that reads the URL is a type error naming them.
   */
  readonly config: [HasUrl<Ps[number]>] extends [never]
    ? <Input extends ConfigInput<Model, Message, Ps, Services>>(
        input: Input & NoInfer<InitialKeysCheck<Input, Model, Ps>>,
      ) => ConfigResult<Input, Model, Message, Ps, Services>
    : Invalid<'config does not derive url yet: use complete with assembly.url for URL-mirror assemblies'>
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
        // A callback with an unannotated parameter written inline in the config keeps
        // TypeScript from inferring the config at all, so it falls back to the
        // constraint and this check fails first, whatever `update` accepts.
        readonly update: Invalid<"update does not accept every placement's Messages; spread each Link.wrapper(...).cases into the parent Message. If it does, annotate the parameters of the callbacks written inline in this config (init's and routing's url): unannotated, they keep TypeScript from inferring it">
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
    // tag would send one's Messages to the other, unless every claimant is a
    // wiring that declares the tag shared and routes only its own values. A
    // placement takes every Message of its wrapper, so it never shares.
    const claims = new Map<string, { readonly owner: string; readonly shares: boolean }>()
    // Wirings in list order, by each tag they share.
    const sharers = new Map<string, Array<AnyWiring>>()
    const claim = (tag: string, owner: string, shares: boolean) => {
      const other = claims.get(tag)
      if (other !== undefined && !(other.shares && shares)) {
        throw new Error(
          `Bundle.assemble: ${other.owner} and ${owner} both handle "${tag}", so its Messages would reach only one. Give each its own wrapper or Message.`,
        )
      }
      claims.set(tag, { owner, shares })
    }
    for (const placed of [...singles, ...collections]) {
      claim(placed.link.messages.join(' > '), placed.key, false)
    }
    for (const wiring of wirings) {
      const shared = new Set(wiring.shared ?? [])
      for (const tag of wiring.handles) claim(tag, wiring.key, shared.has(tag))
      for (const tag of shared) {
        const observers = sharers.get(tag)
        if (observers === undefined) sharers.set(tag, [wiring])
        else observers.push(wiring)
      }
    }

    const resourceUsers = [
      ...singles.map(placed => ({
        key: placed.key,
        resources: placed.resources as ResourceRecord,
      })),
      ...wirings.map(wiring => ({ key: wiring.key, resources: wiring.resources ?? {} })),
    ]
    assertDistinctResources(resourceUsers)

    // A nested placement's Messages travel inside its outer placement's wrapper,
    // which the outer one would take as its own; so the deepest placements are
    // asked first, whatever the list order. Wirings claim tags of their own.
    const byMessageDepth = [
      ...[...singles, ...collections].sort(
        (a, b) => b.link.messages.length - a.link.messages.length,
      ),
      ...wirings,
    ]
    // A shared tag is observed, not claimed: the first claimant must not keep it
    // from the others, so each folds it in turn.
    const shared = (message: Message) =>
      Option.map(Option.fromUndefinedOr(sharers.get(message._tag)), observers =>
        Update.combine(
          observers.map(
            wiring => (model: Model) =>
              Option.getOrElse(wiring.route?.(model, message) ?? Option.none(), () => ({ model })),
          ),
        ),
      )
    // Each item's own types were checked where it was built; the list holds them erased.
    const route = (model: Model, message: Message) =>
      Option.match(shared(message), {
        onSome: fold => Option.some(fold(model)),
        onNone: () => routeClaimed(model, message),
      }) as Option.Option<Update.Return<Model, Message, RequirementsOf<Ps[number]>>>
    const routeClaimed = (model: Model, message: Message) =>
      pipe(
        byMessageDepth,
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

    const updateWith =
      (own?: (model: Model, message: Message) => Update.Return<Model, Message, unknown>) =>
      (model: Model, message: Message) => {
        const rest = (next: Model) => (own === undefined ? { model: next } : own(next, message))
        return Option.match(shared(message), {
          onSome: fold => Update.combine(model, [fold, rest]),
          onNone: () => Option.getOrElse(routeClaimed(model, message), () => rest(model)),
        })
      }
    const initialFrom = (rest: InitialRest<Model, Ps>) => {
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
    }
    const urlFrom = <UrlMessage extends Message>(onUrlChange: (url: Url) => UrlMessage) =>
      brand({
        init: (model: Model, url: Url) =>
          wirings.reduce(
            (next, wiring) => (wiring.onUrl === undefined ? next : wiring.onUrl(next, url)),
            model,
          ),
        onUrlChange,
      })
    const subscriptionsWith = (own?: Subscription.Subscriptions<Model, Message, any>) =>
      brand(
        Subscription.aggregate<Model, Message, any>()(
          ...items.map(item => item.subscriptions ?? {}),
          own ?? {},
        ),
      )
    const resourcesWith = (own?: ResourceRecord) => {
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
    }

    return {
      placements: items,
      route,
      update: updateWith as Assembly<Model, Message, Ps, Services>['update'],
      init,
      initial: initialFrom,
      url: urlFrom,
      subscriptions: subscriptionsWith,
      resources: resourcesWith,
      complete: config => config,
      config: ((
        input: {
          readonly initial: InitialRest<Model, Ps>
          readonly update?: (
            model: Model,
            message: Message,
          ) => Update.Return<Model, Message, unknown>
          readonly subscriptions?: Subscription.Subscriptions<Model, Message, any>
          readonly managedResources?: ResourceRecord
        } & Readonly<Record<string, unknown>>,
      ) => {
        const {
          initial: rest,
          update: own,
          subscriptions: ownSubscriptions,
          managedResources: ownManaged,
          ...passthrough
        } = input
        // `init` and `url` are reserved by the types above; a JavaScript caller
        // can still pass them, and dropping either would silently unwire a
        // placement or a mirror, so refuse instead.
        if ('init' in passthrough || 'url' in passthrough) {
          throw new Error(
            'Bundle.assemble: config owns init and url; pass initial rest (not init), ' +
              'and use complete with assembly.url for URL-mirror assemblies.',
          )
        }
        return {
          ...passthrough,
          init: () => initialFrom(rest),
          update: updateWith(own),
          subscriptions: subscriptionsWith(ownSubscriptions),
          managedResources: resourcesWith(ownManaged),
        }
      }) as Assembly<Model, Message, Ps, Services>['config'],
    }
  }
