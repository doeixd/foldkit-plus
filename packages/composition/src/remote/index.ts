/**
 * `foldkit-composition/remote`: Blocks whose content is a server-owned list.
 *
 * A Query Block names a `foldkit-remote` query and says how its props become
 * the query's input. An author chooses the props, such as a category or a
 * count; an author never writes a query, and the Document never holds one.
 *
 * The read goes through Remote like any other. `QueryBlock.reads(Data,
 * catalog, document)` is one Projection over the application's Model, keyed by
 * node, of every Query Block on the page: require it from an active or a
 * Surface and Remote fetches, caches, authorizes on the server and resumes
 * the reads as it does every read. Drawing, the Renderer hands each node its
 * value as `data`, and the Block's `rows(data)` reads it typed.
 */
import { Schema } from 'effect'
import type {
  EntitySelection,
  Page,
  QueryDescriptor,
  QueryEntity,
  QueryInput,
  RemoteData,
  SelectsEntity,
} from 'foldkit-remote'
import { Metadata } from 'foldkit-metadata'
import { Projection, type ActiveSurface } from 'foldkit-surface'
import { Block, type AnyBlock } from '../block.js'
import { Catalog } from '../catalog.js'
import type { Content } from '../content.js'
import { index, type Document } from '../document.js'
import type { Region } from '../region.js'

/** What a Query Block reads, from its decoded props. */
interface Read {
  readonly query: QueryDescriptor<any, any, any>
  readonly input: (props: unknown) => unknown
  readonly select: unknown
  readonly first: ((props: unknown) => number) | undefined
}

const readKey = Metadata.key<Read>('foldkit-composition/remote', {
  merge: reads => reads.slice(-1),
  summarize: read => read.query.name,
})

/** A Block whose content is a page of a query's rows. */
export type QueryBlock<
  Name extends string,
  Props extends Schema.Top,
  Regions extends Readonly<Record<string, Region>>,
  Value,
> = Block<Name, Props, Regions> & {
  /** A node's rows, from the `data` a Renderer hands its view. */
  readonly rows: (data: unknown) => RemoteData<Page<Value>>
}

const initial: RemoteData<Page<never>> = { _tag: 'Initial' }

/** Something a Remote domain can read a query with: what `Remote.make` returns has it. */
export interface QueryReader<AppModel> {
  // Method syntax: a domain's registered-query constraint still fits.
  query(query: any, input: any, options: any): Projection<AppModel, unknown>
  /** The domain's contract: its `owner` is the application's. */
  readonly contract: { readonly owner?: object | undefined }
}

export const QueryBlock = {
  /**
   * A Block reading a page of `query`: `input` from its props, `select` of each
   * row, and `first` rows. The query must be registered with the Remote domain
   * that reads the page.
   */
  define: <
    const Name extends string,
    Props extends Schema.Top,
    Q extends QueryDescriptor<any, any, any>,
    Value,
    Entity extends string,
    const Regions extends Readonly<Record<string, Region>> = {},
  >(
    name: Name,
    config: {
      readonly Props: Props
      readonly regions?: Regions
      readonly provides: ReadonlyArray<Content>
      readonly query: Q
      readonly input: (props: Props['Type']) => QueryInput<Q>
      readonly select: EntitySelection<Value, Entity> & SelectsEntity<Entity, QueryEntity<Q>>
      readonly first?: (props: Props['Type']) => number
    },
  ): QueryBlock<Name, Props, Regions, Value> => {
    const block = Block.define(name, {
      Props: config.Props,
      ...(config.regions === undefined ? {} : { regions: config.regions }),
      provides: config.provides,
    }).pipe(
      Block.annotate(
        readKey.of({
          query: config.query,
          // Called only with props this Block's Schema decoded.
          input: config.input as (props: unknown) => unknown,
          select: config.select,
          first: config.first as ((props: unknown) => number) | undefined,
        }),
      ),
    )
    return Object.freeze({
      ...block,
      pipe: block.pipe,
      // The Renderer hands a node what `reads` read for it, which is this.
      rows: (data: unknown) => (data ?? initial) as RemoteData<Page<Value>>,
    })
  },

  /**
   * The page's reads as an active Surface, for `Data.wiring`, `Data.subscriptions`
   * or an SSR plan's `surfaces`: active while `documentOf` gives a page, reading
   * its Query Blocks. `Remote.resume(Data)` then carries what they read.
   */
  active: <AppModel>(
    name: string,
    data: QueryReader<AppModel>,
    catalog: Catalog,
    documentOf: (model: AppModel) => Document | undefined,
  ): ActiveSurface<AppModel> => ({
    name,
    owner: data.contract.owner ?? {},
    messages: [],
    projectionOf: model => {
      const document = documentOf(model)
      return document === undefined ? undefined : QueryBlock.reads(data, catalog, document)
    },
  }),

  /**
   * Every Query Block on the page as one Projection over the Model, keyed by
   * node id, or `undefined` when there is none. A node whose props do not
   * decode, or whose Block the Catalog lacks, reads nothing.
   */
  reads: <AppModel>(
    data: QueryReader<AppModel>,
    catalog: Catalog,
    document: Document,
  ): Projection<AppModel, Readonly<Record<string, unknown>>> | undefined => {
    const entries: Record<string, Projection<AppModel, unknown>> = {}
    for (const id of index(document).keys()) {
      const node = document.nodes[id]
      const block: AnyBlock | undefined =
        node === undefined ? undefined : Catalog.block(catalog, node.block)
      const [read] = block === undefined ? [] : readKey.get(block.metadata)
      if (node === undefined || block === undefined || read === undefined) continue
      const props = Block.decode(block, node.props)
      if (props._tag === 'Failure') continue
      const first = read.first?.(props.success)
      entries[id] = data.query(read.query, read.input(props.success), {
        select: read.select,
        ...(first === undefined ? {} : { first }),
      })
    }
    return Object.keys(entries).length === 0
      ? undefined
      : (Projection.struct(entries) as Projection<AppModel, Readonly<Record<string, unknown>>>)
  },
}
