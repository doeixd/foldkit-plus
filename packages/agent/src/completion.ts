import { Duration, Effect } from 'effect'
import type { Projection } from 'foldkit-surface'
import { CompletionTimeoutError } from './errors.js'
import { messageTags } from './tag.js'
import type {
  AnyCompletion,
  AnyMessage,
  CompletionOutcome,
  DispatchResult,
  Invocation,
  StateCompletion,
  StateSource,
} from './types.js'

export type { CompletionOutcome } from './types.js'

/** A protocol-neutral reading of a successful dispatch, for an adapter to render. */
export interface DispatchSummary {
  /** False only when the capability declared a completion whose status is `failed`. */
  readonly ok: boolean
  /** `Dispatched <tag>` without a completion contract, else `<Completed|Failed>: <tag>`. */
  readonly text: string
}

/**
 * Summarizes a dispatch. Every adapter renders the same outcome, so the wording
 * lives here rather than in each of them.
 */
export const summarize = (result: DispatchResult): DispatchSummary => ({
  ok: result.completion?.status !== 'failed',
  text:
    result.completion === undefined
      ? `Dispatched ${result.tag}`
      : result.completion.message === undefined
        ? `Completed: ${result.tag} reached its declared state`
        : `${result.completion.status === 'completed' ? 'Completed' : 'Failed'}: ${result.completion.message._tag}`,
})

/**
 * Completes an invocation when a state satisfies `predicate`, whatever caused
 * it: a Command result, a live update, a Sync exchange, another device.
 * `request` is the capability's decoded input. Written inline in an
 * `Agent.expose` capability it is inferred. Inside `Agent.variant`, or anywhere
 * else, it is `unknown` until annotated, and a wrong annotation is rejected.
 *
 * Completed means the condition holds, not that this call made it true: a state
 * that already holds when the Message is dispatched completes at once. Write a
 * predicate only this call can make true. A creation, where only the resulting
 * fact says which record is this call's, completes on that Message with
 * `correlate` instead.
 *
 * A `projection` reads this application's Model through the host, which then
 * needs `subscribe`. A `source` reads a value outside the Model and notifies on
 * its own, like `foldkit-sync`'s `mounted.committed`. Only success is
 * expressed; a state that never arrives ends at `timeout`.
 *
 * @example
 * ```ts
 * RequestedRenameProject: {
 *   description: 'Rename a project',
 *   completion: Agent.when({
 *     projection: ProjectName,
 *     predicate: (name, request) => name === request.name,
 *   }),
 * }
 * ```
 */
export function when<Value, Request = unknown, Model = any>(config: {
  readonly projection: Projection<Model, Value>
  readonly predicate: (value: Value, request: Request) => boolean
  readonly timeout?: Duration.Input | undefined
}): StateCompletion<Request, Model>
export function when<Value, Request = unknown>(config: {
  readonly source: StateSource<Value>
  readonly predicate: (value: Value, request: Request) => boolean
  readonly timeout?: Duration.Input | undefined
}): StateCompletion<Request, unknown>
export function when(config: object): StateCompletion {
  return { _tag: 'StateCompletion', ...config } as StateCompletion
}

export const isStateCompletion = (completion: AnyCompletion): completion is StateCompletion =>
  '_tag' in completion && completion._tag === 'StateCompletion'

/** A Message contract compiled into the tags and predicate the runtime matches on. */
export interface CompiledMessageCompletion {
  readonly _tag: 'Message'
  readonly success: ReadonlySet<string>
  readonly failure: ReadonlySet<string>
  readonly correlate: ((request: unknown, result: AnyMessage) => boolean) | undefined
  readonly timeout: Duration.Duration
}

/** A state contract compiled into the read and the condition the runtime evaluates. */
export interface CompiledStateCompletion {
  readonly _tag: 'State'
  /** Reads the value from the host's Model; a source ignores it. */
  readonly read: (model: unknown) => unknown
  /** A source's own notifications; `undefined` means the host's `subscribe`. */
  readonly subscribe: ((listener: () => void) => () => void) | undefined
  readonly predicate: (value: unknown, request: unknown) => boolean
  readonly timeout: Duration.Duration
}

export type CompiledCompletion = CompiledMessageCompletion | CompiledStateCompletion

/**
 * A completion contract that never resolves is a leak, so a waiter always has a
 * deadline. Long-running Commands should raise it deliberately.
 */
const DEFAULT_TIMEOUT = Duration.seconds(30)

const timeoutOf = (timeout: Duration.Input | undefined): Duration.Duration =>
  timeout === undefined ? DEFAULT_TIMEOUT : Duration.fromInputUnsafe(timeout)

