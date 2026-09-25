/**
 * The Catalog: the Blocks one context allows, and which of them may be a root.
 *
 * It is a vocabulary, not an application registry: queries, routes, services
 * and forms do not go in it. A Block that needs data says so in its own code.
 * Like a rich-text Kit, it is a module-level value, never Model state.
 */
import { Schema } from 'effect'
import { Metadata, type MetadataSummary } from 'foldkit-metadata'
import type { AnyBlock } from './block.js'
import type { Content } from './content.js'
import { bounds } from './region.js'

export interface Catalog<Blocks extends AnyBlock = AnyBlock> {
  readonly _tag: 'Catalog'
  readonly blocks: ReadonlyArray<Blocks>
  /** The Content a root of a Document must provide one of. */
  readonly roots: ReadonlyArray<Content>
  readonly byName: ReadonlyMap<string, Blocks>
}

/** A Block's name, from a Catalog. */
export type BlockName<C> = C extends Catalog<infer Blocks> ? Blocks['name'] : never

/** One Block as a person or a tool reads it. */
export interface BlockDescription {
  readonly name: string
  readonly provides: ReadonlyArray<string>
  /** The keys of its props, when they are a struct. */
  readonly props: ReadonlyArray<string>
  readonly regions: Readonly<
    Record<string, { readonly accepts: ReadonlyArray<string>; readonly holds: string }>
  >
  readonly metadata: ReadonlyArray<MetadataSummary>
}

const keysOf = (schema: Schema.Top): ReadonlyArray<string> => {
  const fields = (schema as { readonly fields?: unknown }).fields
  return typeof fields === 'object' && fields !== null ? Object.keys(fields) : []
}

export const Catalog = {
  make: <const Blocks extends AnyBlock>(config: {
    readonly blocks: ReadonlyArray<Blocks>
    readonly roots: ReadonlyArray<Content>
  }): Catalog<Blocks> => {
    if (config.roots.length === 0)
      throw new Error('Catalog.make: `roots` names no Content, so no Document could have a root')
    const byName = new Map<string, Blocks>()
    for (const block of config.blocks) {
      if (byName.has(block.name))
        throw new Error(`Catalog.make: two Blocks are named "${block.name}"`)
      byName.set(block.name, block)
    }
    return Object.freeze({
      _tag: 'Catalog',
      blocks: Object.freeze([...config.blocks]),
      roots: Object.freeze([...config.roots]),
      byName,
    })
  },

  /** The Block a stored name resolves to, or `undefined` when this Catalog has none. */
  block: <Blocks extends AnyBlock>(catalog: Catalog<Blocks>, name: string): Blocks | undefined =>
    catalog.byName.get(name),

  /** Every Block, in the Catalog's order, as a person or an agent reads it. */
  describe: (catalog: Catalog): ReadonlyArray<BlockDescription> =>
    catalog.blocks.map(block => ({
      name: block.name,
      provides: block.provides.map(content => content.name),
      props: keysOf(block.Props),
      regions: Object.fromEntries(
        Object.entries(block.regions).map(([name, region]) => [
          name,
          { accepts: region.accepts.map(content => content.name), holds: bounds(region) },
        ]),
      ),
      metadata: Metadata.summarize(block.metadata),
    })),
}
