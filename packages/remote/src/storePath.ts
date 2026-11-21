/**
 * The Model path of a domain's store, as a Projection declares what it reads
 * (#588): every read of the domain consults only what lives under that field
 * (rows, pending layers and overlays, pages, in-flight marks, failures), and
 * none reads the clock, so a Projection over it is the same while the field
 * is. `Remote.resume`'s part names the same path as the one it restores.
 *
 * A raw optic (`ModelRef.fromOptic`) names no path and claims nothing, which a
 * Projection reads as "something no path names". So does a binding built by
 * hand with only a `get` (adapters' and tests' kernel bindings): the read is
 * then made every time, never shown stale.
 */
export const storePaths = (store: {
  readonly dependency?: ReadonlyArray<string> | undefined
}): ReadonlyArray<ReadonlyArray<string>> =>
  store.dependency === undefined || store.dependency.length === 0 ? [] : [store.dependency]
