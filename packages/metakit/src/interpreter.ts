/**
 * Effect-native Interpreter service and composable middleware layers
 * (`metakit/interpreter`).
 *
 * Provides `Interpreter` as an Effect `Context.Reference` (defaulting to the
 * in-memory evaluator, mirroring `Solver` in `metakit/prove`), so applications
 * supply foreign operations (`Operation.define`), tracing spans, audit
 * observers, or foreign-op allowlists once via Effect `Layer`s instead of
 * threading `{ foreign }` options through every call site.
 */
import { Clock, Context, Effect, Exit, Layer, Option, Result } from 'effect'
import * as Artifact from './artifact.js'
import * as Expr from './expr.js'
import type * as Fn from './fn.js'
import * as Language from './language.js'
import * as Node from './node.js'
import { applyForeign, evalNode } from './ops/eval.js'
import { readable } from './path.js'
import type * as Policy from './policy.js'
import * as Transition from './transition.js'
import type * as Verdict from './verdict.js'

/** Structured observation emitted by `withObserver`. */
export type InterpreterEvent =
  | {
      readonly kind: 'eval'
      readonly backend: string
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'judge'
      readonly backend: string
      readonly durationMs: number
      readonly verdict: Verdict.Verdict<never>['_tag']
    }
  | {
      readonly kind: 'residualize'
      readonly backend: string
      readonly durationMs: number
    }
  | {
      readonly kind: 'step'
      readonly backend: string
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'runFn'
      readonly backend: string
      readonly checked: boolean
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'allow'
      readonly backend: string
      readonly rule: string
      readonly durationMs: number
      readonly allowed: boolean
    }

/** Callback invoked by `withObserver` for every interpreter operation. */
export type InterpreterObserver = (event: InterpreterEvent) => Effect.Effect<void>

/** Result of executing one transition step. */
export interface StepOutput<State, Emit> {
  readonly state: State
  readonly emitted: ReadonlyArray<Emit>
}

/** Implementation contract for a MetaKit interpreter backend. */
export interface InterpreterBackend {
  readonly name: string
  /** Foreign operation implementations ambiently available to this backend. */
  readonly foreign: Expr.ForeignImplementations
  /** Evaluate an expression, failing with `Node.Refusal` if evaluation is refused. */
  readonly eval: <Env, A>(
    expr: Expr.Expr<Env, A>,
    env: Env,
  ) => Effect.Effect<A | null, Node.Refusal>
  /** Partially evaluate a boolean expression against a partial environment. */
  readonly judge: <Env>(
    expr: Expr.Expr<Env, boolean>,
    partial: Expr.PartialEnv<Env>,
  ) => Effect.Effect<Verdict.Verdict<never>>
  /** Residualize an expression against a partial environment. */
  readonly residualize: <Env, A>(
    expr: Expr.Expr<Env, A>,
    partial: Expr.PartialEnv<Env>,
  ) => Effect.Effect<Expr.Expr<Env, A>>
  /** Execute a transition (guard + writes + emissions), failing with `Transition.Refused`. */
  readonly step: <State, Input, Emit, Supplied>(
    transition: Transition.Transition<State, Input, Emit, Supplied>,
    state: NoInfer<State>,
    input: NoInfer<Input>,
    ...args: Transition.SuppliedArgs<Supplied>
  ) => Effect.Effect<StepOutput<State, Emit>, Transition.Refused>
  /** Execute a `Fn` (optionally contract-checked via `runChecked`). */
  readonly runFn: <P extends Fn.ParamSchemas, R>(
    fn: Fn.Fn<P, R>,
    args: Fn.ParamValues<P>,
    options?: { readonly checked?: boolean },
  ) => Effect.Effect<R | null, Node.Refusal | Fn.FnContractError>
  /** Evaluate a named `Policy` rule. */
  readonly allow: <
    Row,
    Principal,
    Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
    K extends keyof Rules & string,
  >(
    policy: Policy.Policy<Row, Principal, Rules>,
    rule: K,
    env: NoInfer<Policy.PolicyEnv<Row, Principal>>,
  ) => Effect.Effect<boolean>
  /**
   * Return a copy of this backend with `foreign` (and optionally `name` /
   * `allowlist`) updated while preserving any surrounding middleware wrappers
   * (`withTracing`, `withObserver`).
   */
  readonly rebind?: (options: {
    readonly name?: string | undefined
    readonly foreign: Expr.ForeignImplementations
    readonly allowlist?: ReadonlySet<string> | undefined
  }) => InterpreterBackend
}

