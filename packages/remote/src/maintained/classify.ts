/**
 * Update-or-rescan classification for maintained values (Phase 4 Part B, Bout 4.22).
 *
 * Classifies a maintained definition (`Sum`, `Count`, `Min`, `Max`, `Every`,
 * `Any`, `List`, or a custom `Operation` reduce) into either an incremental
 * `Update` strategy or a `Rescan` with the exact reason, and formats
 * development logs and rescan reports.
 */
import { Data, Match } from 'effect'
import { Query as Relational, type AnyQuery } from 'foldkit-entity'
import type { AnyOperation, OperationImplementations } from 'metakit/operation'
import type { Definition } from './definition.js'

export type Classification = Data.TaggedEnum<{
  Update: {
    readonly by:
      | 'fold-invertible'
      | 'fold-insert-only'
      | 'row-local-filter'
      | 'sorted-placement'
      | 'reverse-index'
      | 'derived-reads'
  }
  Rescan: {
    readonly reason:
      | 'fold-not-invertible-on-delete'
      | 'body-reads-changed-path'
      | 'second-hop'
      | 'nested-rows'
      | 'order-key-not-unique'
      | 'unknown-reads'
  }
}>
export const Classification = Data.taggedEnum<Classification>()

export interface ClassifyOptions {
  /** Which delta operation to classify (`'delete'` is the worst case and default). */
  readonly on?: 'insert' | 'delete' | undefined
  /** Optional query body for `List` definitions to check for cross-row hops. */
  readonly body?: AnyQuery | undefined
}

/** Classify a maintained definition (`List` or `ListAggregate`). */
export const classify = <Row>(
  definition: Definition<Row>,
  options?: ClassifyOptions,
): Classification => {
  const on = options?.on ?? 'delete'
  return Match.valueTags(definition, {
    Sum: () => Classification.Update({ by: 'fold-invertible' }),
    Count: () => Classification.Update({ by: 'fold-invertible' }),
    Every: () => Classification.Update({ by: 'fold-invertible' }),
    Any: () => Classification.Update({ by: 'fold-invertible' }),
    Min: () =>
      on === 'insert'
        ? Classification.Update({ by: 'fold-insert-only' })
        : Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),
    Max: () =>
      on === 'insert'
        ? Classification.Update({ by: 'fold-insert-only' })
        : Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),
    List: () => {
      if (options?.body !== undefined && Relational.dependencies(options.body).reaches.length > 0) {
        return Classification.Rescan({ reason: 'second-hop' })
      }
      return Classification.Update({ by: 'sorted-placement' })
    },
    Reduce: ({ op, implementations }) => classifyOperation(op, { on, implementations }),
    Join: () => Classification.Update({ by: 'reverse-index' }),
  })
}

/** Classify a custom `reduce` fold over a `metakit/operation` `Operation`. */
export const classifyOperation = (
  op: AnyOperation,
  options?: {
    readonly on?: 'insert' | 'delete' | undefined
    readonly implementations?: OperationImplementations | undefined
  },
): Classification => {
  const on = options?.on ?? 'delete'
  const { claims } = op.descriptor
  if (claims.invertible !== undefined) {
    const inv = claims.invertible.inverse
    const impls = options?.implementations
    const hasInverse =
      inv === 'self' ||
      impls === undefined ||
      (Object.hasOwn(impls, `${inv.id}@${inv.version}`) &&
        impls[`${inv.id}@${inv.version}`] !== undefined)
    if (hasInverse) return Classification.Update({ by: 'fold-invertible' })
  }
  if (on === 'insert' && claims.commutative === true && claims.associative === true) {
    return Classification.Update({ by: 'fold-insert-only' })
  }
  return Classification.Rescan({ reason: 'fold-not-invertible-on-delete' })
}

const reasonText: Readonly<
  Record<Extract<Classification, { readonly _tag: 'Rescan' }>['reason'], string>
> = {
  'fold-not-invertible-on-delete': 'fold has no inverse',
  'body-reads-changed-path': 'body reads a changed path',
  'second-hop': 'body reads through another row',
  'nested-rows': 'body contains nested row folds',
  'order-key-not-unique': 'order key has no unique tie-break',
  'unknown-reads': 'reads are unknown',
}

/** Format a development log line for a rescanning maintained value (returns `undefined` for `Update`). */
export const formatRescanLog = (
  name: string,
  classification: Classification,
  detail?: string,
): string | undefined =>
  Classification.$match(classification, {
    Update: () => undefined,
    Rescan: ({ reason }) =>
      `[foldkit-remote] maintained "${name}" rescans on delete: ${detail ?? reasonText[reason]}.`,
  })

export interface RescanReportEntry {
  readonly name: string
  readonly reason: Extract<Classification, { readonly _tag: 'Rescan' }>['reason']
  readonly message: string
}

/** Return every rescanning maintained value in `entries` with its reason and message. */
export const rescanReport = (
  entries: ReadonlyArray<{
    readonly name: string
    readonly definition: Definition<never>
    readonly body?: AnyQuery | undefined
  }>,
): ReadonlyArray<RescanReportEntry> => {
  const out: Array<RescanReportEntry> = []
  for (const entry of entries) {
    const cls = classify(entry.definition, { on: 'delete', body: entry.body })
    Classification.$match(cls, {
      Update: () => {},
      Rescan: ({ reason }) => {
        const detail = Match.valueTags(entry.definition, {
          Min: () => 'min has no inverse',
          Max: () => 'max has no inverse',
          Sum: () => reasonText[reason],
          Count: () => reasonText[reason],
          Every: () => reasonText[reason],
          Any: () => reasonText[reason],
          List: () => reasonText[reason],
          Reduce: () => reasonText[reason],
          Join: () => reasonText[reason],
        })
        out.push({
          name: entry.name,
          reason,
          message: formatRescanLog(entry.name, cls, detail)!,
        })
      },
    })
  }
  return out
}
