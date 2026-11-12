/**
 * The server's own side of a document: Messages only it appends, and
 * reactions, the work that runs after a commit. Both commit through the
 * journal's `append` as the server's principal, so the journal's `validate`
 * and `authorize` judge them like any operation.
 *
 * A reaction's cursor and its parked runs live in `foldkit-durable`
 * (`journal.cursors`), beside the effect ledger, which records each run's
 * answer and whether its appends finished. The cursor is a lower bound over
 * the ledger, so losing it costs ledger reads, never a second external call.
 * An external call still runs at least once, never exactly once: a crash
 * between the call and the ledger's write runs it again, with the same key.
 */
import {
  Cause,
  Clock,
  Duration,
  Effect,
  Option,
  Predicate,
  Queue,
  Result,
  Schema,
  Stream,
} from 'effect'
import {
  Cursor,
  DocumentId as JournalDocumentId,
  InvalidOperationError,
  JournalError,
  OpId,
  type AppendError,
  type AppendResult,
  type Journal,
  type ParkedRun,
} from 'foldkit-durable/core'
import type { MessageSet, ReportDiagnostic } from 'foldkit-surface'
import {
  reactionFailed,
  reactionParked,
  reactionSkipped,
  reportTo,
  type SyncDiagnostic,
} from './diagnostics.js'
import {
  AmbiguousMessageError,
  ServerKeyReusedError,
  StaleParkedRunError,
  UnreadableMessageError,
  UnsupportedMessageVersionError,
} from './errors.js'
import type { DefinedSync, MsgOf, ServerMsgOf } from './make.js'
import {
  SERVER_REPLICA_PREFIX,
  writtenEnvelope,
  type Operation,
  type WrittenOperation,
} from './sync.js'

/** The longest key `appendAsServer` takes. */
const MAX_KEY = 200
/** The most Messages one run may append. */
const MAX_APPENDS = 16
/** How many committed operations a reaction reads at once. */
const PAGE = 100
/** A failing reaction waits from this, doubling, up to the cap, in ms. */
const BACKOFF_BASE = 500
const BACKOFF_MAX = 30_000
/** How long a pass waits after the journal itself failed, which counts toward no bound. */
const JOURNAL_RETRY = Duration.seconds(5)
const REACTION_NAME = /^[A-Za-z0-9_-]{1,64}$/

/** A committed operation, as a reaction is given it. */
export interface Trigger<Message> {
  /** The Message at the current version, as every hook sees it. */
  readonly message: Message
  readonly opId: string
  readonly sequence: number
  /** Who committed it: a person's actor, or the server's. */
  readonly actorId: string
  /**
   * 64 hex characters naming this run, the same on every retry and across
   * restarts: give it to the provider as its idempotency key.
   */
  readonly key: string
}

/**
 * One declared reaction of one document: what it runs on, what it may
 * append, and what its handler needs. Made by `reaction`, given to
 * `serverJournal`.
 */
export interface Reaction<Document, out R = never> {
  /** The contract it was declared for: `serverJournal` refuses it for another. */
  readonly sync: Document
  readonly name: string
  /** The tags it runs on. */
  readonly on: ReadonlySet<string>
  /** The tags it may append. */
  readonly appends: ReadonlySet<string>
  /** The services its handler needs; never present. */
  readonly requires?: () => R
}

interface Handler {
  readonly run: (
    trigger: Trigger<unknown>,
  ) => Effect.Effect<ReadonlyArray<unknown> | void, unknown, unknown>
  readonly timeout: Duration.Duration
  readonly attempts: number
  readonly parkAfter: Duration.Duration
}

/** Each reaction's handler and bounds, kept off the value so nothing else can call it. */
const handlers = new WeakMap<Reaction<unknown, unknown>, Handler>()

type AnySync = DefinedSync<any, any, any, any, any, any, any>

const tagOf = (message: unknown): Option.Option<string> =>
  Predicate.hasProperty(message, '_tag') && typeof message._tag === 'string'
    ? Option.some(message._tag)
    : Option.none()