export interface MemoryBackendOptions {
  readonly name?: string | undefined
  readonly foreign?: Expr.ForeignImplementations | undefined
  readonly allowlist?: ReadonlySet<string> | undefined
}

const filterForeign = (
  table: Expr.ForeignImplementations,
  allowlist: ReadonlySet<string> | undefined,
): Expr.ForeignImplementations => {
  if (allowlist === undefined) return table
  const filtered: Record<string, Expr.ForeignImplementation> = {}
  for (const [key, impl] of Object.entries(table)) {
    const baseId = key.split('@')[0] ?? key
    if (allowlist.has(key) || allowlist.has(baseId)) {
      filtered[key] = impl
    }
  }
  return filtered
}

const mergeForeign = (
  base: Expr.ForeignImplementations,
  override: Expr.ForeignImplementations | undefined,
  allowlist?: ReadonlySet<string>,
): Expr.ForeignImplementations =>
  filterForeign(override === undefined ? base : { ...base, ...override }, allowlist)

/** Construct an in-memory `InterpreterBackend` with optional ambient `foreign` implementations. */
export const makeMemoryBackend = (options?: MemoryBackendOptions): InterpreterBackend => {
  const name = options?.name ?? 'memory'
  const allowlist = options?.allowlist
  const foreign: Expr.ForeignImplementations = filterForeign(options?.foreign ?? {}, allowlist)
  const readerOptions: Expr.ReaderOptions = { foreign }

  return {
    name,
    foreign,
    eval: (expr, env) => Effect.fromResult(Expr.evalResult(expr, env, readerOptions)),
    judge: (expr, partial) => Effect.sync(() => Expr.judge(expr, partial, readerOptions)),
    residualize: (expr, partial) =>
      Effect.sync(() => Expr.residualize(expr, partial, readerOptions)),
    step: <State, Input, Emit, Supplied>(
      transition: Transition.Transition<State, Input, Emit, Supplied>,
      state: NoInfer<State>,
      input: NoInfer<Input>,
      ...args: Transition.SuppliedArgs<Supplied>
    ): Effect.Effect<StepOutput<State, Emit>, Transition.Refused> => {
      const [supplied, callerOptions] = args as unknown as readonly [
        Supplied,
        Expr.ReaderOptions | undefined,
      ]
      const mergedOptions: Expr.ReaderOptions = {
        foreign: mergeForeign(foreign, callerOptions?.foreign, allowlist),
      }
      const callArgs = [supplied, mergedOptions] as unknown as Transition.SuppliedArgs<Supplied>
      return Effect.fromResult(Transition.step(transition, state, input, ...callArgs))
    },
    runFn: (fn, args, opts) =>
      opts?.checked === true
        ? Effect.fromResult(fn.runChecked(args, readerOptions))
        : Effect.fromResult(Expr.evalResult(fn.body, args, readerOptions)),
    allow: (policy, rule, env) =>
      Effect.sync(() => {
        if (!Object.hasOwn(policy.rules, rule)) {
          throw new Error(`[metakit] Policy references unknown rule "${rule}"`)
        }
        return Result.match(Expr.evalResult(policy.rules[rule]!, env, readerOptions), {
          onSuccess: value => value === true,
          onFailure: () => false,
        })
      }),
    rebind: next =>
      makeMemoryBackend({
        name: next.name ?? name,
        foreign: next.foreign,
        allowlist: next.allowlist ?? allowlist,
      }),
  }
}

/** Default in-memory backend (no foreign operations registered). */
export const memoryBackend: InterpreterBackend = makeMemoryBackend()

/**
 * The ambient MetaKit interpreter in the Effect context.
 * Defaults to `memoryBackend`; override with `Interpreter.layer(...)` or
 * middleware layers (`withForeign`, `withTracing`, `withObserver`, `withAllowlist`).
 */
