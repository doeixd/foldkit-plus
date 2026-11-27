/**
 * MetaKit semantic developer tooling (`metakit/tooling`, #646 P0).
 *
 * Shared Effect-native `SemanticIndex` service and `semanticDiff` over
 * MetaKit `Expr` and `Transition` definitions — standalone with zero Vite,
 * editor, or UI runtime dependencies.
 *
 * Distinguishes logical `DeclarationId` (stable across non-semantic edits),
 * `ArtifactFingerprint` (content identity from `metakit/artifact`), and
 * `SourceOrigin` (provenance excluded from semantic fingerprints).
 */
import { Context, Effect, Layer, Match, Option, Schema } from 'effect'
import * as Artifact from './artifact.js'
import * as Expr from './expr.js'
import * as Language from './language.js'
import type * as Node from './node.js'
import { format as formatPath, type Expr as ExprType } from './path.js'
import type * as Transition from './transition.js'

// ---------------------------------------------------------------------------
// Identity, provenance & definitions
// ---------------------------------------------------------------------------

/** Logical declaration identifier (e.g. `"Account.canWithdraw"`), stable across non-semantic edits. */
export type DeclarationId = string

/** Optional source provenance; excluded from `ArtifactFingerprint`. */
export interface SourceOrigin {
  readonly uri: string
  readonly line: number
  readonly column: number
  readonly endLine?: number
  readonly endColumn?: number
}

export interface DefinitionOptions {
  readonly dependsOn?: ReadonlyArray<DeclarationId>
  readonly origin?: SourceOrigin
  readonly description?: string
}

export type DefinitionEntry =
  | {
      readonly _tag: 'Expr'
      readonly id: DeclarationId
      readonly expr: ExprType<never, unknown>
      readonly dependsOn: ReadonlyArray<DeclarationId>
      readonly origin: Option.Option<SourceOrigin>
      readonly description: Option.Option<string>
    }
  | {
      readonly _tag: 'Transition'
      readonly id: DeclarationId
      readonly transition: Transition.Transition<never, never, unknown, unknown>
      readonly dependsOn: ReadonlyArray<DeclarationId>
      readonly origin: Option.Option<SourceOrigin>
      readonly description: Option.Option<string>
    }

/** Constructors for named MetaKit definitions indexed by `SemanticIndex`. */
export const Definition = {
  expr: (
    id: DeclarationId,
    expr: ExprType<never, unknown>,
    options?: DefinitionOptions,
  ): DefinitionEntry => ({
    _tag: 'Expr',
    id,
    expr,
    dependsOn: options?.dependsOn ?? [],
    origin: Option.fromUndefinedOr(options?.origin),
    description: Option.fromUndefinedOr(options?.description),
  }),
  transition: <S, I, Emit, Supplied>(
    id: DeclarationId,
    transition: Transition.Transition<S, I, Emit, Supplied>,
    options?: DefinitionOptions,
  ): DefinitionEntry => ({
    _tag: 'Transition',
    id,
    transition: transition as unknown as Transition.Transition<never, never, unknown, unknown>,
    dependsOn: options?.dependsOn ?? [],
    origin: Option.fromUndefinedOr(options?.origin),
    description: Option.fromUndefinedOr(options?.description),
  }),
} as const

// ---------------------------------------------------------------------------
// Typed errors & report shapes
// ---------------------------------------------------------------------------

/** Two definitions claimed the same explicit `DeclarationId`. */
export class DuplicateDeclarationError extends Schema.TaggedError<DuplicateDeclarationError>()(
  'DuplicateDeclarationError',
  {
    id: Schema.String,
    detail: Schema.String,
  },
) {}

/** Lookup of a `DeclarationId` not present in the index. */
export class UnknownDeclarationError extends Schema.TaggedError<UnknownDeclarationError>()(
  'UnknownDeclarationError',
  {
    id: Schema.String,
    detail: Schema.String,
  },
) {}

export interface DefinitionInfo {
  readonly id: DeclarationId
  readonly kind: 'expr' | 'transition'
  /** Content fingerprint (`Option.none()` when non-portable, e.g. contains `Opaque`). */
  readonly fingerprint: Option.Option<Artifact.ArtifactFingerprint>
  readonly portable: boolean
  readonly reads: ReadonlyArray<string>
  readonly writes: ReadonlyArray<string>
  readonly requiredCoreOps: ReadonlyArray<Node.CoreOpId>
  readonly requiredForeignOps: ReadonlyArray<string>
  readonly dependsOn: ReadonlyArray<DeclarationId>
  readonly origin: Option.Option<SourceOrigin>
  readonly description: Option.Option<string>
}