const tagsOf = (constructors: ReadonlyArray<unknown>): ReadonlySet<string> =>
  new Set(
    constructors.flatMap(constructor => {
      const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } })
        .fields?._tag?.ast?.literal
      return typeof literal === 'string' ? [literal] : []
    }),
  )

export interface ReactionOptions<AppModel, On, Appends, R> {
  /** Part of every run's key, so renaming it is a new reaction. Letters, digits, `_` and `-`, at most 64; unique in the document. */
  readonly name: string
  /** The committed Messages it runs after: a set of the contract's own application. */
  readonly on: MessageSet<AppModel, any, On, any>
  /** The server-only Messages it may append, checked on every answer. Without it, it appends nothing. */
  readonly appends?: MessageSet<AppModel, any, Appends, any>
  /** How long one run may take before it counts as failed. Default 10 seconds. */
  readonly timeout?: Duration.Input
  /** A failing run is parked once it has failed this many times, and for at least `parkAfter`. Default 8. */
  readonly attempts?: number
  /** How long a run must have been failing before it may be parked, so an outage parks nothing. Default one hour. */
  readonly parkAfter?: Duration.Input
  /**
   * One external call, or none, and the Messages to append, at most 16. It may
   * run again with the same trigger: pass `trigger.key` to the provider.
   */
  readonly run: (
    trigger: Trigger<On>,
  ) => Effect.Effect<ReadonlyArray<NoInfer<Appends>> | void, unknown, R>
}

/**
 * Declares a reaction of a contract from `Sync.forApplication(App).make`:
 * after each committed Message in `on`, in journal order, `run` is called
 * once at least, and what it answers is appended as the server. A handler
 * that keeps failing is parked after `attempts` failures over `parkAfter`;
 * one whose answer can never commit is parked at once. Throws for a name
 * that is not one, or a set of another application or outside the contract.
 */
export const reaction = <
  AppModel,
  Fields extends Schema.Struct.Fields,
  Message,
  Ms extends readonly unknown[],
  ContractPrincipal,
  Authorized extends boolean,
  SMs extends readonly unknown[],
  On extends MsgOf<Ms> | ServerMsgOf<SMs>,
  Appends extends ServerMsgOf<SMs> = never,
  R = never,
>(
  sync: DefinedSync<AppModel, Fields, Message, Ms, ContractPrincipal, Authorized, SMs>,
  options: ReactionOptions<AppModel, On, Appends, R>,
): Reaction<DefinedSync<AppModel, Fields, Message, Ms, ContractPrincipal, Authorized, SMs>, R> => {
  const { name } = options
  if (!REACTION_NAME.test(name))
    throw new Error(
      `Sync.reaction: "${name}" is not a reaction name (letters, digits, _ and -, at most 64)`,
    )
  const owner = sync.contract.owner
  if (
    options.on.owner !== owner ||
    (options.appends !== undefined && options.appends.owner !== owner)
  )
    throw new Error(`Sync.reaction: ${name} names Messages of another application`)
  const durable = tagsOf(sync.messages)
  const server = tagsOf(sync.serverOnlyMessages)
  const on = tagsOf(options.on.constructors)
  const appends = tagsOf(options.appends?.constructors ?? [])
  for (const tag of on)
    if (!durable.has(tag) && !server.has(tag))
      throw new Error(`Sync.reaction: ${name} runs on "${tag}", which never commits`)
  for (const tag of appends)
    if (!server.has(tag))
      throw new Error(`Sync.reaction: ${name} appends "${tag}", which is not server-only`)
  const attempts = options.attempts ?? 8
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new Error(`Sync.reaction: ${name}'s attempts must be a positive integer`)
  const made: Reaction<
    DefinedSync<AppModel, Fields, Message, Ms, ContractPrincipal, Authorized, SMs>,
    R
  > = { sync, name, on, appends }
  handlers.set(made, {
    run: options.run as Handler['run'],
    timeout: Duration.fromInputUnsafe(options.timeout ?? '10 seconds'),
    attempts,
    parkAfter: Duration.fromInputUnsafe(options.parkAfter ?? '1 hour'),
  })
  return made
}