export const Interpreter = Context.Reference<InterpreterBackend>('metakit/Interpreter', {
  defaultValue: () => memoryBackend,
})

/** Provide an in-memory `Interpreter` configured with optional `foreign` implementations. */
export const layer = (options?: MemoryBackendOptions): Layer.Layer<never> =>
  Layer.succeed(Interpreter, makeMemoryBackend(options))

/** Merge additional `foreign` operation implementations onto the current `Interpreter`. */
export const withForeign = (foreign: Expr.ForeignImplementations): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), current => {
      const merged = mergeForeign(current.foreign, foreign)
      return current.rebind !== undefined
        ? current.rebind({ name: current.name, foreign: merged })
        : makeMemoryBackend({ name: current.name, foreign: merged })
    }),
  )

/**
 * Sandbox layer: restricts the current `Interpreter`'s `foreign` implementations
 * (including any caller-supplied `step` options) to only those whose ids appear
 * in `allowedForeignOps`. Any disallowed foreign op is omitted so evaluation
 * refuses it cleanly with `Node.Refusal`.
 */
export const withAllowlist = (allowedForeignOps: ReadonlySet<string>): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), current => {
      const filtered = filterForeign(current.foreign, allowedForeignOps)
      const nextName = `${current.name}:sandbox`
      return current.rebind !== undefined
        ? current.rebind({ name: nextName, foreign: filtered, allowlist: allowedForeignOps })
        : makeMemoryBackend({
            name: nextName,
            foreign: filtered,
            allowlist: allowedForeignOps,
          })
    }),
  )

const wrapTracing = (inner: InterpreterBackend, prefix: string): InterpreterBackend => ({
  name: inner.name,
  foreign: inner.foreign,
  eval: (expr, env) =>
    inner
      .eval(expr, env)
      .pipe(Effect.withSpan(`${prefix}.eval`, { attributes: { backend: inner.name } })),
  judge: (expr, partial) =>
    inner
      .judge(expr, partial)
      .pipe(Effect.withSpan(`${prefix}.judge`, { attributes: { backend: inner.name } })),
  residualize: (expr, partial) =>
    inner
      .residualize(expr, partial)
      .pipe(Effect.withSpan(`${prefix}.residualize`, { attributes: { backend: inner.name } })),
  step: (transition, state, input, ...args) =>
    inner
      .step(transition, state, input, ...args)
      .pipe(Effect.withSpan(`${prefix}.step`, { attributes: { backend: inner.name } })),
  runFn: (fn, args, opts) =>
    inner.runFn(fn, args, opts).pipe(
      Effect.withSpan(`${prefix}.runFn`, {
        attributes: { backend: inner.name, checked: opts?.checked === true },
      }),
    ),
  allow: (policy, rule, env) =>
    inner.allow(policy, rule, env).pipe(
      Effect.withSpan(`${prefix}.allow`, {
        attributes: { backend: inner.name, rule },
      }),
    ),
  ...(inner.rebind === undefined
    ? {}
    : { rebind: next => wrapTracing(inner.rebind!(next), prefix) }),
})

/** Wrap the current `Interpreter` so every operation emits an `Effect.withSpan`. */
export const withTracing = (options?: {
  readonly prefix?: string | undefined
}): Layer.Layer<never> => {
  const prefix = options?.prefix ?? 'metakit.interpreter'
  return Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), inner => wrapTracing(inner, prefix)),
  )
}

