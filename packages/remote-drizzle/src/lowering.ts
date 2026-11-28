/**
 * What a request makes of an expression's nodes and their reading
 * (`foldkit-entity/lowering`) before any SQL is written: its input, viewer and
 * time bound into them, and what reads no column decided by metakit's partial
 * evaluation (`render.ts` writes what is left).
 */
import { Option } from 'effect'
import { type AnyExpr } from 'foldkit-entity'
import { ASKER, foreignOf, readingOf, type Reading } from 'foldkit-entity/lowering'
import { Node } from '@doeixd/metakit'
import { residualizeNode } from '@doeixd/metakit/build'
import { walk, rewrite } from './nodes.js'
import { QueryCompileError, operatorsOf, type CompileTarget } from './target.js'

/** The reading of `expr`, once: an expression is read for every request that compiles it. */
const readings = new WeakMap<AnyExpr, Reading>()

export const readingFor = (expr: AnyExpr): Reading => {
  const known = readings.get(expr)
  if (known !== undefined) return known
  const made = readingOf([expr])
  readings.set(expr, made)
  return made
}

// --- binding the request into the nodes ---

/** The value of `segments` in `env`; a null on the way reads null, a missing key is not known. */
const readEnv = (env: unknown, segments: ReadonlyArray<string>): Option.Option<unknown> => {
  let at = env
  for (const segment of segments) {
    if (at === null) return Option.some(null)
    if (typeof at !== 'object' || at === undefined || !Object.hasOwn(at, segment)) {
      return Option.none()
    }
    at = (at as Record<string, unknown>)[segment]
  }
  return at === undefined ? Option.none() : Option.some(at)
}

/**
 * What the request knows of what `node` reads: each input it reads (null where
 * none was given, as SQL binds it), the time, and who asks. Their fields, and
 * what a column holds, stay unknown: they are read from the database.
 */
export const envFor = (
  node: Node.Node,
  reading: Pick<Reading, 'viewers'>,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const given: Record<string, unknown> = {}
  for (const each of walk(node)) {
    if (Node.$is('Path')(each) && each.segments[0] === 'input' && each.segments.length === 2) {
      const key = each.segments[1]!
      given[key] = Object.hasOwn(input, key) ? input[key] : null
    }
  }
  const env: Record<string, unknown> = { input: given }
  const { context } = target
  if (context === undefined) return env
  if (Option.isSome(context.now)) env.now = context.now.value
  const viewers: Record<string, unknown> = {}
  for (const name of reading.viewers.keys()) {
    viewers[name] = Option.match(
      Option.filter(context.viewer, ref => ref.entity === name),
      // A visitor, or a viewer of another Entity, reads null.
      { onNone: () => null, onSome: ({ id }) => ({ [ASKER]: id }) },
    )
  }
  env.viewer = viewers
  return env
}

/** `node` with the paths `env` holds as constants, and nothing else simplified. */
export const bindNode = (node: Node.Node, env: unknown): Node.Node =>
  Node.substitutePaths(node, segments =>
    Option.map(readEnv(env, segments), value => Node.Lit({ value })),
  )

const refusalIn = (node: Node.Node): Node.Refusal | undefined => {
  for (const each of walk(node)) {
    if (Node.$is('Lit')(each) && Node.isRefusal(each.value)) return each.value
  }
  return undefined
}

/** A strict call with a null argument is null, as SQL gives it: what `eq.among` of a null list needs to lower. */
const nullIn = (node: Node.Node): Node.Node => {
  if (!Node.$is('Call')(node)) return node
  const isNull = (arg: Node.Node | undefined): boolean =>
    arg !== undefined && Node.$is('Lit')(arg) && arg.value === null
  // `eq.among` answers its own nulls, but a list the request left out is null.
  return (node.op.nulls === 'strict' && node.args.some(isNull)) ||
    (node.op.id === 'eq.among' && isNull(node.args[1]))
    ? Node.Lit({ value: null })
    : node
}

/**
 * Whether `node` reads a stored value: a column, a field of the row a write
 * leaves, a field of the viewer's row. What it reads of the request alone (an
 * input, the time, who asks) is known before the database is asked.
 */
const readsStored = (node: Node.Node): boolean =>
  walk(node).some(
    each =>
      Node.$is('Path')(each) &&
      each.segments[0] !== 'input' &&
      each.segments[0] !== 'now' &&
      each.segments[0] !== 'each' &&
      !(each.segments[0] === 'viewer' && each.segments[2] === ASKER),
  )

/**
 * `node` over this request as SQL's own reader sees it: what reads no column
 * decided, a refusal reported where the evaluator would refuse. A primitive
 * operator is run in memory only where the whole of `node` reads no column,
 * so one that reads a column is left to the SQL its table writes.
 */
export const decided = (
  node: Node.Node,
  reading: Reading,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): Node.Node => {
  const residual = residualizeNode(
    node,
    envFor(node, reading, target, input),
    readsStored(node) ? {} : foreignOf(reading, operatorsOf(target).memory),
  )
  const refused = refusalIn(residual)
  if (refused !== undefined) throw new QueryCompileError(`query "${query}": ${refused.message}`)
  return rewrite(residual, nullIn)
}
