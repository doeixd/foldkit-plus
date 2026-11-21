/**
 * The development check behind `Writes`: a view kept on declared writes shows
 * a stale drawing when a Message writes more than it declares, with nothing
 * said. `WritesCheck.verify` compares what `update` changed with what was
 * declared, on every Message. A module of its own, so a build that reaches it
 * only where `import.meta.env.DEV` holds carries none of it.
 */
import { Effect, Equal, Option } from 'effect'
import { pathsOverlap } from 'metakit/graph/match'
import { movedOutside, type ClosedSurfaces } from './closure.js'
import { Diagnostics, type Diagnostic } from './diagnostics.js'
import type { DependencyTree } from './index.js'
import { tagOf } from './messageTags.js'
import { isPrefix, pathText } from './text.js'

const source = 'foldkit-surface'

/** A Message changed Model paths its transition does not declare it writes. */
export interface UndeclaredWrite extends Diagnostic {
  readonly _tag: 'UndeclaredWrite'
  /** The Message's tag. */
  readonly tag: string
  /** The paths that changed and that no declared write is, or holds. */
  readonly paths: DependencyTree
  /** What the transition declares. */
  readonly declared: DependencyTree
}

/** A Message outside a closed Surface's `messages` changed what the Surface projects. */
export interface OutsideWrite extends Diagnostic {
  readonly _tag: 'OutsideWrite'
  /** The Message's tag. */
  readonly tag: string
  readonly surface: string
}

/** A contract (such as a Sync document or Remote store) that owns Model paths. */
export interface OwnershipContract {
  readonly kind: string
  readonly name: string
  readonly owns: DependencyTree
  readonly messages: ReadonlyArray<string>
}

/** A Message outside an owning contract's `messages` changed a Model path the contract owns. */
export interface OwnerWrite extends Diagnostic {
  readonly _tag: 'OwnerWrite'
  readonly tag: string
  /** The owning contract (`kind:name`, e.g. `sync:todos`). */
  readonly owner: string
  /** The owned paths that changed. */
  readonly paths: DependencyTree
}

/** Every diagnostic `WritesCheck.verify` reports. */
export type WriteDiagnostic = UndeclaredWrite | OutsideWrite | OwnerWrite

const texts = (paths: DependencyTree): string =>
  paths.length === 0 ? 'nothing' : paths.map(pathText).join(', ')

const undeclaredWrite = (
  tag: string,
  paths: DependencyTree,
  declared: DependencyTree,
): UndeclaredWrite => ({
  _tag: 'UndeclaredWrite',
  source,
  level: 'warning',
  message: `"${tag}" changed ${texts(paths)}, and its transition declares it writes ${texts(declared)}. A view kept on the declared writes would show its last drawing: declare the write, or stop making it.`,
  tag,
  paths,
  declared,
})

const outsideWrite = (tag: string, surface: string): OutsideWrite => ({
  _tag: 'OutsideWrite',
  source,
  level: 'warning',
  message: `"${tag}" changed what the closed Surface "${surface}" projects, and is not one of its messages. Add it to the Surface's messages, or move the write to one that is.`,
  tag,
  surface,
})

const ownerWrite = (tag: string, owner: string, paths: DependencyTree): OwnerWrite => ({
  _tag: 'OwnerWrite',
  source,
  level: 'warning',
  message: `"${tag}" changed ${texts(paths)}, which "${owner}" owns, and is not one of its messages. Move the write to a message "${owner}" declares, or add "${tag}" to it.`,
  tag,
  owner,
  paths,
})

const structOrArray = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return true
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// A key may be a stored id, so only the value's own keys count.
const own = (value: Readonly<Record<string, unknown>>, key: string): unknown =>
  Object.hasOwn(value, key) ? value[key] : undefined

/**
 * Adds to `found` each path that changed from `before` to `after` outside
 * every declared write. A struct is a new object whenever one of its fields
 * is written, so its fields decide; a rebuilt value equal to the last is no
 * change.
 */