export interface Reference {
  readonly from: DeclarationId
  readonly kind: 'depends-on' | 'shared-read' | 'writes-read-field'
  readonly field?: string
}

export interface DependencyReport {
  readonly id: DeclarationId
  readonly direct: ReadonlyArray<DeclarationId>
  readonly transitive: ReadonlyArray<DeclarationId>
  readonly cycles: ReadonlyArray<ReadonlyArray<DeclarationId>>
  readonly reads: ReadonlyArray<string>
  readonly writes: ReadonlyArray<string>
}

export interface ImpactReport {
  readonly changed: ReadonlyArray<DeclarationId>
  readonly affected: ReadonlyArray<DeclarationId>
  readonly unaffected: ReadonlyArray<DeclarationId>
}

export interface ToolingDiagnostic {
  readonly code: 'MK001' | 'MK002' | 'MK003' | 'MK004'
  readonly severity: 'error' | 'warning'
  readonly id: DeclarationId
  readonly message: string
  readonly origin: Option.Option<SourceOrigin>
}

export interface ExplainReport {
  readonly id: DeclarationId
  readonly kind: 'expr' | 'transition'
  readonly fingerprint: Option.Option<Artifact.ArtifactFingerprint>
  readonly portable: boolean
  readonly supported: boolean
  readonly reads: ReadonlyArray<string>
  readonly writes: ReadonlyArray<string>
  readonly requiredCoreOps: ReadonlyArray<Node.CoreOpId>
  readonly requiredForeignOps: ReadonlyArray<string>
  readonly unsupportedNodes: ReadonlyArray<Language.UnsupportedReason>
  readonly origin: Option.Option<SourceOrigin>
}

// ---------------------------------------------------------------------------
// SemanticIndex Effect service
// ---------------------------------------------------------------------------

export interface SemanticIndexService {
  readonly list: () => Effect.Effect<ReadonlyArray<DefinitionInfo>>
  readonly definition: (id: DeclarationId) => Effect.Effect<DefinitionInfo, UnknownDeclarationError>
  readonly references: (
    id: DeclarationId,
  ) => Effect.Effect<ReadonlyArray<Reference>, UnknownDeclarationError>
  readonly dependencies: (
    id: DeclarationId,
  ) => Effect.Effect<DependencyReport, UnknownDeclarationError>
  readonly impact: (changedIds: ReadonlyArray<DeclarationId>) => Effect.Effect<ImpactReport>
  readonly diagnostics: (
    target?: Language.ReadinessTarget,
  ) => Effect.Effect<ReadonlyArray<ToolingDiagnostic>>
  readonly explain: (
    id: DeclarationId,
    target: Language.ReadinessTarget,
  ) => Effect.Effect<ExplainReport, UnknownDeclarationError>
  readonly toMermaid: () => Effect.Effect<string>
}

/** Effect `Context.Service` providing semantic analysis over indexed MetaKit definitions. */
export class SemanticIndex extends Context.Service<SemanticIndex, SemanticIndexService>()(
  'metakit/SemanticIndex',
) {}

