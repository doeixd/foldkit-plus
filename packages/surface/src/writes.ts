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
import { affectedTags } from 'metakit/graph/match'
import type { Machine } from 'metakit/machine'
import {
  Metadata,
  pathsRead,
  Surface,
  type AppScope,
  type DependencyTree,
  type Invalid,
  type Renderer,
} from './index.js'
import { messageTag, tagOf } from './messageTags.js'

export {
  WritesCheck,
  type OutsideWrite,
  type UndeclaredWrite,
  type WriteDiagnostic,
} from './writesCheck.js'

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
  /** Each view defined with these writes, in the order they were defined. */
  readonly regions: () => ReadonlyArray<RegionFacts<Tag>>
}

type OnlyMessages<Cases, Transitions> = [Exclude<keyof Transitions, keyof Cases>] extends [never]
  ? unknown
  : Invalid<"Writes.of: a transition is named by one of the application's Message tags">

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
): Writes<Root, Schema.Schema.Type<MessageUnion<Cases>>, keyof Transitions & string> => {
  type Tag = keyof Transitions & string
  const tags = Object.keys(machine.transitions) as Array<Tag>
  const messages: Readonly<Record<string, unknown>> = app.Message
  for (const tag of tags) {
    if (!Object.hasOwn(messages, tag) || messageTag(messages[tag]) !== tag) {
      throw new Error(
        `Writes.of: the transition "${tag}" is not named by a Message of this application`,
      )
    }
  }

  // Counted up to draw every view again, and each view's own count for a
  // Message declared to write what it reads: a lazy slot keeps a drawing
  // while both are the numbers it drew with.
  let all = 0
  interface Region {
    own: number
  }
  // A tag absent here has no transition, so nothing is known of what it writes.
  const redraws = new Map<string, Array<Region>>(tags.map(tag => [tag, []]))
  const facts: Array<RegionFacts<Tag>> = []
  // The Model the counts are true of: the last a tracked update made, or a view drew.
  let current = Option.none<Root>()
  const isCurrent = (model: Root): boolean => Option.isSome(current) && current.value === model

  const writes: Writes<Root, Schema.Schema.Type<MessageUnion<Cases>>, Tag> = {
    declared: message =>
      Option.flatMap(tagOf(message), tag =>
        Object.hasOwn(machine.footprints, tag)
          ? Option.some(machine.footprints[tag as Tag].writes)
          : Option.none(),
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
      const draw = Surface.rootView(surface, params, render)
      const name = surface.name
      const projection = surface.projection(params)
      // A projection carrying metadata reads through a planner (a Remote read):
      // what it shows also moves with Messages no transition is written for, so
      // its paths decide nothing and every Message that writes draws it again.
      const reads =
        Metadata.summarize(projection.metadata).length > 0 ? Option.none() : pathsRead(projection)
      // A read that names no path (`Option.none()`) is conservatively affected
      // by every transition that writes at least one path.
      const redrawnBy = affectedTags(
        machine.footprints as Readonly<
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
      const drawn = (root: Root, h: unknown): Html => draw(root, h as never)
      const counted = (_all: number, _own: number, h: unknown): Html => {
        started++
        return drawn(latest, h)
      }
      return (root: Root, h: unknown): Html => {
        if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return drawn(root, h)
        // A Model with an unknown past: drawn, and the counts are true of it from here.
        if (!isCurrent(root)) {
          all++
          current = Option.some(root)
        }
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