/** A run set aside: it failed for good, or too often. Its reaction went on without it. */
export interface Parked {
  readonly reaction: string
  readonly opId: string
  readonly sequence: number
  /** Why, as the last failure said it. */
  readonly error: string
  /** Parked in a history since reset: it can be dismissed, not run again. */
  readonly stale: boolean
}

export interface ServerJournal<ServerOnly, R> {
  /**
   * Appends a server-only Message as the server. `key` names the fact (a
   * webhook event's id, `absorbed/<through>`): a repeat with the same key and
   * Message is answered from history, and one with another Message fails with
   * `ServerKeyReusedError`. A key is a non-empty string of at most 200
   * characters; another is an `InvalidOperationError`.
   */
  readonly appendAsServer: (
    message: ServerOnly,
    options: { readonly key: string },
  ) => Effect.Effect<AppendResult<Operation>, AppendError | ServerKeyReusedError>
  /**
   * Runs every reaction from its stored cursor, a page at a time. Never
   * fails: a failed run is reported, and the answer is how long to wait
   * before running again; none when every reaction has caught up. Safe to
   * call at any time, from anywhere.
   */
  readonly react: Effect.Effect<Option.Option<Duration.Duration>, never, R>
  /**
   * Runs `react` now, after every commit to the document this journal
   * instance hears of, and after the delay `react` answers, until
   * interrupted: a long-lived process's loop. Fork it.
   */
  readonly follow: Effect.Effect<never, never, R>
  /** The lowest cursor of the declared reactions: compact no further than this. */
  readonly settledThrough: Effect.Effect<Cursor, JournalError>
  /** The runs set aside, for a person to look at. */
  readonly parked: Effect.Effect<ReadonlyArray<Parked>, JournalError>
  /**
   * Runs a parked run again, out of order; it leaves the list when it
   * succeeds, and stays, failing, when it does not. A recorded answer is
   * reused, so a refused append retried after the rule changed makes no
   * second external call. A stale one fails with `StaleParkedRunError`.
   */
  readonly retry: (parked: Parked) => Effect.Effect<void, unknown, R>
  /** Forgets a parked run: its reaction never happens. */
  readonly dismiss: (parked: Parked) => Effect.Effect<void, JournalError>
}

/** The services a list of reactions needs: none for none. */
export type Requires<Reactions extends ReadonlyArray<Reaction<any, any>>> = [
  Reactions[number],
] extends [never]
  ? never
  : Reactions[number] extends Reaction<any, infer R>
    ? R
    : never

export interface ServerJournalOptions<Document, Principal, Shared, Reactions> {
  readonly sync: Document
  readonly journal: Journal<Operation, Shared, Principal, WrittenOperation>
  /**
   * Who the server commits as. Never resolved from a request, and never
   * changed: the journal binds each `server/` replica id to the first actor
   * that commits from it, so another `actorId` later has every server append
   * refused.
   */
  readonly server: Principal
  readonly reactions?: Reactions
  /** The most runs one `react` starts, over every reaction; a host with a time limit sets it low. */
  readonly runsPerPass?: number
  /** Where reactions' failures, parks and skips go; the reporter in context when not given. */
  readonly diagnostics?: ReportDiagnostic | undefined
}

/** Canonical JSON with sorted object keys: what two Messages are compared by. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  )

const sha256 = (text: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(
    Effect.map(digest =>
      Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    ),
  )

/** Why a run failed: its answer can never commit, or it may on another try. */
class RunFailed extends Schema.TaggedError<RunFailed>()('SyncRunFailed', {
  permanent: Schema.Boolean,
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason
  }
}

const cut = (words: string): string => (words.length <= 500 ? words : `${words.slice(0, 499)}…`)

