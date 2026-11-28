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
import { wrap } from './ops/core.js'
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

const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const sha256Hex = (text: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const bytes = new TextEncoder().encode(text)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  })

const readsOfExpr = (expr: ExprType<never, unknown>): ReadonlyArray<string> =>
  Option.match(Expr.reads(expr), {
    onNone: () => ['*'],
    onSome: paths => paths.map(formatPath),
  })

const entrySubExprs = (
  entry: DefinitionEntry,
): ReadonlyArray<{ readonly label: string; readonly expr: ExprType<never, unknown> }> =>
  Match.value(entry).pipe(
    Match.tags({
      Expr: ({ expr }) => [{ label: 'expr', expr }],
      Transition: ({ transition }) => {
        const list: Array<{ readonly label: string; readonly expr: ExprType<never, unknown> }> = [
          { label: 'when', expr: transition.when },
        ]
        for (const w of transition.writes) {
          list.push({ label: `write:${formatPath(w.target)}`, expr: w.value })
        }
        for (const e of transition.emits) {
          if (Option.isSome(e.when)) {
            list.push({ label: `emit:${e.tag}:when`, expr: wrap<never, unknown>(e.when.value) })
          }
          for (const [field, node] of e.fields) {
            list.push({ label: `emit:${e.tag}:${field}`, expr: wrap<never, unknown>(node) })
          }
        }
        if (transition.ensures !== undefined && Option.isSome(transition.ensures)) {
          list.push({ label: 'ensures', expr: transition.ensures.value })
        }
        return list
      },
    }),
    Match.exhaustive,
  )

const readinessForEntry = (
  entry: DefinitionEntry,
  target: Language.ReadinessTarget,
): Effect.Effect<Language.ReadinessReport> =>
  Effect.gen(function* () {
    const subs = entrySubExprs(entry)
    let portable = true
    const coreOps = new Set<Node.CoreOpId>()
    const foreignOps = new Set<string>()
    const unsupported: Array<Language.UnsupportedReason> = []
    for (const { label, expr } of subs) {
      const r = yield* Language.readiness(expr, target)
      if (!r.portable) portable = false
      for (const op of r.requiredCoreOps) coreOps.add(op)
      for (const op of r.requiredForeignOps) foreignOps.add(op)
      for (const u of r.unsupportedNodes) {
        unsupported.push({
          ...u,
          path: subs.length === 1 ? u.path : `${label}:${u.path}`,
        })
      }
    }
    return {
      portable,
      supported: unsupported.length === 0,
      requiredCoreOps: [...coreOps].sort(),
      requiredForeignOps: [...foreignOps].sort(),
      unsupportedNodes: unsupported,
    }
  })

const fingerprintTransition = (
  transition: Transition.Transition<never, never, unknown, unknown>,
): Effect.Effect<Option.Option<Artifact.ArtifactFingerprint>> =>
  Effect.gen(function* () {
    const whenEncoded = yield* Artifact.encodeExpr(transition.when)
    const writesEncoded = yield* Effect.forEach(transition.writes, w =>
      Artifact.encodeExpr(w.value).pipe(
        Effect.map(art => ({
          target: w.target,
          way: w.way._tag,
          value: Artifact.canonicalJson(art),
        })),
      ),
    )
    const emitsEncoded = yield* Effect.forEach(transition.emits, e =>
      Effect.gen(function* () {
        const whenArt = Option.isSome(e.when)
          ? Artifact.canonicalJson(yield* Artifact.encodeExpr(wrap<never, unknown>(e.when.value)))
          : null
        const fields = yield* Effect.forEach(e.fields, ([field, node]) =>
          Artifact.encodeExpr(wrap<never, unknown>(node)).pipe(
            Effect.map(art => [field, Artifact.canonicalJson(art)] as const),
          ),
        )
        return { tag: e.tag, when: whenArt, fields }
      }),
    )
    const ensuresEncoded =
      transition.ensures !== undefined && Option.isSome(transition.ensures)
        ? Artifact.canonicalJson(yield* Artifact.encodeExpr(transition.ensures.value))
        : null

    const canonicalPayload = JSON.stringify({
      kind: 'transition',
      codecVersion: Artifact.CODEC_VERSION,
      when: Artifact.canonicalJson(whenEncoded),
      writes: writesEncoded,
      emits: emitsEncoded,
      ensures: ensuresEncoded,
    })
    const hex = yield* sha256Hex(canonicalPayload)
    return Option.some(`sha256:${hex}` as Artifact.ArtifactFingerprint)
  }).pipe(Effect.catch(() => Effect.succeed(Option.none())))

