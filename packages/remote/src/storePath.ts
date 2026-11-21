/**
 * The Model path of a domain's store, which a read declares as all it reads (#588)
 * and `Remote.resume` as what it restores. A raw optic or a hand-built binding names
 * none and claims nothing: its reads are made every time.
 */
export const storePaths = (store: {
  readonly dependency?: ReadonlyArray<string> | undefined
}): ReadonlyArray<ReadonlyArray<string>> => (store.dependency?.length ? [store.dependency] : [])
