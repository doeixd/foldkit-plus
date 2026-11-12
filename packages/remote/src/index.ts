/**
 * `foldkit-remote` — normalized application-facing server state.
 *
 * The pure core (entities, selections, the store, the planner, connections,
 * live classification, optimistic layers) performs no I/O. The `Remote.*`
 * helpers that read or mutate go through the `RemoteClient` Effect service.
 */
export * from './client.js'
export type { RemoteResumePart } from './resume.js'
export {
  PredictionPart,
  type ExpectedDisagreements,
  type InsertUnpredicted,
  type LiveRefused,
  type OutboxUnreadable,
  type OutboxUnsaved,
  type PredictionMismatch,
  type ReadUnmade,
  type RemoteDiagnostic,
  type VerifyPredictions,
  type WriteUnheard,
} from './diagnostics.js'
// The channel Remote reports into, for a server or a test that uses Remote alone.
export { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
export * from './coalesce.js'
export { RemoteJsonAnswer, RemoteJsonRequest, type RemoteJsonSend } from './json.js'
export * from './connection.js'
export * from './entity.js'
export * from './edgeCache.js'
export * from './inspect.js'
export * from './liveState.js'
export * from './liveEvents.js'
export * from './matching.js'
export { placeIn, RowPlace } from './placement.js'
export {
  dismissQueued,
  emptyRefresh,
  failureOf,
  fieldMark,
  forgetRemote,
  initialRemoteModel,
  invalidateConnections,
  isFieldFailed,
  isLoading,
  isLoadingThrough,
  isQueryLoading,
  isRemoteMessage,
  noFailures,
  onlyOverlaid,
  overlaysOf,
  readsStale,
  refreshIsInFlight,
  refreshedAt,
  remoteMessageCases,
  remoteMessageSchema,
  remoteModelSchema,
  retentionRootsSchema,
  windowGrowthKey,
  withRefreshRequested,
  writeRead,
  type Evicted,
  type Failures,
  type PlacedOrder,
  type RefreshState,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteMessageTag,
  type RemoteModel,
  type StreamHealth,
} from './model.js'
export { updateRemote } from './update.js'
export * from './mutation.js'
export * from './ledger.js'
export * from './derived.js'
export * from './mutationDescriptor.js'
export * from './schema.js'
export * from './optimistic.js'
export {
  Capability,
  Installs,
  type Capabilities,
  type Install,
  type LayerCapability,
  type Lists,
  type ListQuery,
} from './capability.js'
export * from './plan.js'
export * from './policy.js'
export * from './query.js'
export * from './reaches.js'
export * from './relation.js'
export * from './remoteData.js'
export * from './writing.js'
export * from './requirement.js'
export * from './retain.js'
export * from './selection.js'
export * from './store.js'
export * from './wire.js'
export type {
  EntityLike,
  EntitySelection,
  Registered,
  SelectsEntity,
  RemoteDescriptor,
  BoundRemote,
  DomainMutateOptions,
  ActiveEntry,
  RemoteEntry,
  SubscriptionEntries,
  LiveDependencies,
  SubscriptionsOptions,
  RemoteWiring,
  WiringOptions,
  FailedWrite,
  FailedWriteOf,
  MutationStarted,
  RemoteDomain,
  FoldedMutationStarted,
  RemoteFold,
  ModelOfDomain,
  QueryRequirement,
  QueryWindowOptions,
  QueryOptions,
  QueryProjection,
  QueryInput,
  QueryEntity,
  ReadMeta,
  MutateOptions,
  RetainOptions,
  RetainEntryOptions,
  ObserveOptions,
  SatisfyOptions,
  LiveOptions,
  ReadDeadline,
  ReadDependencies,
  RefreshTarget,
  RefreshOptions,
} from './domain.js'
export { RemoteUnsatisfied } from './domain.js'
export * as Remote from './remote.js'