const wrapObserver = (
  inner: InterpreterBackend,
  observer: InterpreterObserver,
): InterpreterBackend => ({
  name: inner.name,
  foreign: inner.foreign,
  eval: (expr, env) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const exit = yield* Effect.exit(inner.eval(expr, env))
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'eval',
        backend: inner.name,
        durationMs: end - start,
        ok: Exit.isSuccess(exit),
      })
      return yield* exit
    }),
  judge: (expr, partial) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const verdict = yield* inner.judge(expr, partial)
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'judge',
        backend: inner.name,
        durationMs: end - start,
        verdict: verdict._tag,
      })
      return verdict
    }),
  residualize: (expr, partial) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const out = yield* inner.residualize(expr, partial)
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'residualize',
        backend: inner.name,
        durationMs: end - start,
      })
      return out
    }),
  step: (transition, state, input, ...args) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const exit = yield* Effect.exit(inner.step(transition, state, input, ...args))
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'step',
        backend: inner.name,
        durationMs: end - start,
        ok: Exit.isSuccess(exit),
      })
      return yield* exit
    }),
  runFn: (fn, args, opts) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const exit = yield* Effect.exit(inner.runFn(fn, args, opts))
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'runFn',
        backend: inner.name,
        checked: opts?.checked === true,
        durationMs: end - start,
        ok: Exit.isSuccess(exit),
      })
      return yield* exit
    }),
  allow: (policy, rule, env) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const allowed = yield* inner.allow(policy, rule, env)
      const end = yield* Clock.currentTimeMillis
      yield* observer({
        kind: 'allow',
        backend: inner.name,
        rule,
        durationMs: end - start,
        allowed,
      })
      return allowed
    }),
  ...(inner.rebind === undefined
    ? {}
    : { rebind: next => wrapObserver(inner.rebind!(next), observer) }),
})

/**
 * Middleware layer that notifies `observer` after every interpreter operation,
 * measuring elapsed duration using Effect's `Clock`.
 */
export const withObserver = (observer: InterpreterObserver): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), inner => wrapObserver(inner, observer)),
  )

// ---------------------------------------------------------------------------
// Ambient helpers reading the current `Interpreter` from Effect context
// ---------------------------------------------------------------------------

/** Read the foreign operation implementations registered on the current `Interpreter`. */
export const foreign: Effect.Effect<Expr.ForeignImplementations> = Effect.map(
  Effect.service(Interpreter),
  i => i.foreign,
)

/** Evaluate `expr` against `env` using the current `Interpreter`. */
export const evalExpr = <Env, A>(
  expr: Expr.Expr<Env, A>,
  env: Env,
): Effect.Effect<A | null, Node.Refusal> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.eval(expr, env))

/** Partially evaluate boolean `expr` against `partial` using the current `Interpreter`. */
export const judge = <Env>(
  expr: Expr.Expr<Env, boolean>,
  partial: Expr.PartialEnv<Env>,
): Effect.Effect<Verdict.Verdict<never>> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.judge(expr, partial))

/** Residualize `expr` against `partial` using the current `Interpreter`. */
export const residualize = <Env, A>(
  expr: Expr.Expr<Env, A>,
  partial: Expr.PartialEnv<Env>,
): Effect.Effect<Expr.Expr<Env, A>> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.residualize(expr, partial))

/** Execute a transition step (returning `{ state, emitted }`) using the current `Interpreter`. */
export const step = <State, Input, Emit, Supplied>(
  transition: Transition.Transition<State, Input, Emit, Supplied>,
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: Transition.SuppliedArgs<Supplied>
): Effect.Effect<StepOutput<State, Emit>, Transition.Refused> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.step(transition, state, input, ...args))

/** Execute a transition (returning the next `State`) using the current `Interpreter`. */
export const run = <State, Input, Emit, Supplied>(
  transition: Transition.Transition<State, Input, Emit, Supplied>,
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: Transition.SuppliedArgs<Supplied>
): Effect.Effect<State, Transition.Refused> =>
  Effect.map(step(transition, state, input, ...args), s => s.state)

/** Execute a `Fn` using the current `Interpreter`. */
export const runFn = <P extends Fn.ParamSchemas, R>(
  fn: Fn.Fn<P, R>,
  args: Fn.ParamValues<P>,
  options?: { readonly checked?: boolean },
): Effect.Effect<R | null, Node.Refusal | Fn.FnContractError> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.runFn(fn, args, options))

/** Evaluate a named `Policy` rule using the current `Interpreter`. */
export const allow = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
  K extends keyof Rules & string,
>(
  policy: Policy.Policy<Row, Principal, Rules>,
  rule: K,
  env: NoInfer<Policy.PolicyEnv<Row, Principal>>,
): Effect.Effect<boolean> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.allow(policy, rule, env))