const uniqueSorted = (values: Iterable<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort()

const readsOfExpr = (expr: ExprType<never, unknown>): ReadonlyArray<string> =>
  Option.match(Expr.reads(expr), {
    onNone: () => ['*'],
    onSome: paths => paths.map(formatPath),
  })

const analyzeEntry = (entry: DefinitionEntry): Effect.Effect<DefinitionInfo> =>
  Match.value(entry).pipe(
    Match.tags({
      Expr: ({ id, expr, dependsOn, origin, description }) =>
        Effect.gen(function* () {
          const ready = yield* Language.readiness(expr, { _tag: 'portable' })
          const fp: Option.Option<Artifact.ArtifactFingerprint> = ready.portable
            ? yield* Artifact.fingerprint(expr).pipe(
                Effect.map(Option.some),
                Effect.catch(() => Effect.succeed(Option.none())),
              )
            : Option.none()
          const reads = uniqueSorted(readsOfExpr(expr))
          return {
            id,
            kind: 'expr' as const,
            fingerprint: fp,
            portable: ready.portable,
            reads,
            writes: [],
            requiredCoreOps: ready.requiredCoreOps,
            requiredForeignOps: ready.requiredForeignOps,
            dependsOn: uniqueSorted(dependsOn),
            origin,
            description,
          }
        }),
      Transition: ({ id, transition, dependsOn, origin, description }) =>
        Effect.gen(function* () {
          const guardReady = yield* Language.readiness(transition.when, { _tag: 'portable' })
          const fp: Option.Option<Artifact.ArtifactFingerprint> = guardReady.portable
            ? yield* Artifact.fingerprint(transition.when).pipe(
                Effect.map(Option.some),
                Effect.catch(() => Effect.succeed(Option.none())),
              )
            : Option.none()
          const reads = uniqueSorted([
            ...readsOfExpr(transition.when),
            ...transition.writes.flatMap(w => readsOfExpr(w.value)),
          ])
          const writes = uniqueSorted(
            transition.writes.map(w => formatPath(['state', ...w.target])),
          )
          return {
            id,
            kind: 'transition' as const,
            fingerprint: fp,
            portable: guardReady.portable,
            reads,
            writes,
            requiredCoreOps: guardReady.requiredCoreOps,
            requiredForeignOps: guardReady.requiredForeignOps,
            dependsOn: uniqueSorted(dependsOn),
            origin,
            description,
          }
        }),
    }),
    Match.exhaustive,
  )

/**
 * Build an in-memory `SemanticIndexService` from explicit `DefinitionEntry`s.
 * Rejects duplicate `DeclarationId`s with `DuplicateDeclarationError`.
 */
export const makeIndex = (
  entries: ReadonlyArray<DefinitionEntry>,
): Effect.Effect<SemanticIndexService, DuplicateDeclarationError> =>
  Effect.gen(function* () {
    const rawById = new Map<DeclarationId, DefinitionEntry>()
    for (const entry of entries) {
      if (rawById.has(entry.id)) {
        return yield* Effect.fail(
          new DuplicateDeclarationError({
            id: entry.id,
            detail: `duplicate declaration id "${entry.id}"`,
          }),
        )
      }
      rawById.set(entry.id, entry)
    }

    const infos = new Map<DeclarationId, DefinitionInfo>()
    for (const entry of entries) {
      infos.set(entry.id, yield* analyzeEntry(entry))
    }

    const reverseDeps = new Map<DeclarationId, Set<DeclarationId>>()
    for (const info of infos.values()) {
      for (const dep of info.dependsOn) {
        let rev = reverseDeps.get(dep)
        if (rev === undefined) {
          rev = new Set()
          reverseDeps.set(dep, rev)
        }
        rev.add(info.id)
      }
    }

    const requireInfo = (
      id: DeclarationId,
    ): Effect.Effect<DefinitionInfo, UnknownDeclarationError> => {
      const found = infos.get(id)
      return found === undefined
        ? Effect.fail(new UnknownDeclarationError({ id, detail: `unknown declaration "${id}"` }))
        : Effect.succeed(found)
    }

    const walkDeps = (
      start: DeclarationId,
    ): {
      readonly transitive: ReadonlyArray<DeclarationId>
      readonly cycles: ReadonlyArray<ReadonlyArray<DeclarationId>>
    } => {
      const visited = new Set<DeclarationId>()
      const onStack: Array<DeclarationId> = []
      const onStackSet = new Set<DeclarationId>()
      const cycles: Array<ReadonlyArray<DeclarationId>> = []

      const dfs = (current: DeclarationId): void => {
        const info = infos.get(current)
        if (info === undefined) return
        onStack.push(current)
        onStackSet.add(current)
        for (const dep of info.dependsOn) {
          if (onStackSet.has(dep)) {
            const idx = onStack.indexOf(dep)
            cycles.push([...onStack.slice(idx), dep])
          } else if (!visited.has(dep)) {
            visited.add(dep)
            dfs(dep)
          }
        }
        onStack.pop()
        onStackSet.delete(current)
      }

      dfs(start)
      return { transitive: uniqueSorted(visited), cycles }
    }

    const walkDownstream = (seeds: ReadonlyArray<DeclarationId>): ReadonlySet<DeclarationId> => {
      const affected = new Set<DeclarationId>()
      const queue = [...seeds]
      while (queue.length > 0) {
        const current = queue.shift()!
        const rev = reverseDeps.get(current)
        if (rev === undefined) continue
        for (const next of rev) {
          if (!affected.has(next)) {
            affected.add(next)
            queue.push(next)
          }
        }
      }
      return affected
    }

    return {
      list: () => Effect.succeed([...infos.values()].sort((a, b) => (a.id < b.id ? -1 : 1))),
      definition: requireInfo,
      references: id =>
        requireInfo(id).pipe(
          Effect.map(target => {
            const refs: Array<Reference> = []
            const targetReads = new Set(target.reads)
            for (const other of infos.values()) {
              if (other.id === id) continue
              if (other.dependsOn.includes(id)) {
                refs.push({ from: other.id, kind: 'depends-on' })
              }
              for (const w of other.writes) {
                if (targetReads.has(w)) {
                  refs.push({ from: other.id, kind: 'writes-read-field', field: w })
                }
              }
              for (const r of other.reads) {
                if (targetReads.has(r)) {
                  refs.push({ from: other.id, kind: 'shared-read', field: r })
                }
              }
            }
            return refs
          }),
        ),
      dependencies: id =>
        requireInfo(id).pipe(
          Effect.map(info => {
            const { transitive, cycles } = walkDeps(id)
            return {
              id,
              direct: info.dependsOn,
              transitive,
              cycles,
              reads: info.reads,
              writes: info.writes,
            }
          }),
        ),
      impact: changedIds =>
        Effect.sync(() => {
          const changedSet = new Set(changedIds)
          const downstream = walkDownstream(changedIds)
          const allAffected = new Set([...changedSet, ...downstream])
          const unaffected: Array<DeclarationId> = []
          for (const id of infos.keys()) {
            if (!allAffected.has(id)) unaffected.push(id)
          }
          return {
            changed: uniqueSorted(changedSet),
            affected: uniqueSorted(downstream),
            unaffected: unaffected.sort(),
          }
        }),
      diagnostics: target =>
        Effect.gen(function* () {
          const diags: Array<ToolingDiagnostic> = []
          for (const info of infos.values()) {
            for (const dep of info.dependsOn) {
              if (!infos.has(dep)) {
                diags.push({
                  code: 'MK001',
                  severity: 'error',
                  id: info.id,
                  message: `declaration "${info.id}" depends on unknown declaration "${dep}"`,
                  origin: info.origin,
                })
              }
            }
            const { cycles } = walkDeps(info.id)
            for (const cycle of cycles) {
              diags.push({
                code: 'MK002',
                severity: 'warning',
                id: info.id,
                message: `dependency cycle detected: ${cycle.join(' -> ')}`,
                origin: info.origin,
              })
            }
            if (!info.portable) {
              diags.push({
                code: 'MK003',
                severity: 'warning',
                id: info.id,
                message: `declaration "${info.id}" is outside the portable subset (opaque or non-portable literal)`,
                origin: info.origin,
              })
            }
            if (target !== undefined) {
              const raw = rawById.get(info.id)!
              const expr = Match.value(raw).pipe(
                Match.tags({
                  Expr: ({ expr: e }) => e,
                  Transition: ({ transition: t }) => t.when,
                }),
                Match.exhaustive,
              )
              const ready = yield* Language.readiness(expr, target)
              for (const u of ready.unsupportedNodes) {
                diags.push({
                  code: 'MK004',
                  severity: 'error',
                  id: info.id,
                  message: `${u.path}: ${u.detail}`,
                  origin: info.origin,
                })
              }
            }
          }
          return diags
        }),
      explain: (id, target) =>
        requireInfo(id).pipe(
          Effect.flatMap(info => {
            const raw = rawById.get(id)!
            const expr = Match.value(raw).pipe(
              Match.tags({
                Expr: ({ expr: e }) => e,
                Transition: ({ transition: t }) => t.when,
              }),
              Match.exhaustive,
            )
            return Language.readiness(expr, target).pipe(
              Effect.map(ready => ({
                id: info.id,
                kind: info.kind,
                fingerprint: info.fingerprint,
                portable: ready.portable,
                supported: ready.supported,
                reads: info.reads,
                writes: info.writes,
                requiredCoreOps: ready.requiredCoreOps,
                requiredForeignOps: ready.requiredForeignOps,
                unsupportedNodes: ready.unsupportedNodes,
                origin: info.origin,
              })),
            )
          }),
        ),
      toMermaid: () =>
        Effect.sync(() => {
          const lines: Array<string> = ['flowchart TD']
          const sorted = [...infos.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
          const nodeKey = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')
          for (const info of sorted) {
            lines.push(`  ${nodeKey(info.id)}["${info.id} (${info.kind})"]`)
          }
          for (const info of sorted) {
            for (const dep of info.dependsOn) {
              lines.push(`  ${nodeKey(info.id)} --> ${nodeKey(dep)}`)
            }
          }
          return lines.join('\n')
        }),
    }
  })

/** Provide a `SemanticIndex` layer built from `entries`. */
export const layer = (
  entries: ReadonlyArray<DefinitionEntry>,
): Layer.Layer<SemanticIndex, DuplicateDeclarationError> =>
  Layer.effect(SemanticIndex, makeIndex(entries))

// ---------------------------------------------------------------------------
// Semantic diff
// ---------------------------------------------------------------------------

export interface ChangedDefinition {
  readonly id: DeclarationId
  readonly beforeFingerprint: Option.Option<Artifact.ArtifactFingerprint>
  readonly afterFingerprint: Option.Option<Artifact.ArtifactFingerprint>
  readonly readsChanged: boolean
  readonly writesChanged: boolean
}

export interface SemanticDiffReport {
  readonly added: ReadonlyArray<DeclarationId>
  readonly removed: ReadonlyArray<DeclarationId>
  readonly changed: ReadonlyArray<ChangedDefinition>
  readonly unchanged: ReadonlyArray<DeclarationId>
  /** Downstream declarations in `after` transitively impacted by `changed` or `removed`. */
  readonly affectedDownstream: ReadonlyArray<DeclarationId>
  /** Declarations in `after` whose fingerprint and transitive dependencies are unchanged. */
  readonly unaffectedCached: ReadonlyArray<DeclarationId>
}

const sameList = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Compare two `SemanticIndexService` snapshots structurally by `DeclarationId`
 * and `ArtifactFingerprint`, computing added/removed/changed definitions and
 * exact downstream invalidation sets.
 */
export const semanticDiff = (
  before: SemanticIndexService,
  after: SemanticIndexService,
): Effect.Effect<SemanticDiffReport> =>
  Effect.gen(function* () {
    const beforeList = yield* before.list()
    const afterList = yield* after.list()
    const beforeMap = new Map(beforeList.map(d => [d.id, d]))
    const afterMap = new Map(afterList.map(d => [d.id, d]))

    const added: Array<DeclarationId> = []
    const removed: Array<DeclarationId> = []
    const changed: Array<ChangedDefinition> = []
    const unchanged: Array<DeclarationId> = []

    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) removed.push(id)
    }

    for (const [id, next] of afterMap.entries()) {
      const prev = beforeMap.get(id)
      if (prev === undefined) {
        added.push(id)
        continue
      }
      const sameFp =
        Option.isSome(prev.fingerprint) &&
        Option.isSome(next.fingerprint) &&
        prev.fingerprint.value === next.fingerprint.value
      const readsChanged = !sameList(prev.reads, next.reads)
      const writesChanged = !sameList(prev.writes, next.writes)
      if (sameFp && !readsChanged && !writesChanged && prev.kind === next.kind) {
        unchanged.push(id)
      } else {
        changed.push({
          id,
          beforeFingerprint: prev.fingerprint,
          afterFingerprint: next.fingerprint,
          readsChanged,
          writesChanged,
        })
      }
    }

    const seeds = [...changed.map(c => c.id), ...removed]
    const impactReport = yield* after.impact(seeds)
    const invalidated = new Set([...added, ...changed.map(c => c.id), ...impactReport.affected])
    const unaffectedCached = afterList
      .map(d => d.id)
      .filter(id => !invalidated.has(id))
      .sort()

    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort((a, b) => (a.id < b.id ? -1 : 1)),
      unchanged: unchanged.sort(),
      affectedDownstream: impactReport.affected,
      unaffectedCached,
    }
  })
