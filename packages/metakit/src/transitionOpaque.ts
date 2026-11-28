/**
 * `Transition.opaque`: a step that is ordinary code (parsing a URL, decoding
 * stored strings through a Schema), declared by the paths it reads and
 * writes. Each written value is an opaque term over the declared reads, so
 * its footprint is the declared one, every checker answers Unknown for a rule
 * over what it writes, and SQL refuses it.
 */
import { Option, Schema } from 'effect'
import * as Node from './node.js'
import { toNode, wrap, type ExprInput } from './ops/core.js'
import * as Path from './path.js'
import type { Path as PathType, StatePath } from './path.js'
import {
  pathsOf,
  targetOf,
  transitionProto,
  Way,
  type EmitSpec,
  type Emitted,
  type NoSupplied,
  type SuppliedShape,
  type Transition,
  type TransitionEnv,
  type TransitionPaths,
} from './transition.js'

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

/** A path `after` changed from `before` that is neither a declared write nor under one. */
const strayWrite = (
  before: unknown,
  after: unknown,
  declared: ReadonlyArray<ReadonlyArray<string>>,
  at: ReadonlyArray<string> = [],
): Option.Option<ReadonlyArray<string>> => {
  if (Object.is(before, after) || declared.some(target => Path.isPrefix(target, at))) {
    return Option.none()
  }
  if (!isPlainObject(before) || !isPlainObject(after)) return Option.some(at)
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const stray = strayWrite(
      Object.hasOwn(before, key) ? before[key] : undefined,
      Object.hasOwn(after, key) ? after[key] : undefined,
      declared,
      [...at, key],
    )
    if (Option.isSome(stray)) return stray
  }
  return Option.none()
}

/**
 * Declare a step written as code: the paths `reads` and `writes` name are its
 * footprint, and `run` computes the next state from the state, the input and
 * the supplied values. A step is refused where `when` is not true; `run`
 * throws where it changes a path `writes` does not name.
 */
export const opaque = <
  S extends Schema.Top,
  I extends Schema.Top,
  Sup extends SuppliedShape = NoSupplied,
  E = never,
>(config: {
  readonly name: string
  readonly state: S
  readonly input: I
  readonly supplied?: Sup
  readonly when?: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ExprInput<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, boolean | null>
  readonly reads: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ReadonlyArray<PathType<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, unknown>>
  readonly writes: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ReadonlyArray<StatePath<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, unknown>>
  readonly run: (state: S['Type'], input: I['Type'], supplied: Path.EnvOf<Sup>) => S['Type']
  readonly emits?: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ReadonlyArray<Emitted<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, E>>
}): Transition<S['Type'], I['Type'], E, Path.EnvOf<Sup>> => {
  type Env = TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  const env = pathsOf(config.state, config.input, config.supplied ?? ({} as Sup))
  const writePaths = config.writes(env).map(path => ({
    target: targetOf(path, 'opaque'),
    ast: path.ast,
  }))
  const targets = writePaths.map(entry => entry.target)
  if (targets.length === 0) {
    throw new Error(
      `[metakit] Transition.opaque "${config.name}" must declare at least one written path`,
    )
  }
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (Path.isPrefix(targets[i]!, targets[j]!) || Path.isPrefix(targets[j]!, targets[i]!)) {
        throw new Error(
          `[metakit] Transition.opaque "${config.name}" declares overlapping targets "${Path.format(targets[i]!)}" and "${Path.format(targets[j]!)}"`,
        )
      }
    }
  }
  // A written path's value before is read too: partial evaluation runs the
  // body only once the state it rewrites is known.
  const reads = [
    ...config.reads(env).map(path => path.segments),
    ...targets.map(target => ['state', ...target]),
  ]
  // One run per step: each written value reads its part of the same next state.
  const ran = new WeakMap<object, S['Type']>()
  const next = (step: Env): S['Type'] => {
    const known = ran.get(step)
    if (known !== undefined) return known
    const after = config.run(step.state, step.input, step.supplied)
    Option.match(strayWrite(step.state, after, targets), {
      onNone: () => {},
      onSome: stray => {
        throw new Error(
          `[metakit] Transition.opaque "${config.name}" wrote "${Path.format(stray)}", which its writes do not name`,
        )
      },
    })
    ran.set(step, after)
    return after
  }
  return Object.assign(
    Object.create(transitionProto) as Transition<S['Type'], I['Type'], never, Path.EnvOf<Sup>>,
    {
      _tag: 'Transition' as const,
      stateSchema: Option.some(config.state as unknown as Schema.Codec<S['Type']>),
      inputSchema: Option.some(config.input as unknown as Schema.Codec<I['Type']>),
      suppliedSchema: Option.some(
        Schema.Struct(config.supplied ?? {}) as unknown as Schema.Codec<Path.EnvOf<Sup>>,
      ),
      when: wrap<Env, boolean>(
        config.when === undefined ? Node.Lit({ value: true }) : toNode(config.when(env)),
      ),
      writes: writePaths.map(({ target, ast }) => ({
        _tag: 'WriteEquation' as const,
        target,
        value: wrap<Env, unknown>(
          Node.Opaque({
            name: `${config.name}:${Path.format(target)}`,
            reads: Option.some(reads),
            run: step =>
              Option.getOrNull(
                Path.get(Path.make<S['Type'], unknown>(target, ast), next(step as Env)),
              ),
          }),
        ),
        way: Way.set(),
      })),
      emits: (config.emits?.(env) ?? []).map((entry): EmitSpec => ({
        tag: entry.tag,
        fields: entry.fields,
        when: entry.when,
      })),
      ensures: Option.none(),
    },
  )
}