// ---------------------------------------------------------------------------
// Phase E (#645 P2): Evidence-gated prepared execution (CSP-safe, no eval())
// ---------------------------------------------------------------------------

export interface PrepareOptions {
  /** Stable identities for foreign implementations (`id@version -> Option<string>`). */
  readonly foreignIdentities?: Readonly<Record<string, Option.Option<string>>>
  /** Optional fingerprint of relevant environment Schema constraints. */
  readonly schemaFingerprint?: string
  /** Execution/proof assumptions bound into `evidenceKey`. */
  readonly assumptions?: Readonly<Record<string, string | number | boolean>>
}

export interface PreparedPlan<Env, A> {
  /** Content fingerprint of the canonical portable expression (`Option.none()` if non-portable). */
  readonly fingerprint: Option.Option<Artifact.ArtifactFingerprint>
  /** Cache key for prepared execution (`Option.none()` if non-portable or unidentified foreign impl). */
  readonly evidenceKey: Option.Option<Artifact.EvidenceKey>
  readonly portable: boolean
  /** `'compiled'` when every node was preplanned; `'hybrid'` when `Rows` or `Opaque` delegates to reference eval. */
  readonly strategy: 'compiled' | 'hybrid'
  /** Execute the prepared plan, failing with `Node.Refusal` on refusal. */
  readonly evaluate: (env: Env) => Effect.Effect<A | null, Node.Refusal>
  /** Synchronous hot-path execution returning a value, `null`, or `Node.Refusal`. */
  readonly evaluateSync: (env: Env) => A | null | Node.Refusal
}

type CompiledFn = (env: unknown) => unknown

const readStep = (current: unknown, segment: string): unknown => {
  const value = readable(current)
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    !Object.hasOwn(value, segment)
  ) {
    return null
  }
  return (value as Record<string, unknown>)[segment]
}

const finishRead = (value: unknown): unknown => {
  const out = readable(value)
  return out === undefined ? null : out
}

const compilePath = (segments: ReadonlyArray<string>): CompiledFn => {
  switch (segments.length) {
    case 0:
      return env => finishRead(env)
    case 1: {
      const s0 = segments[0]!
      return env => finishRead(readStep(env, s0))
    }
    case 2: {
      const s0 = segments[0]!
      const s1 = segments[1]!
      return env => finishRead(readStep(readStep(env, s0), s1))
    }
    case 3: {
      const s0 = segments[0]!
      const s1 = segments[1]!
      const s2 = segments[2]!
      return env => finishRead(readStep(readStep(readStep(env, s0), s1), s2))
    }
    default:
      return env => {
        let current: unknown = env
        for (let i = 0; i < segments.length; i++) {
          current = readStep(current, segments[i]!)
          if (current === null) return null
        }
        return finishRead(current)
      }
  }
}

