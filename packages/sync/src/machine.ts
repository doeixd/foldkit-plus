/**
 * Extracts the durable subset of an application's `metakit` `Machine` for
 * `Sync.forApplication(App).make({ transitions })`. Kept in its own module so
 * a browser page calling `fromMachine` carries zero `metakit` Abstract/Zone
 * checker code.
 */
import { Option, Predicate, Result } from 'effect'
import { Path, Transition } from '@doeixd/metakit'
import type { InputOf, Machine } from '@doeixd/metakit/machine'
import { messageTag, tagOf, type DeclaredTransition } from './make.js'

type AnyTransition<Root> = Transition.Transition<Root, unknown, unknown, unknown>

const isTransition = <Root>(value: unknown): value is AnyTransition<Root> =>
  Predicate.isTagged(value, 'Transition')

/** Whether a transition's `supplied` Schema names at least one value, which a replay would have to be given. */
const declaresSupplied = (transition: {
  readonly suppliedSchema: Option.Option<unknown>
}): boolean =>
  Option.match(transition.suppliedSchema, {
    onNone: () => false,
    onSome: schema =>
      Predicate.hasProperty(schema, 'fields') &&
      Predicate.isObject(schema.fields) &&
      Object.keys(schema.fields).length > 0,
  })

/**
 * Extracts the durable subset of an application's `metakit` `Machine` for
 * `Sync.forApplication(App).make({ transitions })`, throwing at definition for
 * a tag whose transition:
 *
 * - is not a transition of the Machine;
 * - emits a Command (durable transitions are state-only);
 * - declares supplied values (a replay passes none, so every replay would be refused);
 * - has a read it does not bound (an opaque term may read outside the shared slice);
 * - reads or writes a path that is not inside the shared slice (the shared
 *   slice's path must be a prefix of it, so a write to a parent of the slice
 *   is refused).
 *
 * It does not check the document's laws, or for an unreachable guard: a replay
 * runs on the shared slice over `initial`, as `forApplication` does. Use
 * `SyncDeclared.transition` for those checks.
 */
export const fromMachine = <
  Root,
  Shared,
  Transitions extends Readonly<Record<string, unknown>>,
  const Tags extends ReadonlyArray<keyof Transitions & string>,
>(
  machine: Machine<Root, Transitions>,
  tags: Tags,
  shared: {
    readonly dependencies: ReadonlyArray<ReadonlyArray<string>>
    readonly get: (root: Root) => Shared
    readonly set: (root: Root, shared: Shared) => Root
  },
  /** The Model the shared slice is written into to run a replay: the application's `initial`. */
  initial: Root,
): { readonly [K in Tags[number]]: DeclaredTransition<Shared, InputOf<Transitions[K]>> } => {
  const result: Record<string, DeclaredTransition<Shared, unknown>> = Object.create(null)
  const withinShared = (path: ReadonlyArray<string>): boolean =>
    shared.dependencies.some(owned => Path.isPrefix(owned, path))

  for (const tag of tags) {
    const declared = Object.hasOwn(machine.transitions, tag) ? machine.transitions[tag] : undefined
    if (!isTransition<Root>(declared)) {
      throw new Error(`SyncDeclared.fromMachine: "${tag}" is not a transition of this Machine`)
    }
    if (declared.emits.length > 0) {
      throw new Error(
        `SyncDeclared.fromMachine: "${tag}" emits a Command; durable transitions are state-only`,
      )
    }
    if (declaresSupplied(declared)) {
      throw new Error(
        `SyncDeclared.fromMachine: "${tag}" declares supplied values, and a replay passes none`,
      )
    }
    const footprint = Transition.footprint(declared)
    for (const writePath of footprint.writes) {
      if (!withinShared(writePath)) {
        throw new Error(
          `SyncDeclared.fromMachine: durable "${tag}" writes "${writePath.join('.')}", outside the shared slice`,
        )
      }
    }
    if (Option.isNone(footprint.stateReads)) {
      throw new Error(
        `SyncDeclared.fromMachine: durable "${tag}" has reads it does not bound, which may be outside the shared slice`,
      )
    }
    for (const statePath of footprint.stateReads.value) {
      if (!withinShared(statePath)) {
        throw new Error(
          `SyncDeclared.fromMachine: durable "${tag}" reads "${statePath.join('.')}", outside the shared slice`,
        )
      }
    }
    // `Transition.run` over the whole Model: only the shared slice differs from `initial`.
    const replay = (sharedValue: Shared, message: unknown): Shared => {
      const root = shared.set(initial, sharedValue)
      const outcome = Transition.run(declared, root, message)
      if (Result.isFailure(outcome)) throw new Error(outcome.failure.reason)
      // A no-op keeps the slice it was given, so `live` keeps the Model's identity.
      return outcome.success === root ? sharedValue : shared.get(outcome.success)
    }
    result[tag] = {
      bind: ({ tag: boundTag, constructors, projection, next }) => {
        const input = constructors.find(constructor => messageTag(constructor) === boundTag)
        if (input === undefined)
          throw new Error(`Sync.make: "${boundTag}" is not a recorded Message`)
        const own = (message: unknown): boolean =>
          Option.exists(tagOf(message), named => named === boundTag)
        return {
          replay: (value, message) =>
            own(message) ? replay(value, message) : next.replay(value, message),
          live: (model, message) => {
            if (!own(message)) return next.live(model, message)
            const before = projection.get(model)
            try {
              const after = replay(before, message)
              return Option.some(after === before ? model : projection.set(model, after))
            } catch {
              return Option.some(model)
            }
          },
          footprints: { ...next.footprints, [boundTag]: footprint },
        }
      },
    }
  }
  // The keys are the `tags` just declared and each value is a declaration for the Message its
  // transition takes, which the `_message` phantom cannot say for a loop's `string` key.
  return result as {
    readonly [K in Tags[number]]: DeclaredTransition<Shared, InputOf<Transitions[K]>>
  }
}
