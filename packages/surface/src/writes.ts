/**
 * `foldkit-surface/writes`: what each Message is declared to write, joined to
 * what each drawing reads, so a Message draws again only the Surfaces it can
 * have changed.
 *
 * The writes are a `metakit` Machine's: one Transition per Message tag, each
 * naming the Model paths it sets. `Graph.analyze` joins them to a Surface's
 * projection, once, when the view is defined. A subpath, so an application
 * that declares no writes carries no `metakit`.
 */
import { Option, type Schema } from 'effect'
import { createLazy, type Html } from 'foldkit/html'
import type { MessageUnion } from 'foldkit/message'
import { affectedTags, covers, pathsOverlap } from '@doeixd/metakit/graph/match'
import type { Machine } from '@doeixd/metakit/machine'
import {
  Metadata,
  pathsRead,
  Surface,
  type AppScope,
  type DependencyTree,
  type Renderer,
} from './index.js'
import { messageTag, tagOf, type OnlyMessages } from './messageTags.js'
import { registerRootViewHook } from './rootViewRegistry.js'

export {
  WritesCheck,
  type OutsideWrite,
  type OwnerWrite,
  type OwnershipContract,
  type UndeclaredWrite,
  type WriteDiagnostic,
} from './writesCheck.js'

/** A contract (such as a Remote domain or Sync document) whose Messages write its `owns` paths. */
export interface WritesContract {
  readonly messages: ReadonlyArray<string>
  readonly owns: ReadonlyArray<ReadonlyArray<string>>
}

/** Additional writers contributed alongside a Machine to `Writes.of`. */
export interface WritesOptions {
  /**
   * Contracts whose Messages write their owned Model paths (e.g. a Remote
   * domain whose reducer Messages write `['remote']`). Any reader under those
   * paths — including a `Projection.derive` over a Remote read or a plain
   * reference into the store — is reached by those Messages. A Message named
   * here has no transition: `Writes.of` throws for one that has, since its
   * transition already says what it writes.
   */
  readonly contracts?: ReadonlyArray<WritesContract> | undefined
  /** Extra Message-to-paths declarations for Messages outside `machine.transitions`. */
  readonly writers?: Readonly<Record<string, ReadonlyArray<ReadonlyArray<string>>>> | undefined
}

/** What `Writes.of` worked out for one view it keeps the drawing of. */
export interface RegionFacts<Tag extends string> {
  /** The Surface's name. */
  readonly name: string
  /** The Model paths it reads; none when it reads what no path names. */
  readonly reads: Option.Option<DependencyTree>
  /** The declared Messages that draw it again. A Message with no transition always does. */
  readonly redrawnBy: ReadonlyArray<Tag>
}

/** The writes of an application's Messages, as `Writes.of` makes them from a Machine. */
export interface Writes<Root, Message, Tag extends string> {
  /**
   * `Surface.rootView`, with the drawing kept while no Message since it was
   * made is declared to write a path the Surface's projection reads: the
   * projection is not read and Foldkit does not compare the tree. A Message
   * with no transition, a Model `track` did not see made, and a projection
   * that names no path or reads through a planner (a `foldkit-remote` read)
   * all draw again. `render` must read only its Model, and the view, made
   * once at module level, stands at one position of the tree.
   */
  readonly rootView: <Model, ViewMessage, Params>(
    surface: Surface<Root, Model, ViewMessage, Params>,
    params: Params,
    render: Renderer<Model, ViewMessage>,
  ) => ReturnType<typeof Surface.rootView<Root, Model, ViewMessage, Params>>
  /** The Model paths `message`'s transition sets; none for a Message with no transition. */
  readonly declared: (message: Message) => Option.Option<DependencyTree>
  /**
   * The application's `update`, noting which Message made each Model, which is
   * how a view knows what was written since it last drew. Wrap the outermost
   * `update` once: a Model it did not see made draws every view again.
   */
  readonly track: <Return extends { readonly model: Root }>(
    update: (model: Root, message: Message) => Return,
  ) => (model: Root, message: Message) => Return
  /**
   * Installs these writes as the default `Surface.rootView` path-skipper for
   * this application (#587), so every `Surface.rootView` and
   * `SurfaceView.toRenderer` skips unchanged Surfaces without repeating
   * `writes.rootView`. Returns a disposer that restores plain rendering.
   */
  readonly install: () => () => void
  /**
   * An epoch for `reads`, read from the root Model being drawn: it moves on
   * every declared write that overlaps `reads`, on every Message with no
   * transition, and whenever `root` is a Model `track` did not make (a restored
   * checkpoint, hot reload). Pass it as `pathEpoch` to a `foldkit-bundle`
   * placement on the root (#586).
   */
  readonly epochFor: (reads: DependencyTree) => (root: Root) => number
  /** Each view defined with these writes, in the order they were defined. */
  readonly regions: () => ReadonlyArray<RegionFacts<Tag>>
}

