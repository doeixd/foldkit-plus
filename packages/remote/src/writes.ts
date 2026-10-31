/**
 * The write capability (#378): `Data.mutate` and `Data.retry`, with what a
 * write predicts, refuses and shows before its answer. A Mutation descriptor
 * carries it (`[Installs]`), so a domain that registers none never loads it.
 */
import { Clock, Effect, Option, Schema } from 'effect'
import type * as Domain from 'foldkit-entity'
import { askedUnion } from './active.js'
import {
  Capability,
  visibleOf,
  type Install,
  type WriteCapability,
  type WriteContext,
  type WriteMethods,
} from './capability.js'
import { mintOperation, mutateRemote, remoteError, type RemoteClient } from './client.js'
import { installLayers } from './layers.js'
import { mutationStatus } from './ledger.js'
import { reduceIn, type RemoteMessage, type RemoteModel } from './model.js'
import { brokenByWrite, forbiddenByWrite, foreseenOfWrite, predictionOfWrite } from './mutation.js'
import type { OptimisticOperation } from './optimistic.js'
import { operationOf } from './outbox.js'
import { assertRegistered } from './registered.js'
import type { RemoteError } from './remoteData.js'
import type { RelationRequirement } from './requirement.js'
import { shownOf } from './shown.js'
import { RemoteForbidden } from './wire.js'

