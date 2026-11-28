/**
 * Static regions (`Phase 6, Bout 6.9`): a region no live Message reaches is
 * drawn into the HTML on the server, its Model data left out of the resume
 * envelope, and never redrawn by the browser.
 *
 * `checkStaticRegion` validates a region declared static against the page's
 * `LiveSet` and refuses any handler or live-set read with `BindingInStaticRegion`.
 * `evaluateStaticBindings` uses `pruneStatic` to compute static binding values
 * from the static Model slice so its data can be omitted from the envelope.
 */
import { Data, Option, Result } from 'effect'
import { Expr, Path } from '@doeixd/metakit'
import { pathsOverlap } from '@doeixd/metakit/graph/match'
import { pruneStatic } from '@doeixd/metakit/graph/prune'
import type { AnyBinding, Bindings, BindingValue } from './binding.js'
import { isUnchangingPath, type LiveSet } from './liveSet.js'

/** Refusal when a region declared static binds a handler or reads live Model state. */
export class BindingInStaticRegion extends Data.TaggedError('BindingInStaticRegion')<{
  readonly region: string
  readonly reason: 'handler' | 'live-read'
  readonly detail: string
  readonly message: string
}> {}

export interface StaticRegionOptions<Model, Keys extends string = string> {
  readonly name: string
  readonly readerId: string
  readonly live: LiveSet
  readonly bindings: Bindings<Model, Keys>
  readonly hasHandlers?: boolean | undefined
}

export interface StaticRegionReport {
  readonly region: string
  readonly readerId: string
  readonly omittedPaths: ReadonlyArray<ReadonlyArray<string>>
}

const refuseStatic = (
  region: string,
  reason: 'handler' | 'live-read',
  detail: string,
  message: string,
): Result.Result<never, BindingInStaticRegion> =>
  Result.fail(new BindingInStaticRegion({ region, reason, detail, message }))

/**
 * Validate a region declared static against the page's `LiveSet`.
 *
 * Refuses with `BindingInStaticRegion` if the region has handlers, the live
 * set is unbounded, `readerId` is not in `live.deadReaders`, `bindings.reads`
 * is unknown (`Option.none()`), or any read overlaps `live.writes`.
 */
export const checkStaticRegion = <Model, Keys extends string = string>(
  options: StaticRegionOptions<Model, Keys>,
): Result.Result<StaticRegionReport, BindingInStaticRegion> => {
  if (options.hasHandlers === true) {
    return refuseStatic(
      options.name,
      'handler',
      'the region binds an event handler',
      `[foldkit-ssr] static region "${options.name}" cannot bind an event handler`,
    )
  }
  if (options.live.unbounded) {
    return refuseStatic(
      options.name,
      'live-read',
      'the live set is unbounded',
      `[foldkit-ssr] static region "${options.name}" (reader "${options.readerId}") cannot be static because the live set is unbounded`,
    )
  }
  if (!options.live.deadReaders.includes(options.readerId)) {
    return refuseStatic(
      options.name,
      'live-read',
      `reader "${options.readerId}" is not in deadReaders`,
      `[foldkit-ssr] static region "${options.name}" (reader "${options.readerId}") is reached by a live Message`,
    )
  }
  if (Option.isNone(options.bindings.reads)) {
    return refuseStatic(
      options.name,
      'live-read',
      'bindings have opaque reads',
      `[foldkit-ssr] static region "${options.name}" (reader "${options.readerId}") has opaque bindings whose Model reads are unknown`,
    )
  }
  const overlapping = options.bindings.reads.value.find(readPath =>
    options.live.writes.some(writePath => pathsOverlap(readPath, writePath)),
  )
  if (overlapping !== undefined) {
    return refuseStatic(
      options.name,
      'live-read',
      `reads "${overlapping.join('.')}" which overlaps a live write`,
      `[foldkit-ssr] static region "${options.name}" (reader "${options.readerId}") reads "${overlapping.join('.')}", which a live Message writes`,
    )
  }
  const omittedPaths = options.bindings.reads.value.filter(path =>
    isUnchangingPath(path, options.live),
  )
  return Result.succeed({
    region: options.name,
    readerId: options.readerId,
    omittedPaths,
  })
}

const isSafeSegment = (segment: string): boolean =>
  segment !== '__proto__' && segment !== 'constructor' && segment !== 'prototype'

