/**
 * A read's result per snapshot of everything it reads, shared by the read core
 * and the layer capability, which places pending rows in a list once per
 * snapshot.
 */

interface ReadScope {
  readonly inner: WeakMap<object, ReadScope>
  readonly results: Map<string, unknown>
}

const readResults: ReadScope = { inner: new WeakMap(), results: new Map() }

// A read's result per snapshot of everything it reads. `Remote.storeOf` is
// shared across every read of one Model state, so equal reads of one render
// assemble and decode once and return one value (a view may compare by
// identity). A query read also depends on its connection and the overlays,
// which change independently of the store, so it keys on those too. Weak on
// every scope, bounded by what is read.
export const memoRead = <T>(scopes: ReadonlyArray<object>, key: string, compute: () => T): T => {
  let scope = readResults
  for (const by of scopes) {
    let inner = scope.inner.get(by)
    if (inner === undefined) {
      inner = { inner: new WeakMap(), results: new Map() }
      scope.inner.set(by, inner)
    }
    scope = inner
  }
  if (scope.results.has(key)) return scope.results.get(key) as T
  const value = compute()
  scope.results.set(key, value)
  return value
}
