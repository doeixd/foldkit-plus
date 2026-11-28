/**
 * The Model path of a domain's store, which a read declares as all it reads (#588)
 * and `Remote.resume` as what it restores. A raw optic or a hand-built binding names
 * none and claims nothing: its reads are made every time.
 */
import { Path } from '@doeixd/metakit'
import { entityKey } from './store.js'

export const storePaths = (store: {
  readonly dependency?: ReadonlyArray<string> | undefined
}): ReadonlyArray<ReadonlyArray<string>> => (store.dependency?.length ? [store.dependency] : [])

/**
 * Build a metakit `Path` into a held entity row's `values` record inside a
 * Remote submodel (`[...storePath, 'entities', entityKey(entity, id), 'values']`),
 * so a `Transition` guard or `Expr` can read held Remote rows directly.
 */
export const storeRowPath = <Model, Row = Readonly<Record<string, unknown>>>(
  store: { readonly dependency?: ReadonlyArray<string> | undefined },
  entity: string | { readonly name: string },
  id: string,
): Path.Path<Model, Row> => {
  const base = store.dependency ?? []
  const entityName = typeof entity === 'string' ? entity : entity.name
  return Path.make<Model, Row>([...base, 'entities', entityKey(entityName, id), 'values'])
}