/** Set by `foldkit-ssr` while a server renders, where a kept drawing would carry another request's markers. */
const SERVER_RENDER = Symbol.for('foldkit-plus.serverRender')

const of = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Transitions extends Readonly<Record<string, unknown>>,
>(
  app: AppScope<Root, F, Cases>,
  machine: Machine<Root, Transitions> & OnlyMessages<Cases, Transitions>,
  options?: WritesOptions,
): Writes<Root, Schema.Schema.Type<MessageUnion<Cases>>, keyof Transitions & string> => {
  type Tag = keyof Transitions & string
  const messages: Readonly<Record<string, unknown>> = app.Message
  const assertMessageTag = (tag: string): void => {
    if (!Object.hasOwn(messages, tag) || messageTag(messages[tag]) !== tag) {
      throw new Error(
        `Writes.of: the transition "${tag}" is not named by a Message of this application`,
      )
    }
  }
  const merged = new Map<string, Array<ReadonlyArray<string>>>()
  const addWrites = (tag: string, paths: ReadonlyArray<ReadonlyArray<string>>): void => {
    assertMessageTag(tag)
    const existing = merged.get(tag) ?? []
    merged.set(tag, [...existing, ...paths])
  }
  for (const tag of Object.keys(machine.transitions)) {
    const fp = machine.footprints[tag as Tag]
    addWrites(tag, fp?.writes ?? [])
  }
  const transitionTags = new Set(Object.keys(machine.transitions))
  // A transition's writes are exact; a contract's `owns` are its whole slice. Merged, they
  // would widen the footprint to the slice and hide a stray write inside it.
  const addElsewhere = (tag: string, paths: ReadonlyArray<ReadonlyArray<string>>, by: string) => {
    if (transitionTags.has(tag)) {
      throw new Error(
        `Writes.of: "${tag}" has a transition, which declares what it writes, and ${by} declares it too: declare its writes once`,
      )
    }
    addWrites(tag, paths)
  }
  const registeredPaths: Array<ReadonlyArray<string>> = []
  for (const contract of options?.contracts ?? []) {
    for (const tag of contract.messages) addElsewhere(tag, contract.owns, 'a contract')
    registeredPaths.push(...contract.owns)
  }
  for (const [tag, paths] of Object.entries(options?.writers ?? {})) {
    addElsewhere(tag, paths, 'writers')
    registeredPaths.push(...paths)
  }
  const footprints: Record<string, { readonly writes: ReadonlyArray<ReadonlyArray<string>> }> =
    Object.create(null)
  for (const [tag, paths] of merged) footprints[tag] = { writes: paths }

  // Counted up to draw every view again, and each view's own count for a
  // Message declared to write what it reads: a lazy slot keeps a drawing
  // while both are the numbers it drew with.
  let all = 0
  interface Region {
    own: number
  }
  // A tag absent here has no transition, so nothing is known of what it writes.
  const redraws = new Map<string, Array<Region>>([...merged.keys()].map(tag => [tag, []]))
  const facts: Array<RegionFacts<Tag>> = []
  // The Model the counts are true of: the last a tracked update made, or a view drew.
  let current = Option.none<Root>()
  const isCurrent = (model: Root): boolean => Option.isSome(current) && current.value === model
  // A Model drawn with an unknown past draws every view again, and the counts are true of it from here.
  const adopt = (root: Root): void => {
    if (!isCurrent(root)) {
      all++
      current = Option.some(root)
    }
  }

  const writes: Writes<Root, Schema.Schema.Type<MessageUnion<Cases>>, Tag> = {
    declared: message =>
      Option.flatMap(tagOf(message), tag =>
        Object.hasOwn(footprints, tag) ? Option.some(footprints[tag]!.writes) : Option.none(),
      ),

    track: update => (model, message) => {
      const result = update(model, message)
      // A Model no tracked update made (the first, a restored one) has an unknown past.
      if (!isCurrent(model)) all++
      if (result.model !== model) {
        const regions = Option.flatMapNullishOr(tagOf(message), tag => redraws.get(tag))
        if (Option.isNone(regions)) all++
        else for (const region of regions.value) region.own++
      }
      current = Option.some(result.model)
      return result
    },

    rootView: (surface, params, render) => {
      const name = surface.name
      const projection = surface.projection(params)
      // A projection carrying metadata reads through a planner (a Remote read):
      // keep `Option.none()` unless every path it reads is covered by a
      // registered contract/writer (otherwise an unregistered planner would be
      // skipped stalely when another unrelated contract is registered).
      const candidate = pathsRead(projection)
      const coveredByRegistered =
        Option.isSome(candidate) &&
        candidate.value.length > 0 &&
        candidate.value.every(readPath =>
          registeredPaths.some(regPath => covers(regPath, readPath)),
        )
      const reads =
        Metadata.summarize(projection.metadata).length > 0 && !coveredByRegistered
          ? Option.none()
          : candidate
      // A read that names no path (`Option.none()`) is conservatively affected
      // by every transition that writes at least one path.
      const redrawnBy = affectedTags(
        footprints as Readonly<
          Record<Tag, { readonly writes: ReadonlyArray<ReadonlyArray<string>> }>
        >,
        reads,
      )
      const region: Region = { own: 0 }
      for (const tag of redrawnBy) redraws.get(tag)?.push(region)
      facts.push({ name, reads, redrawnBy })

      const lazy = createLazy()
      // How many kept drawings have started on this region (instance-scoped,
      // never module-scoped, so concurrent instances or server renders stay
      // isolated). Foldkit's lazy slot throws before calling `counted` when
      // there is no runtime frame; a throw with `started` unchanged is that.
      let started = 0
      // The slot compares its arguments, and the Model is new on every Message.
      let latest: Root
      // The builder is the application's, which the type `Surface.rootView`
      // gives the view checks at each call: here it is only handed on.
      const drawn = (root: Root, h: unknown): Html => render(projection.read(root), h as never)
      const counted = (_all: number, _own: number, h: unknown): Html => {
        started++
        return drawn(latest, h)
      }
      return (root: Root, h: unknown): Html => {
        if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return drawn(root, h)
        adopt(root)
        latest = root
        const before = started
        try {
          return lazy(counted, [all, region.own, h])
        } catch (error) {
          if (started !== before) throw error
          return drawn(root, h)
        }
      }
    },

    install: () =>
      registerRootViewHook(
        app.owner,
        writes.rootView as (
          surface: unknown,
          params: unknown,
          render: unknown,
        ) => (root: unknown, h: unknown) => Html,
      ),

    epochFor: reads => {
      const redrawnBy = affectedTags(
        footprints as Readonly<
          Record<Tag, { readonly writes: ReadonlyArray<ReadonlyArray<string>> }>
        >,
        reads.length === 0 ? Option.none() : Option.some(reads),
      )
      const region: Region = { own: 0 }
      for (const tag of redrawnBy) redraws.get(tag)?.push(region)
      return root => {
        adopt(root)
        return all + region.own
      }
    },

    regions: () => facts,
  }
  return writes
}

export const Writes = {
  /**
   * The writes of an application's Messages, from a `metakit` Machine over its
   * Model whose transitions are named by Message tags. Make each view with
   * its `rootView`, and wrap `update` with its `track`.
   *
   * @example
   * ```ts
   * const writes = Writes.of(App, Machine.make({ state: Model, transitions: { Renamed, Counted } }))
   * const header = writes.rootView(Header, undefined, drawHeader)
   * const update = writes.track(appUpdate)
   * ```
   */
  of,
}