const collect = (
  before: unknown,
  after: unknown,
  declared: DependencyTree,
  path: ReadonlyArray<string>,
  found: Array<ReadonlyArray<string>>,
): void => {
  if (Object.is(before, after) || declared.some(write => isPrefix(write, path))) return
  const walk =
    structOrArray(before) &&
    structOrArray(after) &&
    (Array.isArray(before)
      ? Array.isArray(after) && before.length === after.length
      : !Array.isArray(after))
  if (walk) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      collect(own(before, key), own(after, key), declared, [...path, key], found)
    }
  } else if (!Equal.equals(before, after)) {
    found.push(path)
  }
}

const fail = (diagnostic: WriteDiagnostic): never => {
  throw new Error(`[${diagnostic.source}] ${diagnostic.message}`)
}

const warn = (diagnostic: WriteDiagnostic): void => {
  Effect.runFork(Diagnostics.report(diagnostic))
}

const verify = <Root, Message, Return extends { readonly model: Root }>(
  writes: { readonly declared: (message: Message) => Option.Option<DependencyTree> },
  update: (model: Root, message: Message) => Return,
  options: {
    /** Surfaces of the application; those declared `closed: true` are checked. */
    readonly surfaces?: ClosedSurfaces<Root>
    /**
     * Owning contracts (such as Sync documents or Remote stores): a Message
     * outside a contract's `messages` that changes a path under `owns` is
     * reported as an `OwnerWrite`.
     */
    readonly contracts?: ReadonlyArray<OwnershipContract>
    /** What to do with a finding: `WritesCheck.fail` when left out. */
    readonly report?: (diagnostic: WriteDiagnostic) => void
  } = {},
): ((model: Root, message: Message) => Return) => {
  const outside = movedOutside<Root, Message>(options.surfaces ?? [])
  const owners = (options.contracts ?? [])
    .filter(contract => contract.owns.length > 0)
    .map(contract => ({
      owner: `${contract.kind}:${contract.name}`,
      owns: contract.owns,
      messages: new Set(contract.messages),
    }))
  const report = options.report ?? fail
  return (model, message) => {
    const result = update(model, message)
    if (result.model === model) return result
    const tag = Option.getOrElse(tagOf(message), () => 'an untagged Message')
    const declared = writes.declared(message)
    if (Option.isSome(declared)) {
      const paths: Array<ReadonlyArray<string>> = []
      collect(model, result.model, declared.value, [], paths)
      if (paths.length > 0) report(undeclaredWrite(tag, paths, declared.value))
    }
    for (const { surface } of outside(model, message, result.model)) {
      report(outsideWrite(tag, surface))
    }
    if (owners.length > 0) {
      const foreign = owners.filter(entry => !entry.messages.has(tag))
      if (foreign.length > 0) {
        const changed: Array<ReadonlyArray<string>> = []
        collect(model, result.model, [], [], changed)
        for (const entry of foreign) {
          const violated = changed.filter(path =>
            entry.owns.some(owned => pathsOverlap(path, owned)),
          )
          if (violated.length > 0) report(ownerWrite(tag, entry.owner, violated))
        }
      }
    }
    return result
  }
}

export const WritesCheck = {
  /**
   * `update`, checked after every Message that changes the Model: a path that
   * changed outside the writes its transition declares is an `UndeclaredWrite`,
   * and a closed Surface in `surfaces` changed by a Message outside its
   * `messages` is an `OutsideWrite`. A Message with no transition is checked
   * against the closed Surfaces alone. Each finding goes to `report`.
   *
   * It walks the Model on every Message, so reach it only in development,
   * which also leaves it out of a production build:
   *
   * @example
   * ```ts
   * const update = writes.track(
   *   import.meta.env.DEV ? WritesCheck.verify(writes, appUpdate, { surfaces: [Header] }) : appUpdate,
   * )
   * ```
   */
  verify,
  /** Throws on a finding, so a test that runs the Message fails: what `verify` does by default. */
  fail,
  /** Logs a finding as a warning, through `Diagnostics.report` and its default reporter. */
  warn,
}