const analyzeEntry = (entry: DefinitionEntry): Effect.Effect<DefinitionInfo> =>
  Effect.gen(function* () {
    const ready = yield* readinessForEntry(entry, { _tag: 'portable' })
    const reads = uniqueSorted(entrySubExprs(entry).flatMap(s => readsOfExpr(s.expr)))
    return yield* Match.value(entry).pipe(
      Match.tags({
        Expr: ({ id, expr, dependsOn, origin, description }) =>
          (ready.portable
            ? Artifact.fingerprint(expr).pipe(
                Effect.map(Option.some),
                Effect.catch(() => Effect.succeed(Option.none())),
              )
            : Effect.succeed(Option.none())
          ).pipe(
            Effect.map(fp => ({
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
            })),
          ),
        Transition: ({ id, transition, dependsOn, origin, description }) =>
          (ready.portable ? fingerprintTransition(transition) : Effect.succeed(Option.none())).pipe(
            Effect.map(fp => ({
              id,
              kind: 'transition' as const,
              fingerprint: fp,
              portable: ready.portable,
              reads,
              writes: uniqueSorted(transition.writes.map(w => formatPath(['state', ...w.target]))),
              requiredCoreOps: ready.requiredCoreOps,
              requiredForeignOps: ready.requiredForeignOps,
              dependsOn: uniqueSorted(dependsOn),
              origin,
              description,
            })),
          ),
      }),
      Match.exhaustive,
    )
  })

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
      list: () => Effect.succeed([...infos.values()].sort((a, b) => cmpId(a.id, b.id))),
      definition: requireInfo,
      references: id =>
        requireInfo(id).pipe(
          Effect.map(target => {
            const refs: Array<Reference> = []
            const targetReads = new Set(target.reads.filter(r => r !== '*'))
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
                if (r !== '*' && targetReads.has(r)) {
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
              if (cycle[0] !== info.id) continue
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
              const ready = yield* readinessForEntry(raw, target)
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
            return readinessForEntry(raw, target).pipe(
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
          const sorted = [...infos.values()].sort((a, b) => cmpId(a.id, b.id))
          const idToKey = new Map<string, string>()
          let nextIdx = 0
          const keyOf = (id: string): string => {
            let key = idToKey.get(id)
            if (key === undefined) {
              key = `n${nextIdx++}`
              idToKey.set(id, key)
            }
            return key
          }
          const escapeLabel = (text: string): string =>
            text.replaceAll('"', '&quot;').replaceAll('\n', ' ')
          for (const info of sorted) {
            lines.push(`  ${keyOf(info.id)}["${escapeLabel(info.id)} (${info.kind})"]`)
          }
          for (const info of sorted) {
            for (const dep of info.dependsOn) {
              lines.push(`  ${keyOf(info.id)} --> ${keyOf(dep)}`)
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
      const depsChanged = !sameList(prev.dependsOn, next.dependsOn)
      if (sameFp && !readsChanged && !writesChanged && !depsChanged && prev.kind === next.kind) {
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
      changed: changed.sort((a, b) => cmpId(a.id, b.id)),
      unchanged: unchanged.sort(),
      affectedDownstream: impactReport.affected,
      unaffectedCached,
    }
  })
