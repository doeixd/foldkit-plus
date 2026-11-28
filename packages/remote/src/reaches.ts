/** `reaches`: which queries a declared write can change, backed by `metakit/graph` (#439, #581). */
import { Match, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { Footprint, Query as Body, Write, dependenciesOf, type AnyWrite } from 'foldkit-entity'
import { build as buildGraph, knownEdge, rowPath, type PathEdge } from 'metakit/graph'
import type { MutationDescriptor } from './mutationDescriptor.js'
import type { QueryDescriptor } from './query.js'

/**
 * Whether a write can change what a query lists.
 *
 * - `Reads`: the query's body reads a member the write may write, as its own
 *   row's field, through a path or an exists (its `where` included), or from
 *   the viewer.
 * - `Unaffected`: the body reads none of them. The write cannot change the list.
 * - `Unknown`: the declarations do not say. `NoBody` is a query declared with
 *   `Query.make`, whose meaning is its server's; `Handler` is a mutation
 *   declared with `Mutation.make`, whose writes only its handler knows.
 */
export const Reach = defineTaggedUnion({
  Reads: {},
  Unaffected: {},
  Unknown: { why: Schema.Literals(['NoBody', 'Handler']) },
})
export type Reach = typeof Reach.Type

type Owner = { readonly token: symbol }

const isMutation = (
  write: AnyWrite | MutationDescriptor<any, any, any, any>,
): write is MutationDescriptor<any, any, any, any> => 'Refusal' in write

/** Assigns a unique namespace key per Entity symbol so two Entities with one name stay distinct. */
const entityNamespace = () => {
  const ids = new Map<symbol, string>()
  return (owner: Owner): string => {
    const known = ids.get(owner.token)
    if (known !== undefined) return known
    const id = `e${ids.size}`
    ids.set(owner.token, id)
    return id
  }
}

/**
 * What `write` may write as `metakit/graph` row edges, or `undefined` when no
 * declaration says (`Mutation.make` or `Footprint.unknown`).
 */
const writeEdgesOf = (
  write: AnyWrite | MutationDescriptor<any, any, any, any>,
  nsOf: (owner: Owner) => string,
): ReadonlyArray<PathEdge> | undefined => {
  const declared = isMutation(write) ? write.write : write
  if (declared !== undefined) {
    return Write.writes(declared).map(member =>
      knownEdge(rowPath(nsOf(member.owner), [member.key]), 'derived'),
    )
  }
  const touched = isMutation(write) ? write.footprint : undefined
  if (touched === undefined) return undefined
  const entityNs = nsOf(touched.entity)
  return Footprint.$match(touched.footprint, {
    Derived: ({ writes }) => writes.map(key => knownEdge(rowPath(entityNs, [key]), 'derived')),
    Declared: ({ writes }) => writes.map(key => knownEdge(rowPath(entityNs, [key]), 'declared')),
    Unknown: () => undefined,
  })
}

/**
 * Which of a query's lists a declared write can reach, asked of the
 * declarations alone through `metakit/graph`: `Write.writes` against what the
 * body reads (`Query.dependencies`'s `fields` and `reaches`). Members are
 * compared by their owner's identity, so two Entities of one name are told
 * apart. Pure, and it reads no Model.
 */
export const reaches = (
  write: AnyWrite | MutationDescriptor<any, any, any, any>,
  query: Pick<QueryDescriptor<any, any, any>, 'body'>,
): Reach => {
  const nsOf = entityNamespace()
  const writeEdges = writeEdgesOf(write, nsOf)
  if (writeEdges === undefined) return Reach.Unknown({ why: 'Handler' })
  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })
  const read = Body.dependencies(query.body)
  const readEdges: Array<PathEdge> = read.fields.map(field =>
    knownEdge(rowPath(nsOf(field.owner), [field.key]), 'derived'),
  )
  for (const reach of read.reaches) {
    Match.value(reach).pipe(
      Match.tagsExhaustive({
        Path: path => {
          readEdges.push(knownEdge(rowPath(nsOf(path.field.owner), [path.field.key]), 'derived'))
          for (const relation of path.via) {
            readEdges.push(knownEdge(rowPath(nsOf(relation.owner), [relation.key]), 'derived'))
          }
        },
        Exists: exists => {
          readEdges.push(
            knownEdge(rowPath(nsOf(exists.relation.owner), [exists.relation.key]), 'derived'),
          )
          for (const relation of exists.via) {
            readEdges.push(knownEdge(rowPath(nsOf(relation.owner), [relation.key]), 'derived'))
          }
          if (Option.isSome(exists.where)) {
            for (const field of dependenciesOf(exists.where.value).fields) {
              readEdges.push(knownEdge(rowPath(nsOf(field.owner), [field.key]), 'derived'))
            }
          }
        },
        ViewerPath: path => {
          readEdges.push(knownEdge(rowPath(nsOf(path.field.owner), [path.field.key]), 'derived'))
          for (const relation of path.via) {
            readEdges.push(knownEdge(rowPath(nsOf(relation.owner), [relation.key]), 'derived'))
          }
        },
      }),
    )
  }
  const graph = buildGraph({
    writers: [{ id: 'write', kind: 'write', writes: writeEdges }],
    readers: [{ id: 'query', kind: 'query', reads: readEdges }],
  })
  return graph.affectedBy('write').length > 0 ? Reach.Reads() : Reach.Unaffected()
}