const mergePath = (
  dst: unknown,
  src: unknown,
  segments: ReadonlyArray<string>,
  index: number,
): unknown => {
  if (index >= segments.length) return src
  const readable = Path.readable(src)
  if (readable === null) return null
  if (readable === undefined || typeof readable !== 'object') return dst

  const segment = segments[index]!
  if (!isSafeSegment(segment)) return dst

  if (segment === '*') {
    if (!Array.isArray(readable)) return dst
    const prev = Array.isArray(dst) ? dst : []
    return readable.map((item, i) => mergePath(prev[i], item, segments, index + 1))
  }

  if (!Object.hasOwn(readable, segment)) return dst
  const nextSrc = (readable as Record<string, unknown>)[segment]
  if (Array.isArray(readable) && /^\d+$/.test(segment)) {
    const idx = Number(segment)
    const prevArr = Array.isArray(dst) ? [...dst] : []
    prevArr[idx] = mergePath(prevArr[idx], nextSrc, segments, index + 1)
    return prevArr
  }
  const prevObj =
    dst !== null && typeof dst === 'object' && !Array.isArray(dst)
      ? (dst as Record<string, unknown>)
      : {}
  const nextDst = mergePath(
    Object.hasOwn(prevObj, segment) ? prevObj[segment] : undefined,
    nextSrc,
    segments,
    index + 1,
  )
  return { ...prevObj, [segment]: nextDst }
}

const sliceAtPaths = <Model>(
  model: Model,
  paths: ReadonlyArray<ReadonlyArray<string>>,
): unknown => {
  if (paths.some(segments => segments.length === 0)) return model
  let slice: unknown = {}
  for (const segments of paths) {
    slice = mergePath(slice, model, segments, 0)
  }
  return slice
}

const toBindingValue = <Model>(entry: AnyBinding<Model>, raw: unknown): BindingValue => {
  switch (entry._tag) {
    case 'Text':
      return { _tag: 'Text', text: raw === null || raw === undefined ? '' : String(raw) }
    case 'Attribute':
      return {
        _tag: 'Attribute',
        name: entry.name,
        value: raw === null || raw === undefined ? null : String(raw),
      }
    case 'Shown':
      return { _tag: 'Shown', shown: raw === true }
    case 'Order': {
      if (!Array.isArray(raw)) return { _tag: 'Order', keys: [] }
      const keys: Array<string> = []
      for (const item of raw) {
        if (item !== null && typeof item === 'object' && Object.hasOwn(item, entry.key)) {
          keys.push(String((item as Record<string, unknown>)[entry.key]))
        }
      }
      return { _tag: 'Order', keys }
    }
  }
}

const exprOfBinding = <Model>(entry: AnyBinding<Model>): Expr.Expr<never, unknown> => {
  switch (entry._tag) {
    case 'Text':
    case 'Attribute':
    case 'Shown':
      return entry.expr as Expr.Expr<never, unknown>
    case 'Order':
      return entry.listPath as Expr.Expr<never, unknown>
  }
}

const fallbackRaw = <Model>(
  entry: AnyBinding<Model>,
  residual: Expr.Expr<never, unknown>,
  staticModel: Model,
): unknown => {
  switch (entry._tag) {
    case 'Text':
    case 'Attribute':
    case 'Shown':
      return Expr.evaluate(residual as Expr.Expr<Model, unknown>, staticModel)
    case 'Order':
      return Option.getOrUndefined(Path.get(entry.listPath, staticModel))
  }
}

/**
 * Compute a static region's binding values once on the server from `staticModel`
 * (optionally restricted to `staticPaths`) via `pruneStatic`, so the region's
 * data can be omitted from the browser's resume envelope.
 */
export const evaluateStaticBindings = <Model, Keys extends string>(
  bindings: Bindings<Model, Keys>,
  staticModel: Model,
  staticPaths?: ReadonlyArray<ReadonlyArray<string>>,
): Readonly<Record<Keys, BindingValue>> => {
  const exprs: Record<string, Expr.Expr<never, unknown>> = Object.create(null)
  for (const key of bindings.keys) {
    exprs[key] = exprOfBinding(bindings.entries[key])
  }

  const slice = staticPaths === undefined ? staticModel : sliceAtPaths(staticModel, staticPaths)
  const pruned = pruneStatic(exprs, slice as never)

  const out: Record<string, BindingValue> = Object.create(null)
  for (const key of bindings.keys) {
    const entry = bindings.entries[key]
    const raw = Object.hasOwn(pruned.staticValues, key)
      ? pruned.staticValues[key]
      : fallbackRaw(entry, pruned.liveBindings[key] as Expr.Expr<never, unknown>, staticModel)
    out[key] = toBindingValue(entry, raw)
  }
  return out as Readonly<Record<Keys, BindingValue>>
}
