/**
 * What `queryPlans` reads of a running source: each statement `runStatement`
 * is about to run, and the declaration a `query` source was made from.
 */
import { Context, Option } from 'effect'
import type { AnyQuery } from 'foldkit-entity'
import type { AnyEntityBinding } from './binding.js'

/** Where `queryPlans` notes each statement built, before it runs; none otherwise. */
export const ObservedStatements = Context.Reference<Option.Option<(statement: unknown) => void>>(
  'foldkit-remote-drizzle/ObservedStatements',
  { defaultValue: () => Option.none() },
)

/** What a `query` source was made from, by the source. */
export interface QueryDeclaration {
  readonly name: string
  readonly body: Option.Option<AnyQuery>
  readonly binding: AnyEntityBinding
}

export const declarations = new WeakMap<object, QueryDeclaration>()
