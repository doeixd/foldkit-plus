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
import { Expr, Path } from 'metakit'
import { analyze } from 'metakit/graph'
import type { Machine } from 'metakit/machine'
import {
  pathsRead,
  type AppScope,
  type DeclaredWrites,
  type DependencyTree,
  type Invalid,
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
export interface Writes<Root, Message, Tag extends string> extends DeclaredWrites<Root> {
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

// How many kept drawings have started. Foldkit's lazy slot throws before it
// calls the drawing when there is no runtime frame (a test, a server's first
// pass), so a throw with this unchanged is that; one after is the drawing's.
let started = 0

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

    region: <Builder>(
      name: string,
      projection: { readonly dependencies: DependencyTree },
      draw: (root: Root, h: Builder) => Html,
    ) => {
      const reads = pathsRead(projection)
      // A read that names no path is an opaque term with no declared reads,
      // which `analyze` holds affected by every transition that writes.
      const run = (): void => undefined
      const binding = Option.match(reads, {
        onNone: () => Expr.opaque<Root, void>({ name }, run),
        onSome: paths =>
          Expr.opaque<Root, void>(
            { name, reads: paths.map(path => Path.make<Root, unknown>(path)) },
            run,
          ),
      })
      const { affectedBy } = analyze(machine, { region: binding })
      const redrawnBy = tags.filter(tag => affectedBy[tag].length > 0)
      const region: Region = { own: 0 }
      for (const tag of redrawnBy) redraws.get(tag)?.push(region)
      facts.push({ name, reads, redrawnBy })

      const lazy = createLazy()
      // The slot compares its arguments, and the Model is new on every Message.
      let latest: Root
      const counted = (_all: number, _own: number, h: Builder): Html => {
        started++
        return draw(latest, h)
      }
      return (root: Root, h: Builder): Html => {
        if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return draw(root, h)
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
          return draw(root, h)
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
   * Model whose transitions are named by Message tags. Give it to
   * `Surface.rootView` as `writes`, and wrap `update` with its `track`.
   *
   * @example
   * ```ts
   * const writes = Writes.of(App, Machine.make({ state: Model, transitions: { Renamed, Counted } }))
   * const header = Surface.rootView(Header, undefined, drawHeader, { writes })
   * const update = writes.track(appUpdate)
   * ```
   */
  of,
}