/** A handler's own failure, defect or interruption, in words: a run that may succeed again. */
const handlerFailed = (cause: Cause.Cause<unknown>): RunFailed =>
  new RunFailed({
    permanent: false,
    reason: cut(
      Option.match(Cause.findErrorOption(cause), {
        onSome: error =>
          Cause.isTimeoutError(error)
            ? 'The handler timed out'
            : error instanceof Error
              ? error.message
              : String(error),
        onNone: () => Cause.pretty(cause).split('\n')[0] ?? 'The handler failed',
      }),
    ),
  })

/**
 * An append the journal refused: the same refusal every time, except a
 * Message written at a version newer than this build, which a deploy fixes.
 */
const appendFailed = (error: Exclude<AppendError, JournalError>): RunFailed =>
  new RunFailed({
    permanent: !(
      error._tag === 'InvalidOperationError' &&
      error.cause instanceof UnsupportedMessageVersionError
    ),
    reason: cut(error.message),
  })

const RecordedAnswer = Schema.Struct({
  messageVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  messages: Schema.Array(Schema.Unknown),
})
const decodeAnswer = Schema.decodeUnknownEffect(RecordedAnswer, { onExcessProperty: 'error' })
const ParkedInput = Schema.Struct({ operation: Schema.Unknown, actorId: Schema.NonEmptyString })
const decodeParkedInput = Schema.decodeUnknownEffect(ParkedInput, { onExcessProperty: 'error' })

/** Each reaction appends what reaction feeds; a cycle among them is refused. */
const checkAcyclic = (reactions: ReadonlyArray<Reaction<unknown, unknown>>): void => {
  const visiting = new Set<Reaction<unknown, unknown>>()
  const done = new Set<Reaction<unknown, unknown>>()
  const visit = (from: Reaction<unknown, unknown>): void => {
    if (done.has(from)) return
    if (visiting.has(from))
      throw new Error(`Sync.serverJournal: reaction ${from.name} is in a cycle`)
    visiting.add(from)
    for (const to of reactions) if ([...from.appends].some(tag => to.on.has(tag))) visit(to)
    visiting.delete(from)
    done.add(from)
  }
  for (const each of reactions) visit(each)
}

/**
 * The server's side of one document: `appendAsServer`, and the declared
 * reactions with what runs them. Registers each reaction's cursor at the
 * journal's current cursor before it answers, so make it before the journal
 * serves its first exchange: a reaction sees every commit made after this.
 * Throws for a reaction of another contract, two of one name, or a cycle.
 */
export const serverJournal = <
  AppModel,
  Fields extends Schema.Struct.Fields,
  Message,
  Ms extends readonly unknown[],
  ContractPrincipal,
  Authorized extends boolean,
  SMs extends readonly unknown[],
  Principal,
  const Reactions extends ReadonlyArray<
    Reaction<DefinedSync<AppModel, Fields, Message, Ms, ContractPrincipal, Authorized, SMs>, any>
  > = [],
