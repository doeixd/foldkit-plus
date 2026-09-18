/** Marks a `Metadata` value. Its entries are private to this module. */
export const MetadataTypeId: unique symbol = Symbol.for('foldkit-metadata/Metadata')
export type MetadataTypeId = typeof MetadataTypeId

/**
 * Declarative facts an interpreter attaches to a node it does not own, such as
 * the server data a Remote selection needs. The carrier holds and combines
 * them without knowing what they mean; a package reads only the key it owns.
 *
 * Opaque: only a key's `of` and `Metadata.combine` make one, so entries cannot
 * be forged past a key's type or `merge`, and they are frozen.
 */
export interface Metadata {
  readonly [MetadataTypeId]: MetadataTypeId
}

/**
 * An interpreter's typed slot in `Metadata`. Lookup is by the key object, never
 * its `name`, so two packages cannot collide by choosing the same string.
 */
export interface MetadataKey<A> {
  /** For tooling output only. */
  readonly name: string
  /** Normalizes the entries gathered from combined values, e.g. unioning duplicates. */
  readonly merge: (values: ReadonlyArray<A>) => ReadonlyArray<A>
  /** One line per entry for tooling output. */
  readonly summarize: (value: A) => string
  readonly of: (...values: ReadonlyArray<A>) => Metadata
  readonly get: (metadata: Metadata) => ReadonlyArray<A>
}

/** One key's entries as serializable text, named by the key. */
export interface MetadataSummary {
  readonly name: string
  readonly entries: readonly string[]
}

type Entries = ReadonlyMap<MetadataKey<any>, ReadonlyArray<unknown>>

const noEntries: Entries = new Map()
const noValues: ReadonlyArray<never> = Object.freeze([])
const entriesByMetadata = new WeakMap<Metadata, Entries>()

const makeMetadata = (entries: Entries): Metadata => {
  // Non-enumerable, so a spread or structuredClone copy is not branded: a copy
  // has no entries and must not pass for Metadata.
  const metadata = Object.freeze(
    Object.defineProperty({}, MetadataTypeId, { value: MetadataTypeId }),
  ) as Metadata
  entriesByMetadata.set(metadata, entries)
  return metadata
}

const isMetadata = (value: unknown): value is Metadata =>
  typeof value === 'object' && value !== null && entriesByMetadata.has(value as Metadata)

/** A value this module did not make has no entries. */
const entriesOf = (metadata: Metadata): Entries => entriesByMetadata.get(metadata) ?? noEntries

const emptyMetadata = makeMetadata(noEntries)

export const Metadata = {
  /**
   * Declares an interpreter's slot. Call once per package, at module level:
   * entries are found by the key object, so two copies of a package (a
   * duplicated install, a reloaded module) do not see each other's entries.
   */
  key: <A>(
    name: string,
    options: {
      readonly merge: (values: ReadonlyArray<A>) => ReadonlyArray<A>
      readonly summarize: (value: A) => string
    },
  ): MetadataKey<A> => {
    const key: MetadataKey<A> = {
      name,
      merge: options.merge,
      summarize: options.summarize,
      of: (...values) =>
        values.length === 0
          ? emptyMetadata
          : makeMetadata(new Map([[key, Object.freeze([...key.merge(values)])]])),
      get: metadata => (entriesOf(metadata).get(key) ?? noValues) as ReadonlyArray<A>,
    }
    return key
  },

  empty: emptyMetadata,

  /** True only for a value this module made; a copy or a hand-built brand is not one. */
  is: isMetadata,

  /** Gathers every part's entries and runs each key's `merge` over its group. */
  combine: (parts: ReadonlyArray<Metadata>): Metadata => {
    // Each part is already merged, so a lone part needs no second pass. A lone
    // foreign value reads as empty, the same as it would beside a sibling.
    if (parts.length === 1) return isMetadata(parts[0]) ? parts[0] : emptyMetadata
    const grouped = new Map<MetadataKey<any>, unknown[]>()
    for (const part of parts)
      for (const [key, values] of entriesOf(part)) {
        const group = grouped.get(key)
        if (group === undefined) grouped.set(key, [...values])
        else group.push(...values)
      }
    if (grouped.size === 0) return emptyMetadata
    const merged = new Map<MetadataKey<any>, ReadonlyArray<unknown>>()
    for (const [key, values] of grouped) merged.set(key, Object.freeze([...key.merge(values)]))
    return makeMetadata(merged)
  },

  summarize: (metadata: Metadata): readonly MetadataSummary[] =>
    [...entriesOf(metadata)].map(([key, values]) => ({
      name: key.name,
      entries: values.map(value => key.summarize(value)),
    })),
}