const compileNode = (
  root: Node.Node,
  foreign: Expr.ForeignImplementations,
): { readonly fn: CompiledFn; readonly hybrid: boolean } => {
  let hybrid = false

  const visit = (node: Node.Node): CompiledFn =>
    Node.$match(node, {
      Lit: ({ value }): CompiledFn => {
        const resolved = value === undefined ? null : value
        return () => resolved
      },
      Path: ({ segments }): CompiledFn => compilePath(segments),
      Call: ({ op, args }): CompiledFn => {
        const argFns = args.map(visit)
        if (Node.isForeign(op)) {
          return (env: unknown) => {
            const values = new Array<unknown>(argFns.length)
            for (let i = 0; i < argFns.length; i++) values[i] = argFns[i]!(env)
            return applyForeign(op, values, foreign)
          }
        }
        if (argFns.length === 1) {
          const a0 = argFns[0]!
          return (env: unknown) => Node.apply(op, [a0(env)])
        }
        if (argFns.length === 2) {
          const a0 = argFns[0]!
          const a1 = argFns[1]!
          return (env: unknown) => Node.apply(op, [a0(env), a1(env)])
        }
        return (env: unknown) => {
          const values = new Array<unknown>(argFns.length)
          for (let i = 0; i < argFns.length; i++) values[i] = argFns[i]!(env)
          return Node.apply(op, values)
        }
      },
      If: ({ cond, then: t, otherwise }): CompiledFn => {
        const condFn = visit(cond)
        const thenFn = visit(t)
        const elseFn = visit(otherwise)
        return (env: unknown) => {
          const c = condFn(env)
          if (c === true) return thenFn(env)
          if (c === false) return elseFn(env)
          if (c === null || Node.isRefusal(c)) return c
          return Node.illTyped('if', 'a boolean', c)
        }
      },
      Match: ({ on, cases, otherwise }): CompiledFn => {
        const onFn = visit(on)
        const table = new Map<string, CompiledFn>()
        for (const [label, branch] of cases) {
          const key = Node.wellFormed(label)
          if (!table.has(key)) table.set(key, visit(branch))
        }
        const elseFn = Option.isSome(otherwise) ? visit(otherwise.value) : undefined
        return (env: unknown) => {
          const target = onFn(env)
          if (Node.isRefusal(target)) return target
          const held = Node.textIdentity(target)
          if (typeof held === 'string') {
            const hit = table.get(held)
            if (hit !== undefined) return hit(env)
          }
          if (elseFn !== undefined) return elseFn(env)
          if (target === null) return null
          return new Node.Refusal({
            reason: 'unmatched',
            at: 'match',
            detail: `no case names ${JSON.stringify(target)}`,
          })
        }
      },
      Opaque: ({ run }): CompiledFn => {
        hybrid = true
        return (env: unknown) => {
          const out = run(env)
          return out === undefined ? null : out
        }
      },
      Rows: (rows): CompiledFn => {
        hybrid = true
        return (env: unknown) => evalNode(rows, env, foreign)
      },
    })

  return { fn: visit(root), hybrid }
}

/**
 * Prepare `expr` into a preplanned, CSP-safe closure tree bound to the current
 * `Interpreter` backend's `foreign` table, with `ArtifactFingerprint` and
 * `EvidenceKey` metadata.
 *
 * Observable behavior (values, `null`, `Refusal`, short-circuiting, numeric
 * bounds, text normalization) is identical to `Expr.evaluate`.
 */
export const prepare = <Env, A>(
  expr: Expr.Expr<Env, A>,
  options?: PrepareOptions,
): Effect.Effect<PreparedPlan<Env, A>> =>
  Effect.gen(function* () {
    const backend = yield* Effect.service(Interpreter)
    const ready = yield* Language.readiness(expr, { _tag: 'portable' })
    const fp: Option.Option<Artifact.ArtifactFingerprint> = ready.portable
      ? yield* Artifact.fingerprint(expr).pipe(
          Effect.map(Option.some),
          Effect.catch(() => Effect.succeed(Option.none())),
        )
      : Option.none()

    const evKey: Option.Option<Artifact.EvidenceKey> = Option.isSome(fp)
      ? yield* Artifact.evidenceKey({
          fingerprint: fp.value,
          reader: { id: 'metakit/prepare', version: '1' },
          profile: backend.name,
          requiredForeignOps: ready.requiredForeignOps,
          ...(options?.schemaFingerprint === undefined
            ? {}
            : { schemaFingerprint: options.schemaFingerprint }),
          ...(options?.foreignIdentities === undefined
            ? {}
            : { foreignIdentities: options.foreignIdentities }),
          ...(options?.assumptions === undefined ? {} : { assumptions: options.assumptions }),
        })
      : Option.none()

    const { fn, hybrid } = compileNode(expr.node, backend.foreign)
    const evaluateSync = (env: Env): A | null | Node.Refusal => fn(env) as A | null | Node.Refusal
    const evaluate = (env: Env): Effect.Effect<A | null, Node.Refusal> =>
      Effect.suspend(() => {
        const out = evaluateSync(env)
        return Node.isRefusal(out) ? Effect.fail(out) : Effect.succeed(out)
      })

    return {
      fingerprint: fp,
      evidenceKey: evKey,
      portable: ready.portable,
      strategy: hybrid ? 'hybrid' : 'compiled',
      evaluate,
      evaluateSync,
    }
  })
