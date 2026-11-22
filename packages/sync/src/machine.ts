/**
 * Extracts the durable subset of an application's `metakit` `Machine` for
 * `Sync.forApplication(App).make({ transitions })`. Kept in its own module so
 * a browser page calling `fromMachine` carries zero `metakit` Abstract/Zone
 * checker code.
 */
import { Option, Result } from 'effect'
import { Transition } from 'metakit'
import { pathsOverlap } from 'metakit/graph/match'
import type { InputOf, Machine } from 'metakit/machine'
import { messageTag, tagOf, type DeclaredTransition } from './make.js'

/**
 * Extracts the durable subset of an application's `metakit` `Machine` for
 * `Sync.forApplication(App).make({ transitions })`. Each selected transition
 * must be state-only (`emits.length === 0`), and every read and write in its
 * footprint must stay within `shared.dependencies`.
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
  },
): { readonly [K in Tags[number]]: DeclaredTransition<Shared, InputOf<Transitions[K]>> } => {
  const result: Record<string, DeclaredTransition<Shared, unknown>> = Object.create(null)
  const sharedPaths = shared.dependencies
  const withinShared = (path: ReadonlyArray<string>): boolean =>
    sharedPaths.some(owned => pathsOverlap(owned, path))

  for (const tag of tags) {
    if (!Object.hasOwn(machine.transitions, tag)) {
      throw new Error(`SyncDeclared.fromMachine: "${tag}" is not a transition of this Machine`)
    }
    const declared = machine.transitions[tag] as Transition.Transition<Root, unknown>
    if (declared.emits.length > 0) {
      throw new Error(
        `SyncDeclared.fromMachine: "${tag}" emits a Command; durable transitions are state-only`,
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
    if (Option.isSome(footprint.reads)) {
      for (const readPath of footprint.reads.value) {
        if (readPath[0] !== 'state') continue
        const statePath = readPath.slice(1)
        if (!withinShared(statePath)) {
          throw new Error(
            `SyncDeclared.fromMachine: durable "${tag}" reads "${statePath.join('.')}", outside the shared slice`,
          )
        }
      }
    }
    const replay = (sharedValue: Shared, message: unknown): Shared => {
      const outcome = Transition.run(declared, sharedValue as unknown as Root, message)
      if (Result.isFailure(outcome)) throw new Error(outcome.failure.reason)
      return outcome.success as unknown as Shared
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
  return result as {
    readonly [K in Tags[number]]: DeclaredTransition<Shared, InputOf<Transitions[K]>>
  }
}