export const compileCompletion = (
  completion: AnyCompletion,
  capability: string,
): CompiledCompletion => {
  if (isStateCompletion(completion)) {
    const predicate = completion.predicate
    const timeout = timeoutOf(completion.timeout)
    if (completion.source === undefined) {
      const projection = completion.projection
      return {
        _tag: 'State',
        read: model => projection.read(model),
        subscribe: undefined,
        predicate,
        timeout,
      }
    }
    const source = completion.source
    return {
      _tag: 'State',
      read: () => source.get(),
      subscribe: source.subscribe,
      predicate,
      timeout,
    }
  }

  const success = new Set(messageTags(completion.success))
  const failure = new Set(messageTags(completion.failure ?? []))

  if (success.size === 0) {
    throw new Error(
      `Cannot expose "${capability}": its completion contract names no success Message`,
    )
  }
  for (const tag of failure) {
    if (success.has(tag)) {
      throw new Error(
        `Cannot expose "${capability}": "${tag}" is both a success and a failure Message`,
      )
    }
  }

  return {
    _tag: 'Message',
    success,
    failure,
    correlate: completion.correlate as CompiledMessageCompletion['correlate'],
    timeout: timeoutOf(completion.timeout),
  }
}

/** Subscribes to the host and resolves once this invocation's contract is met. */
interface CompletionWaiter {
  readonly outcome: Effect.Effect<CompletionOutcome, CompletionTimeoutError>
  /**
   * Releases the subscription. Safe to call more than once.
   *
   * The subscription is taken before dispatch, so the caller owns it from that
   * moment and must release it from a finalizer that also covers the dispatch.
   */
  readonly release: () => void
}

const withDeadline = (timeout: Duration.Duration, capability: string, invocation: Invocation) =>
  Effect.timeoutOrElse({
    duration: timeout,
    orElse: () => Effect.fail(CompletionTimeoutError.of(capability, invocation.id, timeout)),
  })

/**
 * Starts waiting **before** the Message is dispatched.
 *
 * `update` can produce the completing Message synchronously, so a waiter that
 * subscribed afterwards would miss it and then sit until its timeout.
 */
export const awaitCompletion = (options: {
  readonly completion: CompiledMessageCompletion
  readonly capability: string
  readonly input: unknown
  readonly invocation: Invocation
  readonly observe: (listener: (message: AnyMessage) => void) => () => void
}): CompletionWaiter => {
  const { completion, capability, input, invocation, observe } = options

  let settle: ((outcome: CompletionOutcome) => void) | undefined
  let settled: CompletionOutcome | undefined
  let unsubscribe: (() => void) | undefined
  let released = false

  const release = (): void => {
    if (released) return
    released = true
    unsubscribe?.()
    unsubscribe = undefined
  }

  const owns = (message: AnyMessage): boolean =>
    completion.correlate === undefined || completion.correlate(input, message)

  unsubscribe = observe(message => {
    // A settled invocation never settles twice: a second matching Message, or
    // one arriving after a timeout, is ignored rather than resolving again.
    if (settled !== undefined || released) return

    const status = completion.success.has(message._tag)
      ? ('completed' as const)
      : completion.failure.has(message._tag)
        ? ('failed' as const)
        : undefined

    if (status === undefined || !owns(message)) return

    // `settled` is the guard against a second Message; the subscription itself
    // is released by the caller's finalizer, on every exit path.
    settled = { status, message }
    settle?.(settled)
  })

  const outcome = Effect.callback<CompletionOutcome>(resume => {
    // The Message may already have arrived while dispatch was in flight.
    if (settled !== undefined) {
      resume(Effect.succeed(settled))
      return
    }
    settle = outcome => resume(Effect.succeed(outcome))
  }).pipe(withDeadline(completion.timeout, capability, invocation))

  return { outcome, release }
}

/**
 * Waits for a state contract's condition.
 *
 * Subscribes before dispatch, then evaluates once more when the wait begins: a
 * host need not notify for a change `update` made synchronously, and a state
 * that already held produces no change at all.
 */
export const awaitState = (options: {
  readonly completion: CompiledStateCompletion
  readonly capability: string
  readonly input: unknown
  readonly invocation: Invocation
  readonly model: () => unknown
  readonly subscribe: (listener: () => void) => () => void
}): CompletionWaiter => {
  const { completion, capability, input, invocation, model, subscribe } = options

  let settle: ((result: Effect.Effect<CompletionOutcome>) => void) | undefined
  let settled: Effect.Effect<CompletionOutcome> | undefined
  let unsubscribe: (() => void) | undefined
  let released = false
  let evaluated = false
  let last: unknown

  const release = (): void => {
    if (released) return
    released = true
    unsubscribe?.()
    unsubscribe = undefined
  }

  // Only a projection of an immutable Model can skip an unchanged reference; a
  // source may mutate its value in place and notify with the same reference.
  const skipsUnchanged = completion.subscribe === undefined

  const check = (): void => {
    if (settled !== undefined || released) return
    try {
      const value = completion.read(model())
      // Every Model change notifies every waiter; one that left this value
      // alone cannot change the answer, so it costs a read and no predicate.
      if (skipsUnchanged && evaluated && Object.is(value, last)) return
      evaluated = true
      last = value
      if (!completion.predicate(value, input)) return
      settled = Effect.succeed({ status: 'completed' })
    } catch (error) {
      // Thrown inside the host's notification: it becomes this invocation's
      // defect rather than breaking whatever changed the Model.
      settled = Effect.die(error)
    }
    settle?.(settled)
  }

  unsubscribe = subscribe(check)

  const outcome = Effect.callback<CompletionOutcome>(resume => {
    check()
    if (settled !== undefined) {
      resume(settled)
      return
    }
    settle = resume
  }).pipe(withDeadline(completion.timeout, capability, invocation))

  return { outcome, release }
}
