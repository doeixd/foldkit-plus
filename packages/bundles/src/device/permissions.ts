/**
 * Permission states as a bundle factory: queried on placement, kept current
 * by each status object's `onchange`. A resource holds the status objects
 * (they cannot live in the Model); its queue feeds the subscription, and
 * release detaches every handler. An unknown permission name fails the
 * acquire; an unknown state string fails it too — both become `Failed`,
 * never Model facts.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const PermissionState = Schema.Literals(['granted', 'denied', 'prompt'])
export type PermissionState = typeof PermissionState.Type

export const PermissionsModel = Schema.Struct({
  states: Schema.Record(Schema.String, PermissionState),
  lastError: Schema.NullOr(Schema.String),
})
export type PermissionsModel = typeof PermissionsModel.Type

export const PermissionsMessage = defineMessageUnion({
  Snapshot: { states: Schema.Record(Schema.String, PermissionState) },
  Changed: { name: Schema.String, state: PermissionState },
  Cleared: {},
  Failed: { message: Schema.String },
})
export type PermissionsMessage = typeof PermissionsMessage.Type

/** A queried permission status; `onchange` fires while watched. */
export interface PermissionStatusHandle {
  readonly state: string
  onchange: (() => void) | null
}

/** The slice of the Permissions API the bundle needs. */
export interface PermissionsHandle {
  query(descriptor: { readonly name: string }): Promise<PermissionStatusHandle>
}

interface Acquired {
  readonly statuses: ReadonlyMap<string, PermissionStatusHandle>
  readonly events: Queue.Queue<PermissionsMessage>
}

/** The watched statuses, for the changes subscription. One assembly holds one. */
export const Watch = ManagedResource.tag<Acquired>()('permissions')

/** The watch service a placed Permissions bundle requires. */
export type WatchService = ManagedResource.ServiceOf<typeof Watch>

type WatchResources = Readonly<{
  watch: ManagedResource.Entry<
    PermissionsModel,
    PermissionsMessage,
    Option.Option<ReadonlyArray<string>>,
    Acquired,
    WatchService,
    (acquired: Acquired) => PermissionsMessage
  >
}>

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const readState = (state: string, name: string): PermissionState => {
  if (state !== 'granted' && state !== 'denied' && state !== 'prompt') {
    throw new Error(`unknown permission state for ${name}: ${state}`)
  }
  return state
}

export const permissions = <const Name extends string>(config: {
  readonly name: Name
  /** Read lazily so tests can substitute a double, like the SSE bundle. */
  readonly create?: ((navigator: Navigator) => PermissionsHandle | null) | undefined
}) => {
  const handle = (): PermissionsHandle | null => {
    if (typeof navigator === 'undefined') return null
    if (config.create !== undefined) return config.create(navigator)
    const api = navigator.permissions as unknown as PermissionsHandle | undefined
    return api ?? null
  }

  return Bundle.make<
    Name,
    PermissionsModel,
    PermissionsMessage,
    { readonly names: ReadonlyArray<string> },
    never,
    never,
    WatchService,
    void,
    WatchResources,
    {}
  >(config.name, {
    Model: PermissionsModel,
    Message: PermissionsMessage,
    args: Schema.Struct({ names: Schema.Array(Schema.String) }),
    init: () => ({ model: { states: {}, lastError: null } }),
    update: (model, message) =>
      PermissionsMessage.match<
        Update.ReturnWithOutMessage<PermissionsModel, PermissionsMessage, never>
      >(message, {
        Snapshot: ({ states }) => ({ model: { ...model, states: { ...states } } }),
        Changed: ({ name, state }) => ({
          model: { ...model, states: { ...model.states, [name]: state } },
        }),
        Cleared: () => ({ model: { ...model, states: {} } }),
        Failed: ({ message }) => ({ model: { ...model, lastError: message } }),
      }),
    resources: args =>
      ManagedResource.make<PermissionsModel, PermissionsMessage>()(entry => ({
        watch: entry(Schema.Option(Schema.Array(Schema.String)), {
          resource: Watch,
          modelToMaybeRequirements: () => Option.some([...args.names]),
          acquire: (names: ReadonlyArray<string>) =>
            Effect.gen(function* () {
              const api = handle()
              if (api === null) throw new Error('permissions are unavailable')
              const events = yield* Queue.unbounded<PermissionsMessage>()
              const statuses = new Map<string, PermissionStatusHandle>()
              // Offers run in arrival order; see the WebSocket bundle.
              let tail: Promise<void> = Promise.resolve()
              const offer = (message: PermissionsMessage) => {
                const run = () =>
                  Effect.runPromise(Queue.offer(events, message)).then(
                    () => undefined,
                    () => undefined,
                  )
                tail = tail.then(run, run)
              }
              for (const name of names) {
                const status = yield* Effect.tryPromise({
                  try: () => api.query({ name }),
                  catch: (error: unknown) => error,
                })
                status.onchange = () => {
                  try {
                    offer(
                      PermissionsMessage.Changed({ name, state: readState(status.state, name) }),
                    )
                  } catch {
                    // readState evaluates before offer runs, so a state the
                    // schema rejects lands here instead of crashing the handler.
                    offer(
                      PermissionsMessage.Failed({
                        message: `unknown permission state for ${name}`,
                      }),
                    )
                  }
                }
                // Validate now: an unknown initial state fails the acquire
                // before onAcquired could throw re-reading it.
                readState(status.state, name)
                statuses.set(name, status)
              }
              return { statuses, events }
            }),
          onAcquired: ({ statuses }) => {
            const states: Record<string, PermissionState> = {}
            for (const [name, status] of statuses) {
              states[name] = readState(status.state, name)
            }
            return PermissionsMessage.Snapshot({ states })
          },
          onReleased: () => PermissionsMessage.Cleared(),
          onAcquireError: error => PermissionsMessage.Failed({ message: failMessage(error) }),
          release: ({ statuses, events }) =>
            Effect.asVoid(
              Effect.andThen(
                Effect.sync(() => {
                  for (const status of statuses.values()) status.onchange = null
                }),
                Queue.shutdown(events),
              ),
            ),
        }),
      })),
    subscriptions: (): Subscription.Subscriptions<
      PermissionsModel,
      PermissionsMessage,
      WatchService
    > =>
      Subscription.make<PermissionsModel, PermissionsMessage, WatchService>()(() => ({
        // No model gate: the queue outlives every state change, and release
        // ends the stream through teardown, not through dependencies.
        changes: Subscription.persistent(
          Stream.unwrap(
            Effect.matchEffect(Watch.get, {
              // Released between placement and attach: end quietly.
              onFailure: () => Effect.succeed(Stream.empty),
              onSuccess: ({ events }) => Effect.succeed(Stream.fromQueue(events)),
            }),
          ),
        ),
      })),
  })
}
