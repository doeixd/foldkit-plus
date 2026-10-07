/**
 * A placement: a bundle's parts lifted into one parent through one Link. Every
 * part is built from the Foldkit lift that exists for it, so a placement adds
 * no store, reducer, or render path.
 */
import { Option, Record, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as ManagedResource from 'foldkit/managedResource'
import type * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import type { AnyMessage, Link } from './link.js'
import type { BundleSpec, Helper, ResourceEntries } from './bundle.js'

const PlacedTypeId: unique symbol = Symbol.for('foldkit-bundle/Placed')

/**
 * Checks args against the bundle's args Schema, naming where they were given,
 * and returns their encoded form as text for Module, or `undefined` without a Schema.
 */
export const checkArgs = (
  bundle: { readonly args?: Schema.Codec<any, unknown> },
  args: unknown,
  where: string,
): string | undefined => {
  if (bundle.args === undefined) return undefined
  try {
    Schema.asserts(bundle.args, args)
  } catch (error) {
    throw new Error(`${where}: args do not match the bundle's args Schema. ${String(error)}`)
  }
  try {
    return JSON.stringify(Schema.encodeSync(bundle.args)(args))
  } catch (error) {
    throw new Error(
      `${where}: args match the args Schema but could not be encoded as JSON for Module. ${String(error)}`,
    )
  }
}

/**
 * Args for a placement: a static value, or a factory deriving them from the
 * parent seed — the fields `assembly.initial(rest)` was given, before any
 * placement initialised. A factory runs once per initialization and its result
 * is retained for the placement's `init`, `update`, helpers, Subscriptions,
 * and resources; it never re-runs against changing parent state, so keep it
 * pure of its seed.
 *
 * When no initialization ran — a hand-built Model in a test, which never went
 * through `initial` — `update` derives from the given parent per use, without
 * retaining, so each Model is folded with its own seed.
 *
 * Read only seed fields (route, auth, workspace, ...), never sibling
 * placement fields: every factory sees the same base seed, so a sibling read
 * is consistently absent rather than order-dependent.
 */
export type ArgsSource<Seed, Args> = Args | ((seed: Seed) => Args)

/** Whether a placement's `args` is a seed factory rather than a static value. */
export const isArgsFactory = <Seed, Args>(
  args: ArgsSource<Seed, Args> | undefined,
): args is (seed: Seed) => Args => typeof args === 'function'

/**
 * The seed for a standalone fallback (`placed.init` or collection `add`
 * called without an assembly): the parent without the placement's own
 * top-level field, matching what the factory's type omits. Longer paths name
 * no top-level field of their own, so the parent passes through.
 */
export const seedWithoutOwn = (path: ReadonlyArray<string>, parent: unknown): unknown => {
  if (path.length !== 1) return parent
  const seed = { ...(parent as Record<string, unknown>) }
  delete seed[path[0]!]
  return seed
}

/**
 * Whether two seeds hold the same top-level fields. A factory runs once per
 * seed it has seen: repeat initializations over equal seeds reuse the
 * retained args instead of running again, so one `config`/`runtime` flow
 * derives once for its records and once is enough for its `init`.
 */
export const seedsEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const left = a as Readonly<Record<string, unknown>>
  const right = b as Readonly<Record<string, unknown>>
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length && keys.every(key => Object.is(left[key], right[key]))
  )
}

/** Thrown when a seed factory's args are read before any initialization derived them. */
export class UnresolvedArgsError extends Error {
  constructor(key: string, usage: string) {
    super(
      `${key}: args is a function of the parent seed, which no initialization has derived yet. ` +
        `Run assembly.initial(rest) first, or use assembly.runtime(), so the seed exists before ${usage}.`,
    )
    this.name = 'UnresolvedArgsError'
  }
}

/**
 * A child write that returns the parent itself when `update` returned the child
 * it read. Foldkit renders only when the root Model changes identity, so a
 * no-op in the child must not copy every Model above it.
 */
export const writeIfChanged =
  <Parent, Child>(
    read: (parent: Parent) => Option.Option<Child>,
    write: (parent: Parent, child: Child) => Parent,
  ) =>
  (parent: Parent, child: Child): Parent =>
    Option.exists(read(parent), current => current === child) ? parent : write(parent, child)

export interface PlaceConfig<
  Args,
  Parent,
  LinkMessage,
  Message,
  OutMessage,
  OutStepMessage,
  R2,
  ParentSeed = Parent,
