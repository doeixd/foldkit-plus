import type { RemoteDomain } from './index.js'
import type { QueryDescriptor } from './query.js'

/** The query names a domain registers. */
export type QueryNames<Domain> =
  Domain extends RemoteDomain<any, any, any, infer Queries, any>
    ? Queries[number] extends QueryDescriptor<infer Name, any, any>
      ? Name
      : never
    : never

/** The runtime half of `Registered`: a descriptor the domain never declared is an error naming both. */
export const assertRegistered = (
  bound: { readonly contract: { readonly name: string } },
  kind: 'Entity' | 'Query' | 'Mutation',
  registered: ReadonlyMap<string, unknown>,
  name: string,
): void => {
  if (!registered.has(name)) {
    throw new Error(
      `Remote: ${kind} "${name}" is not registered with domain "${bound.contract.name}"`,
    )
  }
}