const writes: WriteCapability = {
  bind: <AppModel, Store extends RemoteModel>(
    context: WriteContext<AppModel, Store>,
  ): WriteMethods<AppModel> => {
    /**
     * What the reader is shown of each entity in `model`, and what the write
     * itself shows (`predicted`) or foresees on its row (`write`), for its
     * answer to carry (#245, #265, #370).
     */
    const shownAt = (
      model: AppModel,
      predicted: ReadonlyArray<OptimisticOperation>,
      write: Domain.AnyWrite | undefined,
    ): ReadonlyArray<RelationRequirement> =>
      shownOf(
        askedUnion(
          [...context.readers()].flatMap(resolvedAt =>
            resolvedAt(model).map(({ projection }) => projection),
          ),
        ),
        predicted,
        write === undefined ? [] : foreseenOfWrite(write),
      )
    /**
     * A durable write's request id, which is its operation id: this page's
     * session and the next in its sequence, unique across tabs and loads. Only
     * a retry names one, and only one the outbox holds.
     */
    const durableId = (
      remote: RemoteModel,
      mutation: string,
      given: string | undefined,
    ): string => {
      if (given !== undefined) {
        if (remote.outbox.queue.some(queued => operationOf(queued) === given)) return given
        throw new Error(
          `[foldkit-remote] Data.mutate(${mutation}, { durable: true, requestId: "${given}" }): a durable write is named by the outbox; pass no requestId`,
        )
      }
      return Option.match(remote.outbox.session, {
        onNone: () => {
          throw new Error(
            `[foldkit-remote] Data.mutate(${mutation}, { durable: true }) before the outbox's restore has run: start init from Data.outbox(…).restore(model), as the runtime's flags, so a durable write has an id no other tab or page load uses`,
          )
        },
        onSome: session => `${session}-${remote.mutations.sequence + 1}`,
      })
    }

    const mutate: WriteMethods<AppModel>['mutate'] = (model, mutation, input, options = {}) => {
      assertRegistered(
        context.bound,
        'Mutation',
        context.bound.definition.registry.mutations,
        mutation.name,
      )
      const remote = context.bound.store.get(model)
      const durable = options.durable === true
      if (durable && options.timeout !== undefined)
        throw new Error(
          `[foldkit-remote] Data.mutate(${mutation.name}, { durable: true, timeout }): the outbox sends a durable write under the client's timeout; pass none`,
        )
      const requestId = durable
        ? durableId(remote, mutation.name, options.requestId)
        : (options.requestId ?? `${context.bound.contract.name}-${remote.mutations.sequence + 1}`)
      const tempId = `${requestId}.tmp`
      // A retry of a failed request sends the operation id it was first sent with.
      const known = Option.fromUndefinedOr(remote.mutations.operations.get(requestId))
      // A declared write shows what it writes until the server answers; one given wins.
      const viewer = context.viewerOf(model)
      const visible = visibleOf(context.bound[Capability], remote, context.bound.operators)
      const predicted =
        mutation.write === undefined
          ? undefined
          : predictionOfWrite(mutation.write, input, options.keys, {
              derived: context.bound.definition.registry.derived,
              store: visible,
              viewer,
              now: Option.fromUndefinedOr(options.now),
            })
      // A write the client can tell the server refuses is refused here, as the
      // server would refuse it, and nothing is sent or shown: one its held `may`
      // forbids, then, as the server decides in that order, one whose row
      // breaks an invariant.
      const write = mutation.write
      const refused =
        write === undefined || options.optimistic !== undefined
          ? Option.none()
          : Option.orElse(
              Option.map(
                forbiddenByWrite(write, input, options.keys, visible),
                ({ reason }): RemoteError =>
                  remoteError(
                    new RemoteForbidden({
                      message: Option.getOrElse(reason, () => 'Forbidden'),
                      ...Option.match(reason, {
                        onNone: () => ({}),
                        onSome: said => ({ reason: said }),
                      }),
                    }),
                  ),
              ),
              () =>
                Option.map(
                  brokenByWrite(
                    write,
                    input,
                    options.keys,
                    { viewer, now: Option.fromUndefinedOr(options.now) },
                    visible,
                    context.bound.operators,
                  ),
                  (held): RemoteError =>
                    remoteError({
                      _tag: 'RemoteMutationError',
                      message: held.message,
                      refusal: Schema.encodeUnknownSync(mutation.Refusal)({
                        _tag: 'Invalid',
                        entity: Option.some(held.entity),
                        rule: Option.some(held.id),
                        message: held.message,
                        path: held.path,
                      }),
                    }),
                ),
            )
      const optimistic = Option.isSome(refused)
        ? undefined
        : typeof options.optimistic === 'function'
          ? options.optimistic({ requestId, tempId })
          : (options.optimistic ?? predicted)
      // A write refused where it is made is settled at once, durable or not.
      const queued = durable && Option.isNone(refused)
      const started = reduceIn(context.bound[Capability], remote, {
        _tag: 'MutationStarted',
        requestId,
        ...(optimistic === undefined ? {} : { optimistic }),
        ...(Option.isSome(viewer) ? { viewer: viewer.value } : {}),
        write: {
          mutation: mutation.name,
          input,
          ...(options.keys === undefined ? {} : { keys: options.keys }),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(queued
            ? {
                // Encoded here, so an input its Mutation cannot encode throws at the call.
                durable: {
                  input: Schema.encodeUnknownSync(mutation.Input)(input),
                  shown: shownAt(model, optimistic ?? [], mutation.write),
                },
              }
            : {}),
        },
      })
      const startedModel = context.bound.store.set(model, started as Store)
      return {
        model: startedModel,
        requestId,
        tempId,
        command: {
          name: `Remote.mutate(${mutation.name})`,
          args: { requestId },
          // Minted where the Command runs, so `update` stays pure; a retry finds it in the Model.
          effect: Effect.flatMap(
            Effect.sync(() => Option.getOrElse(known, mintOperation)),
            (operation): Effect.Effect<RemoteMessage, never, RemoteClient> =>
              queued
                ? // The outbox sends it, once its store holds it.
                  Effect.succeed({ _tag: 'MutationQueued', requestId })
                : Option.isSome(refused)
                  ? Effect.succeed({
                      _tag: 'MutationFailed',
                      requestId,
                      error: refused.value,
                      operation,
                    })
                  : mutateRemote(mutation, input, requestId, {
                      keys: options.keys,
                      operation,
                      shown: shownAt(startedModel, optimistic ?? [], mutation.write),
                      now: options.now,
                      timeout: options.timeout,
                    }).pipe(
                      Effect.matchEffect({
                        onFailure: error =>
                          Effect.succeed<RemoteMessage>({
                            _tag: 'MutationFailed',
                            requestId,
                            error: remoteError(error),
                            operation,
                          }),
                        // Dated when it lands, by the clock a test pins.
                        onSuccess: outcome =>
                          Effect.map(Clock.currentTimeMillis, (at): RemoteMessage => ({
                            _tag: 'MutationSucceeded',
                            requestId,
                            entities: outcome.entities,
                            connections: outcome.connections,
                            deleted: outcome.deleted,
                            ...(outcome.read === undefined ? {} : { read: outcome.read }),
                            now: at,
                          })),
                      }),
                    ),
          ),
        },
      }
    }

    const retry: WriteMethods<AppModel>['retry'] = (model, requestId) => {
      const { mutations, outbox } = context.bound.store.get(model)
      const write = mutations.writes.get(requestId)
      if (write === undefined || mutationStatus(mutations, requestId)._tag !== 'Failed')
        return Option.none()
      return Option.some(
        mutate(model, context.registeredMutation(write.mutation), write.input, {
          requestId,
          optimistic: write.optimistic,
          keys: write.keys,
          // The same time, so the server stores what the retry shows again.
          now: Option.getOrUndefined(write.now),
          durable: outbox.queue.some(queued => operationOf(queued) === requestId),
        }),
      )
    }

    return { mutate, retry }
  },
}

/** Installs the write capability, and the layer capability a write's pending layer needs. */
export const installWrites: Install = capabilities => {
  installLayers(capabilities)
  capabilities.writes = Option.some(writes)
}