> {
  /**
   * The bundle's args: a static value, or a factory from the parent seed (the
   * fields `assembly.initial(rest)` was given, minus this placement's own
   * field). A factory is computed once per initialization and retained for
   * `init`, `update`, and helpers. Subscriptions and resources built from it
   * require `initial`/`config` to have run first; a bundle with neither
   * contributes empty records either way.
   */
  readonly args?: ArgsSource<ParentSeed, Args>
  /** Handles the child's OutMessage in parent terms, with the child already written back. */
  readonly onOut?: (
    outMessage: OutMessage,
    context: Update.FoldContext<Message, LinkMessage>,
  ) => Update.Step<NoInfer<Parent>, OutStepMessage, R2>
  /**
   * Observes each of the child's Messages in parent terms, after the child has
   * handled it and its `onOut` has run, so the parent's own update needs no arm
   * for the wrapper. Helpers are not Messages and do not reach it.
   */
  readonly onMessage?: (message: Message) => Update.Step<NoInfer<Parent>, OutStepMessage, R2>
  /** Prefix for the placement's Subscription and resource keys. Defaults to `Name@path`. */
  readonly key?: string
  /** A gate beside the Link's own: Subscriptions and resources run only while both hold. */
  readonly when?: (parent: Parent) => boolean
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
        infer OnAcquired extends (...args: ReadonlyArray<any>) => any
      >
        ? // `onAcquired`'s parameters are kept, as `ManagedResource.lift` keeps them, so a
          // handler that reads no value asks for none in `Scene.ManagedResource.acquire`.
          ManagedResource.Entry<
            Parent,
            ParentMessage,
            Requirements,
            Value,
            Service,
            (...args: Parameters<OnAcquired>) => ParentMessage
          >
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
  Field extends string = string,
  Claimed extends string = string,
> {
  readonly [PlacedTypeId]: typeof PlacedTypeId
  /** Types only: the top-level Model field this placement owns, or `string` when unknown. */
  readonly field?: Field
  /** Types only: the parent Message tag this placement routes, or `string` when unknown. */
  readonly claims?: Claimed
  readonly name: Name
  /** `Name@path`, or the configured `key`: the prefix of every Subscription and resource key. */
  readonly key: string
  /** The encoded args as text, when the bundle has an args Schema. */
  readonly argsSummary: string | undefined
  /** Whether `args` was given as a seed factory; resolved once per initialization. */
  readonly hasDynamicArgs: boolean
  /**
   * Derives the factory's args from `seed`, validates them against the
   * bundle's args Schema, and retains them for `init`, `update`, helpers,
   * Subscriptions, and resources. A no-op for static args. The assembly calls
   * this with the base seed before running inits, so every factory sees the
   * same parent state whatever the placement order.
   */
  readonly resolveArgs: (seed: unknown) => void
  /**
   * Assembly use: marks the placement skipped because `rest` provides its
   * top-level field, so its factory never runs and its records contribute
   * nothing while the child is absent. Cleared by the next `resolveArgs`.
   */
  readonly skipArgs: () => void
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

/**
 * What a placement's view needs of a builder: `submodel`, and `OnClick` to
 * read its Message from. A wrapper of Foldkit's builder that keeps both, such
 * as `foldkit-ssr`'s resumable builder, is one.
 */
export type BuilderLike = Pick<HtmlBuilder<any>, 'submodel' | 'OnClick'>

export type PlacedView<Parent, ParentMessage, ViewInputs> = [ViewInputs] extends [void]
  ? <H extends BuilderLike>(parent: Parent, h: ViewBuilder<H, ParentMessage>) => Html
  : <H extends BuilderLike>(
      parent: Parent,
      h: ViewBuilder<H, ParentMessage>,
      viewInputs: ViewInputs,
    ) => Html

/** A readable type error: intersected onto a parameter, its message names the fix. */
export interface Invalid<Message extends string> {
  readonly invalid: Message
}

type BuilderMessage<H> = H extends { readonly OnClick: (message: infer M, ...rest: any) => any }
  ? M
  : never

/**
 * The parent's `h`, checked to accept this placement's Messages. Generic over the
 * whole builder rather than its Message: inferring a Message through
 * `HtmlBuilder` costs thousands of type instantiations per call, while the
 * builder infers as itself and its Message is extracted once per builder type.
 */
export type ViewBuilder<H, ParentMessage> = H &
  ([ParentMessage] extends [BuilderMessage<H>]
    ? unknown
    : Invalid<"The parent Message does not include this placement's wrapper variant; spread its Link.wrapper(...).cases into defineMessageUnion">)

export type AnyPlaced = Placed<string, any, any, any, any, any, any, any, any, any>

export const isPlaced = (value: unknown): value is AnyPlaced =>
  typeof value === 'object' && value !== null && PlacedTypeId in value

const prefixKeys = <A>(prefix: string, record: Readonly<Record<string, A>>): Record<string, A> =>
  Record.mapKeys(record, key => `${prefix}/${key}`)

/** The tag of a Link's parent variant, or `string` when it cannot be read. */
export type TagOf<LinkMessage> = LinkMessage extends { readonly _tag: infer Tag extends string }
  ? Tag
  : string

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
  Field extends string,
  OutStepMessage,
  R2,
>(
  bundle: BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  link: Link<Parent, LinkMessage, Model, Message, Field>,
  config?: PlaceConfig<
    Args,
    Parent,
    LinkMessage,
    Message,
    OutMessage,
    OutStepMessage,
    R2,
    string extends Field ? Parent : Omit<Parent, Field>
  >,
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
  Helpers,
  Field,
  TagOf<LinkMessage>
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
  const rawArgs = config.args
  const factory = isArgsFactory(rawArgs)
  const key = config.key ?? `${bundle.name}@${link.path.join('.')}`
  // Static args are checked where the placement is made; a factory's result is
  // checked where it is derived, in `resolveFrom`, naming the placement.
  let summary = factory ? undefined : (checkArgs(bundle, rawArgs, key) ?? bundle.preset)
  let resolved: unknown
  let hasResolved = false
  // Set when `rest` provides this placement's top-level field: its `init` is
  // skipped, so no derivation runs, and its records contribute nothing while
  // the child is absent.
  let skipped = false
  // The seed the retained args were derived from. An equal seed reuses them.
  let lastSeed: unknown
  const onOut = config.onOut ?? ((): ErasedStep => parent => ({ model: parent }))

  const foldStep = (
    run: (model: any) => Update.ReturnWithOutMessage<any, any, any, any>,
  ): ErasedStep =>
    Update.foldChildStep({
      update: run,
      read: link.read,
      write: writeIfChanged(link.read, link.write),
      toParentMessage: link.toParentMessage,
      foldOutMessage: onOut,
    })

  const isOpen = (parent: unknown): boolean =>
    Option.isSome(link.read(parent)) &&
    Option.match(link.when, { onNone: () => true, onSome: when => when(parent) }) &&
    (config.when === undefined || config.when(parent))

  const buildSubscriptions = (args: unknown) =>
    bundle.subscriptions
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

  const buildResources = (args: unknown) =>
    bundle.resources
      ? prefixKeys(
          key,
          ManagedResource.lift(bundle.resources(args))({
            toChildModel: parent => (isOpen(parent) ? link.read(parent) : Option.none()),
            toParentMessage: link.toParentMessage,
          }),
        )
      : {}

  let subsRecord: Subscription.Subscriptions<any, any, any> = factory
    ? {}
    : buildSubscriptions(rawArgs)
  let resRecord = factory ? {} : buildResources(rawArgs)
  // Records only need the derived args when the bundle defines them; a bundle
  // with no Subscriptions or resources contributes nothing either way.
  const needsSubsArgs = bundle.subscriptions !== undefined
  const needsResArgs = bundle.resources !== undefined

  const needArgs = (): unknown => {
    if (!factory) return rawArgs
    if (!hasResolved) {
      throw new UnresolvedArgsError(key, 'update, helpers, Subscriptions, or resources read it')
    }
    return resolved
  }

  const resolveFrom = (seed: unknown): void => {
    if (!factory) return
    // An equal seed reuses the retained args. Resolving still clears a skip,
    // so the flag always means "skipped since the last resolution".
    if (hasResolved && seedsEqual(seed, lastSeed)) {
      skipped = false
      return
    }
    const derived = derive(seed)
    summary = derived.summary
    resolved = derived.value
    hasResolved = true
    lastSeed = seed
    skipped = false
    subsRecord = buildSubscriptions(resolved)
    resRecord = buildResources(resolved)
  }

  /** Runs the factory against `seed` and checks the result, without retaining. */
  const derive = (
    seed: unknown,
  ): { readonly value: unknown; readonly summary: string | undefined } => {
    const value = (rawArgs as (seed: unknown) => unknown)(seed)
    return { value, summary: checkArgs(bundle, value, key) ?? bundle.preset }
  }

  const skipArgs = (): void => {
    skipped = true
  }

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
    get argsSummary() {
      return summary
    },
    hasDynamicArgs: factory,
    resolveArgs: resolveFrom,
    skipArgs,
    link,
    init: (parent: unknown) => {
      // The assembly pre-resolves every factory from the base seed, so this
      // uses the retained value; placed alone, the parent minus this
      // placement's own field is the seed.
      const args =
        factory && !hasResolved
          ? (resolveFrom(seedWithoutOwn(link.path, parent)), resolved)
          : needArgs()
      const lifted = Update.foldChildInit(bundle.init(args), {
        toParentModel: child => link.write(parent, child),
        toParentMessage: link.toParentMessage,
      })
      // A nested child under an absent outer child has nowhere to live, so its
      // startup Commands would run for nothing and their Messages reach nothing.
      if (Option.isNone(link.read(lifted.model))) return { model: parent }
      return lifted
    },
    update: (parent: unknown, message: AnyMessage) =>
      Option.map(link.fromParentMessage(message), childMessage => {
        // A Message for a child that was never initialised (an optional child
        // `rest` started as `None`) leaves the parent as it is.
        if (factory && !hasResolved && Option.isNone(link.read(parent))) return { model: parent }
        // Past initialization the retained value runs; a Model no
        // initialization produced derives from the given parent per use.
        const args =
          factory && !hasResolved ? derive(seedWithoutOwn(link.path, parent)).value : needArgs()
        const fold = foldStep(model => bundle.update(model, childMessage, args))
        return config.onMessage === undefined
          ? fold(parent)
          : Update.combine(parent, [fold, config.onMessage(childMessage)])
      }),
    get subscriptions() {
      // A skipped placement (its field came with `rest`) contributes no
      // Subscriptions while its child is absent.
      if (factory && !hasResolved && needsSubsArgs && !skipped) needArgs()
      return subsRecord
    },
    get resources() {
      if (factory && !hasResolved && needsResArgs && !skipped) needArgs()
      return resRecord
    },
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

/**
 * What an address asks of a child that has no Model yet, once it does:
 * `follow` wraps an update result and, while a pending ask waits and its
 * owner is ready, sends the ask through the owner's own Messages and lets it
 * go. Holding, readiness, and translation are the application's; fetching
 * the child, wrapping, folding, and merging Commands is this.
 *
 * ```ts
 * const update = (model, message) => follow(baseUpdate(model, message))
 *
 * const follow = Bundle.follow(EditorPage.placed, {
 *   // The ask, held in the Model until its owner can answer it.
 *   pending: model => model.linked,
 *   // Letting go, so the address follows the owner again.
 *   release: model => ({ ...model, linked: Option.none() }),
 *   // The owner is ready: loaded, not loading.
 *   ready: editor => editor.status !== 'Loading',
 *   // The ask in the owner's own Messages.
 *   toMessages: (ask, editor) => [
 *     EditorMessage.Selected({ id: ask.block }),
 *     ...(ask.panel === undefined
 *       ? []
 *       : [EditorMessage.PanelChosen({ panel: ask.panel })]),
 *   ],
 * })
 * ```
 *
 * Nothing happens without a pending ask, without the child, or before it is
 * ready — each returns the result untouched, pending kept. An ask that
 * translates to no Messages is still let go: it was considered, not lost.
 */
export const follow = <Parent, ParentMessage extends AnyMessage, Child, ChildMessage, R, Ask>(
  placed: Placed<string, Parent, ParentMessage, Child, ChildMessage, R, any, any, any, any, any>,
  config: {
    /** The ask waiting in the Model, if any. */
    readonly pending: (model: Parent) => Option.Option<Ask>
    /** The Model with the ask let go. */
    readonly release: (model: Parent) => Parent
    /** Whether the child can answer yet. */
    readonly ready: (child: Child) => boolean
    /** The ask in the child's own Messages. */
    readonly toMessages: (ask: Ask, child: Child) => ReadonlyArray<ChildMessage>
  },
): ((
  result: Update.Return<Parent, ParentMessage, R>,
) => Update.Return<Parent, ParentMessage, R>) => {
  const send = (model: Parent, message: ChildMessage) =>
    placed.update(model, placed.link.toParentMessage(message))
  return result => {
    const ask = config.pending(result.model)
    if (Option.isNone(ask)) return result
    const child = placed.link.read(result.model)
    if (Option.isNone(child)) return result
    if (!config.ready(child.value)) return result
    const released: Update.Return<Parent, ParentMessage, R> = {
      ...result,
      model: config.release(result.model),
    }
    return config.toMessages(ask.value, child.value).reduce((done, message) => {
      const next = send(done.model, message)
      if (Option.isNone(next)) return done
      return {
        ...next.value,
        commands: [...(done.commands ?? []), ...(next.value.commands ?? [])],
      }
    }, released)
  }
}