>(
  options: ServerJournalOptions<
    DefinedSync<AppModel, Fields, Message, Ms, ContractPrincipal, Authorized, SMs>,
    Principal,
    Schema.Struct.Type<Fields>,
    Reactions
  >,
): Effect.Effect<ServerJournal<ServerMsgOf<SMs>, Requires<Reactions>>, JournalError> => {
  type R = Requires<Reactions>
  const sync: AnySync = options.sync
  const { journal, server } = options
  const reactions: ReadonlyArray<Reaction<unknown, unknown>> = options.reactions ?? []
  const names = new Set<string>()
  for (const each of reactions) {
    if (each.sync !== options.sync)
      throw new Error(`Sync.serverJournal: reaction ${each.name} was declared for another contract`)
    if (names.has(each.name))
      throw new Error(`Sync.serverJournal: two reactions are named ${each.name}`)
    names.add(each.name)
  }
  checkAcyclic(reactions)
  const runsPerPass = options.runsPerPass ?? Number.MAX_SAFE_INTEGER
  if (!Number.isSafeInteger(runsPerPass) || runsPerPass < 1)
    throw new Error('Sync.serverJournal: runsPerPass must be a positive integer')

  const documentId = String(sync.documentId)
  const key = JournalDocumentId.make(documentId)
  const contract = sync.journalContract()
  const decodeMessage = Schema.decodeUnknownSync(sync.codec.message, { onExcessProperty: 'error' })
  const encodeMessage = Schema.encodeSync(sync.codec.message)
  const report = (diagnostic: SyncDiagnostic) => reportTo(options.diagnostics, diagnostic)
  const cursorName = (reaction: Reaction<unknown, unknown>) => `react/${reaction.name}`
  const handlerOf = (reaction: Reaction<unknown, unknown>): Handler => handlers.get(reaction)!

  /** An operation of the server's, written at `version`, as only Sync writes one. */
  const envelope = (
    replicaId: string,
    localSequence: number,
    baseCursor: number,
    message: unknown,
    version: number,
  ): WrittenOperation =>
    writtenEnvelope({
      protocolVersion: 1,
      schemaVersion: 1,
      documentId,
      replicaId,
      localSequence,
      opId: `${replicaId}:${localSequence}`,
      baseCursor,
      message,
      ...(version === 1 ? {} : { messageVersion: version }),
    })

  const invalid = (message: string, cause?: unknown) =>
    new InvalidOperationError({ message, ...(cause === undefined ? {} : { cause }) })

  const appendAsServer = (message: ServerMsgOf<SMs>, { key: fact }: { readonly key: string }) =>
    Effect.gen(function* () {
      if (fact.length === 0 || fact.length > MAX_KEY)
        return yield* invalid('A server key is a non-empty string of at most 200 characters')
      if (!sync.serverOnly(message))
        return yield* invalid('appendAsServer takes a Message only the server appends')
      const encoded = yield* Effect.try({
        try: () => encodeMessage(message),
        catch: cause => invalid('The Message does not encode', cause),
      })
      const replicaId = `${SERVER_REPLICA_PREFIX}k/${yield* sha256(fact)}`
      const written = envelope(replicaId, 1, 0, encoded, sync.codec.messageVersion)
      // Recorded before it is appended, so a repeat after a deploy that added
      // a step appends the bytes first written, which the journal compares.
      const recorded = yield* journal
        .runEffect(canonical(['server', documentId, fact]), Effect.succeed(written))
        .pipe(
          Effect.catchTag('EffectFailedError', error =>
            Effect.fail(new JournalError({ message: error.message, cause: error })),
          ),
        )
      const same =
        canonical(recorded) === canonical(written) ||
        Result.match(
          Result.try(() => contract.operation.decode(recorded)),
          {
            onFailure: () => false,
            onSuccess: operation => canonical(operation.message) === canonical(encoded),
          },
        )
      if (!same) return yield* new ServerKeyReusedError({ key: fact })
      return yield* journal.append(key, writtenEnvelope(recorded), server)
    })

  /** The run of one reaction on one committed operation: its answer, then its appends. */
  const runOnce = (
    reaction: Reaction<unknown, unknown>,
    epoch: string,
    committed: {
      readonly opId: string
      readonly sequence: number
      readonly actorId: string
      readonly message: unknown
    },
  ): Effect.Effect<void, RunFailed | JournalError, unknown> =>
    Effect.gen(function* () {
      const handler = handlerOf(reaction)
      const { opId, sequence } = committed
      // The ledger runs what it is given with no services: the handler's are this run's.
      const services = yield* Effect.context<unknown>()
      const triggerKey = yield* sha256(canonical(['react', documentId, reaction.name, opId]))
      const answer = Effect.suspend(() =>
        handler.run({
          message: committed.message,
          opId,
          sequence,
          actorId: committed.actorId,
          key: triggerKey,
        }),
      ).pipe(
        Effect.timeout(handler.timeout),
        Effect.provideContext(services),
        // A defect or an interruption is a failure the ledger records: its
        // `tapError` sees neither, and the record would stay pending.
        Effect.sandbox,
        Effect.mapError(handlerFailed),
        Effect.flatMap(returned =>
          Effect.gen(function* () {
            const messages: ReadonlyArray<unknown> = returned ?? []
            if (!Array.isArray(messages))
              return yield* new RunFailed({ permanent: true, reason: 'The answer is not a list' })
            if (messages.length > MAX_APPENDS)
              return yield* new RunFailed({
                permanent: true,
                reason: `The answer holds ${messages.length} Messages, past ${MAX_APPENDS}`,
              })
            const encoded = yield* Effect.forEach(messages, message =>
              Option.match(
                Option.filter(tagOf(message), tag => reaction.appends.has(tag)),
                {
                  onNone: () =>
                    Effect.fail(
                      new RunFailed({
                        permanent: true,
                        reason: 'The answer holds a Message its appends do not name',
                      }),
                    ),
                  onSome: () =>
                    Effect.try({
                      try: () => encodeMessage(message),
                      catch: () =>
                        new RunFailed({ permanent: true, reason: 'The answer does not encode' }),
                    }),
                },
              ),
            )
            return { messageVersion: sync.codec.messageVersion, messages: encoded }
          }),
        ),
      )
      const appendAll = Effect.gen(function* () {
        const recorded = yield* journal
          .runEffect(canonical(['react', documentId, reaction.name, opId, 'answer']), answer)
          .pipe(Effect.flatMap(decodeAnswer), Effect.mapError(asRunFailure))
        for (const [index, message] of recorded.messages.entries())
          yield* journal
            .append(
              key,
              envelope(
                `${SERVER_REPLICA_PREFIX}r/${reaction.name}/${index}`,
                sequence,
                sequence,
                message,
                recorded.messageVersion,
              ),
              server,
            )
            .pipe(
              Effect.catchTags({
                InvalidOperationError: error => Effect.fail(appendFailed(error)),
                OperationRejectedError: error => Effect.fail(appendFailed(error)),
                IdentityConflictError: error => Effect.fail(appendFailed(error)),
              }),
            )
      })
      // The epoch is in this key and not the answer's: after a reset the
      // appends run again in the new history, and the answer is reused.
      yield* journal
        .runEffect(
          canonical(['react', documentId, reaction.name, opId, 'finished', epoch]),
          appendAll,
        )
        .pipe(Effect.mapError(asRunFailure))
    })

  /** The pass of one reaction: from its cursor, a page, unless its backoff has not elapsed. */
  const passOf = (
    reaction: Reaction<unknown, unknown>,
    budget: number,
  ): Effect.Effect<
    { readonly runs: number; readonly next: Option.Option<Duration.Duration> },
    JournalError,
    unknown
  > =>
    Effect.gen(function* () {
      const name = cursorName(reaction)
      const handler = handlerOf(reaction)
      const tracked = yield* journal.cursors.settled(key, name)
      if (Option.isNone(tracked))
        return yield* Effect.die(
          new Error(`Sync.serverJournal: reaction ${reaction.name} was never registered`),
        )
      const { epoch, cursor, attempts, failedAt, firstFailedAt } = tracked.value
      const now = yield* Clock.currentTimeMillis
      const wait = Option.match(failedAt, {
        onNone: () => 0,
        onSome: at => at + backoff(attempts) - now,
      })
      if (attempts > 0 && wait > 0) return { runs: 0, next: Option.some(Duration.millis(wait)) }
      // The stored failures are the commit after the cursor's; once the pass
      // moves past it, a failure further on is that commit's first.
      let failed = { attempts, since: firstFailedAt }
      const stall = (
        runs: number,
        cause: string,
        at: Option.Option<{ opId: string; sequence: number }>,
      ) =>
        Effect.gen(function* () {
          yield* journal.cursors.stalled(key, name, epoch, now)
          yield* report(reactionFailed(documentId, reaction.name, at, cut(cause)))
          return { runs, next: Option.some(Duration.millis(backoff(failed.attempts + 1))) }
        })
      const page = yield* Effect.result(journal.read(key, cursor, { limit: PAGE }))
      if (Result.isFailure(page)) {
        const failure = page.failure
        if (failure._tag === 'CompactedCursorError') {
          yield* report(reactionSkipped(documentId, reaction.name, cursor, failure.floor))
          yield* journal.cursors.advance(key, name, epoch, Cursor.make(failure.floor))
          return { runs: 0, next: Option.some(Duration.zero) }
        }
        // A commit that will not read: no operation can be named, so nothing
        // parks, and the reaction waits on its backoff for a build that reads it.
        if (failure._tag === 'JournalError' && !unreadable(failure.cause)) return yield* failure
        return yield* stall(0, failure.message, Option.none())
      }
      let at = cursor
      let runs = 0
      const reach = (sequence: number) => {
        at = Cursor.make(sequence)
        failed = { attempts: 0, since: Option.none() }
      }
      const moved = () =>
        at > cursor ? journal.cursors.advance(key, name, epoch, at) : Effect.void
      for (const committed of page.success) {
        const message = decodeMessage(committed.operation.message)
        if (!Option.exists(tagOf(message), tag => reaction.on.has(tag))) {
          reach(committed.sequence)
          continue
        }
        if (runs >= budget) {
          yield* moved()
          return { runs, next: Option.some(Duration.zero) }
        }
        runs += 1
        const outcome = yield* Effect.result(
          runOnce(reaction, epoch, {
            opId: committed.opId,
            sequence: committed.sequence,
            actorId: committed.actorId,
            message,
          }),
        )
        if (Result.isSuccess(outcome)) {
          reach(committed.sequence)
          continue
        }
        const failure = outcome.failure
        // The store failing is not the run's fault: it counts toward nothing.
        if (failure._tag === 'JournalError') {
          yield* moved()
          return yield* failure
        }
        const tried = failed.attempts + 1
        const since = Option.getOrElse(failed.since, () => now)
        const parks =
          failure.permanent ||
          (tried >= handler.attempts && now - since >= Duration.toMillis(handler.parkAfter))
        const place = { opId: committed.opId, sequence: committed.sequence }
        if (!parks) {
          yield* moved()
          return yield* stall(runs, failure.reason, Option.some(place))
        }
        // Parked first: a crash before the cursor moves runs it once more,
        // and the second park changes nothing.
        yield* journal.cursors.park(key, {
          name,
          opId: committed.opId,
          epoch,
          sequence: committed.sequence,
          input: {
            operation: contract.operation.encode(committed.operation),
            actorId: committed.actorId,
          },
          error: failure.reason,
        })
        yield* report(
          reactionParked(
            documentId,
            reaction.name,
            committed.opId,
            committed.sequence,
            failure.reason,
          ),
        )
        reach(committed.sequence)
      }
      yield* moved()
      return {
        runs,
        next: page.success.length === PAGE ? Option.some(Duration.zero) : Option.none(),
      }
    })

  const earliest = (
    a: Option.Option<Duration.Duration>,
    b: Option.Option<Duration.Duration>,
  ): Option.Option<Duration.Duration> =>
    Option.isNone(a) ? b : Option.isNone(b) ? a : Option.some(Duration.min(a.value, b.value))

  const react = Effect.gen(function* () {
    let budget = runsPerPass
    let next = Option.none<Duration.Duration>()
    for (const each of reactions) {
      if (budget <= 0) return Option.some(Duration.zero)
      const pass = yield* passOf(each, budget).pipe(
        Effect.catch(error =>
          report(reactionFailed(documentId, each.name, Option.none(), cut(error.message))).pipe(
            Effect.as({ runs: 0, next: Option.some(JOURNAL_RETRY) }),
          ),
        ),
      )
      budget -= pass.runs
      next = earliest(next, pass.next)
    }
    return next
  }) as Effect.Effect<Option.Option<Duration.Duration>, never, R>

  const follow = Effect.gen(function* () {
    // One pending wake-up is enough: a pass reads everything after the cursor.
    const wake = yield* Queue.sliding<void>(1)
    yield* Effect.forkChild(
      Stream.runForEach(
        Stream.filter(journal.subscribe, changed => changed === documentId),
        () => Queue.offer(wake, undefined),
      ),
      { startImmediately: true },
    )
    while (true) {
      const next = yield* react
      yield* Option.match(next, {
        onNone: () => Queue.take(wake),
        onSome: delay => Effect.raceFirst(Queue.take(wake), Effect.sleep(delay)),
      })
    }
  }) as Effect.Effect<never, never, R>

  const settledThrough = Effect.gen(function* () {
    let lowest = yield* journal.cursor(key)
    for (const each of reactions) {
      const tracked = yield* journal.cursors.settled(key, cursorName(each))
      const at = Option.match(tracked, { onNone: () => Cursor.make(0), onSome: t => t.cursor })
      if (at < lowest) lowest = at
    }
    return lowest
  })

  const reactionOf = (name: string): Option.Option<Reaction<unknown, unknown>> =>
    Option.fromUndefinedOr(reactions.find(each => cursorName(each) === name))

  const parked = Effect.gen(function* () {
    const epoch = yield* journal.epoch(key)
    const rows = yield* journal.cursors.parked(key)
    return rows.flatMap((row): ReadonlyArray<Parked> =>
      row.name.startsWith('react/')
        ? [
            {
              reaction: row.name.slice('react/'.length),
              opId: row.opId,
              sequence: row.sequence,
              error: row.error,
              stale: row.epoch !== epoch,
            },
          ]
        : [],
    )
  })

  const retry = (which: Parked) =>
    Effect.gen(function* () {
      const name = `react/${which.reaction}`
      const epoch = yield* journal.epoch(key)
      const rows = yield* journal.cursors.parked(key)
      const row = rows.find(each => each.name === name && each.opId === which.opId)
      // Already resolved: nothing to do.
      if (row === undefined) return
      if (row.epoch !== epoch)
        return yield* new StaleParkedRunError({ reaction: which.reaction, opId: which.opId })
      const declared = reactionOf(name)
      if (Option.isNone(declared))
        return yield* Effect.fail(
          new Error(`Reaction ${which.reaction} is not declared on this journal`),
        )
      const trigger = yield* parkedTrigger(row)
      yield* runOnce(declared.value, epoch, trigger)
      yield* journal.cursors.unpark(key, name, row.opId)
    }) as Effect.Effect<void, unknown, R>

  const parkedTrigger = (row: ParkedRun) =>
    Effect.gen(function* () {
      const input = yield* decodeParkedInput(row.input)
      const operation = yield* Effect.try({
        try: () => contract.operation.decode(input.operation),
        catch: cause => new JournalError({ message: 'Could not read a parked run', cause }),
      })
      return {
        opId: row.opId,
        sequence: row.sequence,
        actorId: input.actorId,
        message: decodeMessage(operation.message),
      }
    })

  const dismiss = (which: Parked) =>
    journal.cursors.unpark(key, `react/${which.reaction}`, OpId.make(which.opId))

  return Effect.gen(function* () {
    for (const each of reactions) yield* journal.cursors.track(key, cursorName(each))
    return {
      appendAsServer,
      react,
      follow,
      settledThrough,
      parked,
      retry,
      dismiss,
    } satisfies ServerJournal<ServerMsgOf<SMs>, R>
  })
}

/** Whether the journal failed because a stored Message will not read, not because the store did. */
const unreadable = (cause: unknown): boolean =>
  cause instanceof UnreadableMessageError ||
  cause instanceof UnsupportedMessageVersionError ||
  cause instanceof AmbiguousMessageError

/** How long a reaction that has failed `attempts` times waits: 0.5 s doubling to 30 s. */
const backoff = (attempts: number): number =>
  attempts === 0 ? 0 : Math.min(BACKOFF_MAX, BACKOFF_BASE * 2 ** Math.min(attempts - 1, 16))

/** A failure of the ledger's record, or of the answer it holds, as the run's. */
const asRunFailure = (error: unknown): RunFailed | JournalError =>
  error instanceof RunFailed || error instanceof JournalError
    ? error
    : new RunFailed({
        permanent: false,
        reason: cut(error instanceof Error ? error.message : String(error)),
      })
