/** `reaches`: which queries a declared write can change, from declarations alone (#439). */
import { Match, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { Query as Body, Write, dependenciesOf, type AnyWrite } from 'foldkit-entity'
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

type Written = ReadonlyArray<{ readonly owner: { readonly token: symbol }; readonly key: string }>

const isMutation = (
  write: AnyWrite | MutationDescriptor<any, any, any, any>,
): write is MutationDescriptor<any, any, any, any> => 'Refusal' in write

/**
 * Which of a query's lists a declared write can reach, asked of the
 * declarations alone: `Write.writes` against what the body reads
 * (`Query.dependencies`'s `fields` and `reaches`). Members are compared by
 * their owner's identity, so two Entities of one name are told apart. Pure,
 * and it reads no Model.
 *
 * `write` is a `Write`, or a mutation declared with `Mutation.write`. A
 * mutation declared with `Mutation.make` answers `Unknown`, as does a query
 * with no body; a handler mutation wins when both apply.
 *
 * ```ts
 * Reach.match(reaches(RenameCategory, InToys), {
 *   Reads: () => 'refetch',
 *   Unaffected: () => 'keep',
 *   Unknown: ({ why }) => `ask the server (${why})`,
 * })
 * ```
 */
export const reaches = (
  write: AnyWrite | MutationDescriptor<any, any, any, any>,
  query: Pick<QueryDescriptor<any, any, any>, 'body'>,
): Reach => {
  const declared = isMutation(write) ? write.write : write
  if (declared === undefined) return Reach.Unknown({ why: 'Handler' })
  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })
  const writes: Written = Write.writes(declared)
  const written = (owner: { readonly token: symbol }, key: string) =>
    writes.some(member => member.owner.token === owner.token && member.key === key)
  const read = Body.dependencies(query.body)
  const own = read.fields.some(field => written(field.owner, field.key))
  const through = read.reaches.some(reach =>
    Match.value(reach).pipe(
      Match.tagsExhaustive({
        Path: path =>
          written(path.field.owner, path.field.key) ||
          path.via.some(relation => written(relation.owner, relation.key)),
        Exists: exists =>
          written(exists.relation.owner, exists.relation.key) ||
          exists.via.some(relation => written(relation.owner, relation.key)) ||
          Option.exists(exists.where, where =>
            dependenciesOf(where).fields.some(field => written(field.owner, field.key)),
          ),
        ViewerPath: path =>
          written(path.field.owner, path.field.key) ||
          path.via.some(relation => written(relation.owner, relation.key)),
      }),
    ),
  )
  return own || through ? Reach.Reads() : Reach.Unaffected()
}
